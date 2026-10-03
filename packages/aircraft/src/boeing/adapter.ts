import {
  AbstractFmsAdapter,
  clearMessage,
  commitModification,
  computeVnavProfile,
  hasModification,
  postMessage,
} from '@aerofms/core'
import type {
  AdapterContext,
  AircraftCapabilities,
  DisplaySpec,
  FmsAction,
  FmsColor,
  FmsKey,
  FmsPageDefinition,
  FmsState,
  HandlerContext,
  KeypadLayout,
  MessageCatalog,
  ModificationKind,
  PlanEditPolicy,
} from '@aerofms/core'
import { current } from 'immer'
import type { Draft } from 'immer'
import { BOEING_MESSAGES } from '../common/messages'
import { simControlPage } from '../common/sim-page'
import { BOEING_737_KEYPAD, BOEING_777_KEYPAD } from './keypad'
import { identPage, initRefIndexPage, menuPage, msgRecallPage, navDataPage, offsetPage, posInitPage } from './pages/init'
import { legsPage } from './pages/legs'
import { altnPage, fixPage, fmcCommPage, holdPage, navRadioPage, progressPage } from './pages/nav'
import { approachRefPage, perfInitPage, takeoffRefPage, thrustLimitPage } from './pages/perf'
import { arrivalsPage, departuresPage, depArrIndexPage, rtePage } from './pages/route'
import { boeing737VnavPages, boeing777VnavPage } from './pages/vnav'
import type { BoeingVariant } from './variant'

/**
 * Boeing FMC module: ACT/MOD route concept with EXEC, scratchpad DEL key,
 * LEGS-based route editing (new waypoints create a ROUTE DISCONTINUITY).
 */
export class BoeingFmcAdapter extends AbstractFmsAdapter {
  readonly definition
  readonly display: DisplaySpec
  readonly messages: MessageCatalog = BOEING_MESSAGES
  readonly performanceModel
  readonly defaultPageId = 'IDENT'
  readonly turnPointIdent = '(T/P)'
  protected readonly deleteToken = 'DELETE'
  protected readonly clearCreatesDeleteToken = false
  protected readonly noFunctionError = 'INVALID_ENTRY' as const
  protected readonly messageColor: FmsColor = 'white'

  constructor(readonly variant: BoeingVariant) {
    super()
    this.definition = variant.definition
    this.performanceModel = variant.performanceModel
    this.display = {
      style: variant.displayStyle,
      columns: 24,
      annunciators: ['EXEC', 'MSG', 'FAIL', 'OFST', 'DSPY'],
    }
  }

  protected buildPages(): FmsPageDefinition[] {
    const v = this.variant
    const common = [
      identPage(v),
      posInitPage(),
      initRefIndexPage(v),
      navDataPage(),
      msgRecallPage(),
      offsetPage(),
      menuPage(),
      simControlPage('MENU', '<MENU'),
      rtePage(),
      depArrIndexPage(),
      departuresPage(),
      arrivalsPage(),
      legsPage(),
      perfInitPage(v),
      thrustLimitPage(v),
      takeoffRefPage(v),
      approachRefPage(v),
      progressPage(),
      fixPage(),
      holdPage(),
    ]
    const specific = v.cdu === '737' ? boeing737VnavPages() : [boeing777VnavPage(), altnPage(), navRadioPage(), fmcCommPage()]
    return [...common, ...specific, ...(v.extraPages?.(v) ?? [])]
  }

  getKeypad(): KeypadLayout {
    return this.variant.cdu === '737' ? BOEING_737_KEYPAD : BOEING_777_KEYPAD
  }

  getCapabilities(): AircraftCapabilities {
    return {
      lnav: true,
      vnav: true,
      holds: true,
      offsets: true,
      directTo: true,
      routeDiscontinuity: true,
      stepClimb: true,
      secondaryFlightPlan: false,
      alternateFlightPlan: this.variant.cdu === '777',
      fuelPrediction: true,
      progressPages: true,
      fixInfo: true,
      runwayExtension: false,
      execKey: true,
      temporaryFlightPlan: false,
    }
  }

