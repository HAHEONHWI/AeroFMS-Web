import { produce } from 'immer'
import type { Draft } from 'immer'
import type { NavigationProvider } from '@aerofms/navigation'
import type { FmsAction, FmsCommand, FmsEventInput, FmsKey } from '../events/types'
import { FmsEntryError } from '../messages/codes'
import type { MessageCatalog, MessageCode } from '../messages/codes'
import type { FmsColor, FmsPageContent, FmsPageDefinition, HandlerContext, LskId } from '../page/types'
import { lskRow, lskSide, padRows } from '../page/types'
import { calculatePerformance } from '../performance/calc'
import type { PerformanceResult } from '../performance/calc'
import type { PerformanceModel } from '../performance/model'
import { appendChar, clearAll, clearShort, deleteKey, dismissMessage, keyToChar, plusMinus, showMessage } from '../scratchpad/scratchpad'
import { createInitialFmsState } from '../state/initial'
import type { FmsState, Manufacturer, ModificationKind } from '../state/types'
import { displayedPerformance, hasModification, planForEdit } from '../execution/modification'
import * as ops from './operations'
import type {
  AdapterContext,
  AircraftCapabilities,
  AircraftDefinition,
  AircraftFmsAdapter,
  DisplaySpec,
  InitializeOptions,
  KeypadLayout,
  PlanEditPolicy,
  ValidationResult,
} from './adapter'
import { parseCostIndex, parseCruiseAltitude, parseWeightKg, isIcao } from '../validation/parsers'

/**
 * Shared machinery for page-driven CDU/MCDU adapters. Aircraft adapters supply the
 * page set, keypad, page-key routing, message texts and edit policies.
 */
export abstract class AbstractFmsAdapter implements AircraftFmsAdapter {
  abstract readonly definition: AircraftDefinition
  abstract readonly display: DisplaySpec
  abstract readonly messages: MessageCatalog
  abstract readonly performanceModel: PerformanceModel
  abstract readonly defaultPageId: string
  abstract readonly turnPointIdent: string
  /** Text shown in the scratchpad for the deletion token. */
  protected abstract readonly deleteToken: string
  /** Airbus: CLR on empty scratchpad creates the CLR token. Boeing: DEL key does that. */
  protected abstract readonly clearCreatesDeleteToken: boolean
  /** Error raised when an LSK without function is pressed with scratchpad data. */
  protected abstract readonly noFunctionError: MessageCode
  protected abstract readonly messageColor: FmsColor

  protected abstract buildPages(): FmsPageDefinition[]
  abstract getKeypad(): KeypadLayout
  abstract getCapabilities(): AircraftCapabilities
  /** Maps a page/function key to the page that opens (may depend on state). */
  protected abstract pageForKey(key: FmsKey, state: FmsState): string | undefined
  abstract planEditPolicy(kind: ModificationKind, state: FmsState): PlanEditPolicy
  /** Aircraft specific function keys (EXEC, DIR, OVFY ...). Return true when handled. */
  protected abstract handleFunctionKey(key: FmsKey, draft: Draft<FmsState>, ctx: HandlerContext): boolean

  private pageMap?: Map<string, FmsPageDefinition>

  get id(): string {
    return this.definition.id
  }
  get manufacturer(): Manufacturer {
    return this.definition.manufacturer
  }
  get aircraftModel(): string {
    return this.definition.model
  }
  get fmsType(): string {
    return this.definition.fmsType
  }

  getPages(): FmsPageDefinition[] {
    return [...this.pages().values()]
  }

  getPage(id: string): FmsPageDefinition | undefined {
    return this.pages().get(id)
  }

  private pages(): Map<string, FmsPageDefinition> {
    if (!this.pageMap) this.pageMap = new Map(this.buildPages().map((p) => [p.id, p]))
    return this.pageMap
  }

  initialize(options: InitializeOptions): FmsState {
    const d = this.definition
    return createInitialFmsState({
      aircraft: {
        aircraftId: d.id,
        adapterId: this.id,
        manufacturer: d.manufacturer,
        model: d.model,
        fmsType: d.fmsType,
        engine: d.engine,
      },
      sessionId: options.sessionId,
      name: options.name,
      now: options.now,
      nav: options.nav,
      defaultPageId: this.defaultPageId,
    })
  }

  // ───────────── Mutation infrastructure ─────────────

