import { current } from 'immer'
import type { Draft } from 'immer'
import {
  AbstractFmsAdapter,
  clearMessage,
  computeVnavProfile,
  grossWeightKg,
  maxAltitudeFt,
  postMessage,
  setScratchpad,
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
  InitializeOptions,
  KeypadLayout,
  MessageCatalog,
  ModificationKind,
  PlanEditPolicy,
} from '@aerofms/core'
import { AIRBUS_MESSAGES } from '../common/messages'
import { simControlPage } from '../common/sim-page'
import { AIRBUS_KCCU_KEYPAD, AIRBUS_MCDU_KEYPAD } from './keypad'
import {
  abArrivalsPage,
  abDeparturesPage,
  abHoldPage,
  airwaysPage,
  destinationScroll,
  dirToPage,
  fplnPage,
  latRevPage,
  secFplnPage,
  secIndexPage,
  vertRevPage,
} from './pages/fpln'
import { dataPages, fuelPredPage, initPage, irsInitPage } from './pages/init'
import { abFixInfoPage, abOffsetPage, atcCommPage, mcduMenuPage, progPage, radNavPage } from './pages/misc'
import { perfPage, perfSubPageFor } from './pages/perf'
import type { AirbusVariant } from './variant'

const TEMPORARY_KINDS: ReadonlySet<ModificationKind> = new Set<ModificationKind>([
  'LAT_REV',
  'AIRWAYS',
  'DIRECT_TO',
  'HOLD',
  'DEPARTURE',
  'ARRIVAL',
  'OFFSET',
])

/**
 * Airbus FMGS / MCDU module. No EXEC key: lateral revisions build a TEMPORARY flight plan
 * (yellow) that is committed with INSERT* or discarded with *ERASE. CLR on an empty
 * scratchpad produces the CLR deletion token; OVFY toggles overfly.
 */
export class AirbusFmgsAdapter extends AbstractFmsAdapter {
  readonly definition
  readonly display: DisplaySpec
  readonly messages: MessageCatalog = AIRBUS_MESSAGES
  readonly performanceModel
  readonly defaultPageId = 'MCDU_MENU'
  readonly turnPointIdent = 'T-P'
  protected readonly deleteToken = 'CLR'
  protected readonly clearCreatesDeleteToken = true
  protected readonly noFunctionError = 'NOT_ALLOWED' as const
  protected readonly messageColor: FmsColor = 'white'

  constructor(readonly variant: AirbusVariant) {
    super()
    this.definition = variant.definition
    this.performanceModel = variant.performanceModel
    this.display = {
      style: variant.display,
      columns: 24,
      annunciators: variant.display === 'AIRBUS_MCDU' ? ['FM', 'MCDU_MENU', 'IND', 'RDY', 'FAIL'] : ['FM'],
    }
  }

  override initialize(options: InitializeOptions): FmsState {
    const s = super.initialize(options)
    return { ...s, activeFlightPlan: { ...s.activeFlightPlan, activated: true } }
  }

  protected buildPages(): FmsPageDefinition[] {
    const v = this.variant
    return [
      mcduMenuPage(),
      simControlPage('MCDU_MENU', '<RETURN'),
      initPage(v),
      irsInitPage(v),
      fuelPredPage(v),
      ...dataPages(v),
      fplnPage(v),
      latRevPage(),
      vertRevPage(),
      airwaysPage(),
      abDeparturesPage(),
      abArrivalsPage(),
      abHoldPage(),
      dirToPage(),
      secIndexPage(v),
      secFplnPage(v),
      perfPage(v),
      progPage(v),
      radNavPage(v),
      atcCommPage(),
      abFixInfoPage(),
      abOffsetPage(),
    ]
  }

  getKeypad(): KeypadLayout {
    return this.variant.display === 'AIRBUS_MFD' ? AIRBUS_KCCU_KEYPAD : AIRBUS_MCDU_KEYPAD
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
      secondaryFlightPlan: true,
      alternateFlightPlan: true,
      fuelPrediction: true,
      progressPages: true,
      fixInfo: true,
      runwayExtension: false,
      execKey: false,
      temporaryFlightPlan: true,
    }
  }

  /** Lateral revisions create a TEMPORARY flight plan; CLR deletions and constraints apply directly. */
  planEditPolicy(kind: ModificationKind): PlanEditPolicy {
    return TEMPORARY_KINDS.has(kind) ? 'MODIFY' : 'DIRECT'
  }

  protected pageForKey(key: FmsKey): string | undefined {
    const map: Record<string, string> = {
      DIR: 'DIR_TO',
      PROG: 'PROG',
      INIT: 'INIT',
      DATA: 'DATA_INDEX',
      F_PLN: 'F_PLN',
      RAD_NAV: 'RAD_NAV',
      FUEL_PRED: 'FUEL_PRED',
      SEC_F_PLN: 'SEC_INDEX',
      ATC_COMM: 'ATC_COMM',
      MCDU_MENU: 'MCDU_MENU',
    }
    return map[key]
  }

  protected handleFunctionKey(key: FmsKey, draft: Draft<FmsState>, ctx: HandlerContext): boolean {
    switch (key) {
      case 'OVFY':
        if (!draft.scratchpad.text && !draft.scratchpad.message) setScratchpad(draft, 'Δ')
        return true
      case 'PERF':
        this.openPageInDraft(draft, ctx, 'PERF', perfSubPageFor(draft as FmsState))
        return true
      case 'AIRPORT':
        this.openPageInDraft(draft, ctx, 'F_PLN', 1, { scroll: destinationScroll(draft as FmsState) })
        return true
      case 'DIR':
        this.openPageInDraft(draft, ctx, 'DIR_TO', 1, {})
        return true
      default:
        return false
    }
  }

  override postProcess(draft: Draft<FmsState>, ctx: AdapterContext, action: FmsAction): void {
    if (action.type === 'SIM_TICK' && action.dtSec <= 0) return
    const perf = draft.performance
    const gw = grossWeightKg(perf as FmsState['performance'])
    if (gw !== undefined && perf.cruiseAltitudeFt !== undefined && perf.cruiseAltitudeFt > maxAltitudeFt(this.performanceModel, gw)) {
      postMessage(draft, 'UNABLE_CRZ_ALT', this.messages, ctx.nextId, ctx.now)
    } else clearMessage(draft, 'UNABLE_CRZ_ALT')
    if (draft.activeFlightPlan.destination && perf.fuelKg !== undefined && perf.cruiseAltitudeFt !== undefined) {
      const prof = computeVnavProfile(current(draft.activeFlightPlan), current(perf), this.performanceModel, ctx.nav)
      if (prof.warnings.includes('INSUFFICIENT_FUEL')) postMessage(draft, 'INSUFFICIENT_FUEL', this.messages, ctx.nextId, ctx.now, 'ALERT')
      else clearMessage(draft, 'INSUFFICIENT_FUEL')
    }
  }
}