  /** Before the first activation edits go straight into RTE 1; afterwards every change is a MOD awaiting EXEC. */
  planEditPolicy(_kind: ModificationKind, state: FmsState): PlanEditPolicy {
    return state.activeFlightPlan.activated ? 'MODIFY' : 'DIRECT'
  }

  protected pageForKey(key: FmsKey, state: FmsState): string | undefined {
    switch (key) {
      case 'INIT_REF': {
        if (state.flightPhase === 'PREFLIGHT') {
          if (!state.position.initialized) return 'POS_INIT'
          const p = state.performance
          if (p.zfwKg === undefined || p.fuelKg === undefined || p.costIndex === undefined || p.cruiseAltitudeFt === undefined) return 'PERF_INIT'
          return 'TAKEOFF_REF'
        }
        if (state.flightPhase === 'DESCENT' || state.flightPhase === 'APPROACH') return 'APPROACH_REF'
        return 'INIT_REF_INDEX'
      }
      case 'RTE':
        return 'RTE'
      case 'LEGS':
        return 'LEGS'
      case 'DEP_ARR':
        return 'DEP_ARR_INDEX'
      case 'HOLD':
        return 'HOLD'
      case 'PROG':
        return 'PROG'
      case 'FIX':
        return 'FIX'
      case 'MENU':
        return 'MENU'
      case 'CLB':
      case 'CRZ':
      case 'DES':
      case 'N1_LIMIT':
        return this.variant.cdu === '737' ? key : undefined
      case 'ALTN':
      case 'NAV_RAD':
      case 'FMC_COMM':
        return this.variant.cdu === '777' ? key : undefined
      default:
        return undefined
    }
  }

  protected handleFunctionKey(key: FmsKey, draft: Draft<FmsState>, ctx: HandlerContext): boolean {
    if (key === 'EXEC') {
      if (!hasModification(draft as FmsState)) return true
      const firstActivation = !draft.activeFlightPlan.activated
      commitModification(draft)
      ctx.emit({ type: 'EXEC', detail: firstActivation ? 'ACTIVATE' : 'COMMIT' })
      if (firstActivation && draft.guidance.lnav === 'OFF') draft.guidance.lnav = 'ARMED'
      if (draft.guidance.vnav === 'OFF') draft.guidance.vnav = 'ARMED'
      return true
    }
    if (key === 'VNAV' && this.variant.cdu === '777') {
      const sub = draft.flightPhase === 'CRUISE' ? 2 : draft.flightPhase === 'DESCENT' || draft.flightPhase === 'APPROACH' ? 3 : 1
      this.openPageInDraft(draft, ctx, 'VNAV', sub)
      return true
    }
    return false
  }

  override postProcess(draft: Draft<FmsState>, ctx: AdapterContext, action: FmsAction): void {
    if (action.type === 'SIM_TICK' && action.dtSec <= 0) return
    const plan = draft.activeFlightPlan
    // Condition-based messages.
    if (plan.activated && !draft.position.initialized && draft.flightPhase === 'PREFLIGHT') {
      postMessage(draft, 'ENTER_IRS_POSITION', this.messages, ctx.nextId, ctx.now)
    } else clearMessage(draft, 'ENTER_IRS_POSITION')
    if (plan.activated && draft.performance.cruiseAltitudeFt !== undefined) {
      const prof = computeVnavProfile(current(plan), current(draft.performance), this.performanceModel, ctx.nav)
      if (prof.unableCruiseAltitude) postMessage(draft, 'UNABLE_CRZ_ALT', this.messages, ctx.nextId, ctx.now, 'ALERT')
      else clearMessage(draft, 'UNABLE_CRZ_ALT')
      if (prof.warnings.includes('INSUFFICIENT_FUEL')) postMessage(draft, 'INSUFFICIENT_FUEL', this.messages, ctx.nextId, ctx.now, 'ALERT')
      else clearMessage(draft, 'INSUFFICIENT_FUEL')
    }
  }
}