  protected handlerContext(draft: Draft<FmsState>, actx: AdapterContext, lsk?: LskId): HandlerContext {
    const ctx: HandlerContext = {
      nav: actx.nav,
      perf: this.performanceModel,
      now: actx.now,
      lsk,
      subPage: draft.currentPage.subPage,
      scratchpad: draft.scratchpad.text,
      deleteMode: draft.scratchpad.deleteMode,
      emit: actx.emit,
      nextId: actx.nextId,
      fieldChanged: (field, value) => actx.emit({ type: 'FIELD_CHANGED', detail: field, value }),
      adapter: this,
      editPlan: (kind) => planForEdit(draft, kind, this.planEditPolicy(kind, draft as FmsState)),
      simControl: (control) => {
        if (!actx.simulationControl) throw new FmsEntryError('NOT_ALLOWED', 'NO_SIMULATOR')
        actx.simulationControl(draft, control)
        actx.emit({ type: 'SIMULATION_EVENT', detail: control.kind })
      },
      openPage: (pageId, subPage = 1, context = {}) => this.openPageInDraft(draft, ctx, pageId, subPage, context),
    }
    return ctx
  }

  /**
   * Runs `fn` on an immer draft. Entry errors roll back every change made by `fn`
   * and display the adapter-specific message in the scratchpad instead.
   */
  protected mutate(
    state: FmsState,
    actx: AdapterContext,
    fn: (draft: Draft<FmsState>, ctx: HandlerContext) => void,
    lsk?: LskId,
  ): FmsState {
    const buffered: FmsEventInput[] = []
    const local: AdapterContext = { ...actx, emit: (e) => buffered.push(e) }
    try {
      const next = produce(state, (draft) => {
        fn(draft, this.handlerContext(draft, local, lsk))
      })
      for (const e of buffered) actx.emit(e)
      return next
    } catch (e) {
      if (e instanceof FmsEntryError) return this.rejectEntry(state, actx, e)
      // Defensive: never crash the emulator on an unexpected bug. Report and keep state.
      actx.emit({ type: 'ERROR', detail: 'INTERNAL', value: e instanceof Error ? e.message : String(e) })
      return produce(state, (draft) => {
        showMessage(draft, 'INVALID_ENTRY', this.messages.INVALID_ENTRY)
      })
    }
  }

  protected rejectEntry(state: FmsState, actx: AdapterContext, e: FmsEntryError): FmsState {
    actx.emit({ type: 'ERROR', detail: e.code, value: e.detail ?? state.scratchpad.text })
    return produce(state, (draft) => {
      showMessage(draft, e.code, this.messages[e.code] ?? this.messages.INVALID_ENTRY)
    })
  }

  // ───────────── Keys ─────────────

  onKeyPress(key: FmsKey, state: FmsState, actx: AdapterContext): FmsState {
    return this.mutate(state, actx, (draft, ctx) => this.handleKey(key, draft, ctx))
  }

  onKeyLongPress(key: FmsKey, state: FmsState, actx: AdapterContext): FmsState {
    return this.mutate(state, actx, (draft, ctx) => {
      if (key === 'CLR') clearAll(draft)
      else this.handleKey(key, draft, ctx)
    })
  }

  protected handleKey(key: FmsKey, draft: Draft<FmsState>, ctx: HandlerContext): void {
    const ch = keyToChar(key)
    if (ch !== undefined) {
      appendChar(draft, ch)
      return
    }
    switch (key) {
      case 'CLR': {
        const sp = draft.scratchpad
        const pending = draft.messages.filter((m) => !m.acknowledged)
        if (!sp.text && !sp.message && !sp.deleteMode && pending.length) {
          // CLR on a displayed advisory/alert message acknowledges it (recallable later).
          const latest = pending[pending.length - 1]
          if (latest) latest.acknowledged = true
          return
        }
        clearShort(draft, { emptyClearCreatesDeleteToken: this.clearCreatesDeleteToken })
        return
      }
      case 'DEL':
        deleteKey(draft)
        return
      case '+/-':
        plusMinus(draft)
        return
      case 'NEXT_PAGE':
        this.changeSubPage(draft, ctx, 1)
        return
      case 'PREV_PAGE':
        this.changeSubPage(draft, ctx, -1)
        return
    }
    if (this.handleFunctionKey(key, draft, ctx)) return
    const page = this.getPage(draft.currentPage.pageId)
    const binding = page?.keyBindings?.find((b) => b.key === key)
    if (binding) {
      binding.handler(draft, ctx)
      return
    }
    const target = this.pageForKey(key, draft as FmsState)
    if (target) this.openPageInDraft(draft, ctx, target)
  }

  protected changeSubPage(draft: Draft<FmsState>, ctx: HandlerContext, delta: number): void {
    const page = this.getPage(draft.currentPage.pageId)
    if (!page?.pageCount) return
    const total = page.pageCount(draft as FmsState, { nav: ctx.nav, perf: this.performanceModel, subPage: draft.currentPage.subPage })
    if (total <= 1) return
    let next = draft.currentPage.subPage + delta
    if (next > total) next = 1
    if (next < 1) next = total
    draft.currentPage.subPage = next
  }

  openPageInDraft(draft: Draft<FmsState>, ctx: HandlerContext, pageId: string, subPage = 1, context: FmsState['currentPage']['context'] = {}): void {
    const page = this.getPage(pageId)
    if (!page) throw new FmsEntryError('NOT_ALLOWED', pageId)
    draft.currentPage = { pageId, subPage, context }
    page.onOpen?.(draft, { ...ctx, subPage })
  }

  openPage(pageId: string, state: FmsState, actx: AdapterContext, subPage = 1): FmsState {
    return this.mutate(state, actx, (draft, ctx) => this.openPageInDraft(draft, ctx, pageId, subPage))
  }

  // ───────────── Line select keys ─────────────

  onLskPress(lsk: LskId, state: FmsState, actx: AdapterContext): FmsState {
    return this.mutate(
      state,
      actx,
      (draft, baseCtx) => {
        dismissMessage(draft)
        const ctx: HandlerContext = {
          ...baseCtx,
          scratchpad: draft.scratchpad.text,
          deleteMode: draft.scratchpad.deleteMode,
          lsk,
        }
        const page = this.getPage(draft.currentPage.pageId)
        const idx = lskRow(lsk) - 1
        const handler = lskSide(lsk) === 'L' ? page?.leftLskHandlers[idx] : page?.rightLskHandlers[idx]
        if (!handler) {
          if (ctx.scratchpad || ctx.deleteMode) throw new FmsEntryError(this.noFunctionError)
          return
        }
        const beforeText = draft.scratchpad.text
        const beforeDelete = draft.scratchpad.deleteMode
        handler(draft, ctx)
        const consumedInput = (beforeText.length > 0 || beforeDelete) && !handler.keepsScratchpad
        const untouched = draft.scratchpad.text === beforeText && draft.scratchpad.deleteMode === beforeDelete
        if (consumedInput && untouched && !draft.scratchpad.message) {
          draft.scratchpad.text = ''
          draft.scratchpad.deleteMode = false
        }
      },
      lsk,
    )
  }

  // ───────────── Domain commands (Modern View / connector / scenarios) ─────────────

  onCommand(command: FmsCommand, state: FmsState, actx: AdapterContext): FmsState {
    return this.mutate(state, actx, (draft, ctx) => this.applyCommand(command, draft, ctx))
  }

  protected applyCommand(command: FmsCommand, draft: Draft<FmsState>, ctx: HandlerContext): void {
    switch (command.kind) {
      case 'SET_ORIGIN':
        return ops.opSetOrigin(draft, ctx, command.icao)
      case 'SET_DESTINATION':
        return ops.opSetDestination(draft, ctx, command.icao)
      case 'SET_FLIGHT_NUMBER': {
        const plan = ctx.editPlan('ROUTE')
        plan.flightNumber = command.value.trim().toUpperCase().slice(0, 10)
        ctx.fieldChanged('FLT_NO', plan.flightNumber)
        return
      }
      case 'SET_DEPARTURE_RUNWAY':
        return ops.opSetDepartureRunway(ctx, command.runway)
      case 'SET_SID':
        return ops.opSetProcedure(ctx, 'SID', command.procedureId, command.transition)
      case 'SET_STAR':
        return ops.opSetProcedure(ctx, 'STAR', command.procedureId, command.transition)
      case 'SET_APPROACH':
        return ops.opSetProcedure(ctx, 'APPROACH', command.procedureId, command.transition)
      case 'APPEND_ROUTE':
        return ops.opAppendRoute(ctx, command.via, command.to)
      case 'DIRECT_TO':
        return ops.opDirectTo(draft, ctx, command.ident)
      case 'DELETE_LEG':
        return ops.opDeleteLeg(ctx, command.legId, this.getCapabilities().temporaryFlightPlan)
      case 'INSERT_WAYPOINT':
        return ops.opInsertWaypoint(ctx, command.beforeLegId, command.ident, true)
      case 'CLOSE_DISCONTINUITY':
        return ops.opCloseDiscontinuity(ctx, command.discontinuityId)
      case 'SET_CRUISE_ALTITUDE':
        return ops.opSetCruiseAltitude(draft, ctx, command.value)
      case 'SET_COST_INDEX':
        return ops.opSetCostIndex(draft, ctx, command.value)
      case 'SET_ZFW':
        return ops.opSetZfw(draft, ctx, command.value)
      case 'SET_FUEL':
        return ops.opSetFuel(draft, ctx, command.value)
      case 'SET_RESERVES':
        return ops.opSetReserves(draft, ctx, command.value)
      case 'SET_POSITION_FROM_AIRPORT':
        return ops.opSetPositionFromAirport(draft, ctx, command.icao)
      case 'EXECUTE':
        return ops.opExecute(draft, ctx)
      case 'ACTIVATE_ROUTE':
        if (draft.modifiedFlightPlan) draft.activeFlightPlan = draft.modifiedFlightPlan
        draft.modifiedFlightPlan = undefined
        draft.modificationKind = undefined
        draft.activeFlightPlan.activated = true
        if (draft.guidance.lnav === 'OFF') draft.guidance.lnav = 'ARMED'
        ctx.fieldChanged('ACTIVATE', 'SETUP')
        return
      case 'ERASE':
        return ops.opErase(draft, ctx)
      case 'LOAD_FLIGHT_PLAN':
        return ops.opLoadFlightPlan(draft, ctx, command.plan)
    }
  }

  // ───────────── Rendering ─────────────

  renderPage(state: FmsState, nav: NavigationProvider): FmsPageContent {
    const page = this.getPage(state.currentPage.pageId) ?? this.getPage(this.defaultPageId)
    if (!page) return { title: {}, rows: padRows([]) }
    const rctx = { nav, perf: this.performanceModel, subPage: state.currentPage.subPage }
    const content = page.render(state, rctx)
    const total = page.pageCount?.(state, rctx)
    return {
      ...content,
      rows: padRows(content.rows),
      pageNumber: content.pageNumber ?? (total && total > 0 ? { current: Math.min(state.currentPage.subPage, total), total } : undefined),
    }
  }

  scratchpadDisplay(state: FmsState): { text: string; color: FmsColor } {
    if (state.scratchpad.message) return { text: state.scratchpad.message.text, color: this.messageColor }
    if (state.scratchpad.deleteMode) return { text: this.deleteToken, color: 'white' }
    if (!state.scratchpad.text) {
      const pending = state.messages.filter((m) => !m.acknowledged)
      const latest = pending[pending.length - 1]
      if (latest) return { text: latest.text, color: latest.kind === 'ALERT' ? 'amber' : this.messageColor }
    }
    return { text: state.scratchpad.text, color: 'white' }
  }

  isExecPending(state: FmsState): boolean {
    return this.getCapabilities().execKey && hasModification(state)
  }

  calculatePerformance(state: FmsState): PerformanceResult {
    return calculatePerformance(this.performanceModel, displayedPerformance(state))
  }

  validateEntry(_page: string, field: string, value: string): ValidationResult {
    const m = this.performanceModel
    const check = (v: number | string | undefined): ValidationResult =>
      v === undefined ? { ok: false, code: 'INVALID_ENTRY' } : { ok: true, normalized: v }
    switch (field) {
      case 'CRZ_ALT':
        return check(parseCruiseAltitude(value, m.maxCertifiedAltitudeFt))
      case 'COST_INDEX':
        return check(parseCostIndex(value, m.costIndexRange))
      case 'ZFW':
        return check(parseWeightKg(value, m.oewKg, m.mzfwKg * 1.05))
      case 'FUEL':
        return check(parseWeightKg(value, 0, m.maxFuelKg))
      case 'RESERVES':
        return check(parseWeightKg(value, 0, m.maxFuelKg / 2))
      case 'ORIGIN':
      case 'DESTINATION':
        return check(isIcao(value) ? value.toUpperCase() : undefined)
      default:
        return { ok: value.trim().length > 0, normalized: value.trim().toUpperCase() }
    }
  }

   
  postProcess(_draft: Draft<FmsState>, _ctx: AdapterContext, _action: FmsAction): void {}
}
