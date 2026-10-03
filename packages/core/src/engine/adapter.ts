import type { Draft } from 'immer'
import type { NavigationProvider } from '@aerofms/navigation'
import type { FmsAction, FmsCommand, FmsEventInput, FmsKey, SimulationControl } from '../events/types'
import type { MessageCatalog } from '../messages/codes'
import type { FmsColor, FmsPageContent, FmsPageDefinition, LskId } from '../page/types'
import type { PerformanceResult } from '../performance/calc'
import type { PerformanceModel } from '../performance/model'
import type { FmsState, Manufacturer, ModificationKind } from '../state/types'

export interface AircraftCapabilities {
  lnav: boolean
  vnav: boolean
  holds: boolean
  offsets: boolean
  directTo: boolean
  routeDiscontinuity: boolean
  stepClimb: boolean
  secondaryFlightPlan: boolean
  alternateFlightPlan: boolean
  fuelPrediction: boolean
  progressPages: boolean
  fixInfo: boolean
  runwayExtension: boolean
  /** Boeing-style EXEC key with ACT/MOD plans. */
  execKey: boolean
  /** Airbus-style temporary flight plan with INSERT/ERASE. */
  temporaryFlightPlan: boolean
}

export type KeyRole = 'char' | 'function' | 'page' | 'exec' | 'clear' | 'delete' | 'navigation' | 'blank'

export interface KeyDefinition {
  /** Key code dispatched to the engine (e.g. "A", "RTE", "EXEC", "CLR"). */
  id: FmsKey
  /** Label printed on the key cap (aviation terminology stays in English). */
  label: string
  role: KeyRole
  /** Grid placement inside its keypad section. */
  row: number
  col: number
  colSpan?: number
  /** Has an annunciator light (EXEC). */
  light?: boolean
}

export interface KeypadSection {
  id: 'function' | 'alpha' | 'numeric'
  columns: number
  keys: KeyDefinition[]
}

export interface KeypadLayout {
  style: 'BOEING_CDU' | 'AIRBUS_MCDU' | 'AIRBUS_MFD_KCCU' | 'BOEING_MFK'
  sections: KeypadSection[]
}

export interface DisplaySpec {
  style: 'BOEING_CDU' | 'AIRBUS_MCDU' | 'AIRBUS_MFD' | 'BOEING_MFD_CDU'
  columns: number
  /** Annunciators shown beside the screen. */
  annunciators: Array<'EXEC' | 'MSG' | 'FAIL' | 'OFST' | 'DSPY' | 'FM' | 'MCDU_MENU' | 'IND' | 'RDY'>
}

export interface AircraftDefinition {
  /** e.g. B737-800 */
  id: string
  manufacturer: Manufacturer
  /** Family adapter group, e.g. B737NG, A320 */
  family: string
  model: string
  displayName: string
  fmsType: string
  systemLabel: string
  engine: string
  icaoType: string
  /** Features that are generic/approximate in this simulator (shown in About/aircraft info). */
  fidelityNotes: string[]
  quickStart: boolean
}

export interface AdapterContext {
  nav: NavigationProvider
  now: number
  emit(event: FmsEventInput): void
  nextId(): string
  /** Simulation control bridge (available when the engine has a simulator). */
  simulationControl?: (draft: Draft<FmsState>, control: SimulationControl) => void
}

export type PlanEditPolicy = 'DIRECT' | 'MODIFY'

export interface ValidationResult {
  ok: boolean
  code?: string
  normalized?: string | number
}

export interface SimulationStepper {
  step(draft: Draft<FmsState>, dtSec: number, ctx: AdapterContext & { adapter: AircraftFmsAdapter }): void
  control(draft: Draft<FmsState>, control: SimulationControl, ctx: AdapterContext & { adapter: AircraftFmsAdapter }): void
}

export interface InitializeOptions {
  sessionId: string
  name: string
  now: number
  nav: NavigationProvider
}

/**
 * Aircraft-specific FMS module. Each aircraft supplies its own pages, keypad,
 * capabilities, message texts, validation limits, performance model and
 * plan-modification behaviour (Boeing EXEC vs Airbus temporary flight plan).
 */
export interface AircraftFmsAdapter {
  readonly id: string
  readonly manufacturer: Manufacturer
  readonly aircraftModel: string
  readonly fmsType: string
  readonly definition: AircraftDefinition
  readonly display: DisplaySpec
  readonly messages: MessageCatalog
  readonly performanceModel: PerformanceModel
  readonly defaultPageId: string

  initialize(options: InitializeOptions): FmsState
  getPages(): FmsPageDefinition[]
  getPage(id: string): FmsPageDefinition | undefined
  getKeypad(): KeypadLayout
  getCapabilities(): AircraftCapabilities

  onKeyPress(key: FmsKey, state: FmsState, ctx: AdapterContext): FmsState
  onKeyLongPress(key: FmsKey, state: FmsState, ctx: AdapterContext): FmsState
  onLskPress(lsk: LskId, state: FmsState, ctx: AdapterContext): FmsState
  onCommand(command: FmsCommand, state: FmsState, ctx: AdapterContext): FmsState
  /** Opens a page by id (used by training, deep links and the Modern View). */
  openPage(pageId: string, state: FmsState, ctx: AdapterContext, subPage?: number): FmsState

  validateEntry(page: string, field: string, value: string): ValidationResult
  calculatePerformance(state: FmsState): PerformanceResult
  renderPage(state: FmsState, nav: NavigationProvider): FmsPageContent
  scratchpadDisplay(state: FmsState): { text: string; color: FmsColor }
  /** Whether a given modification goes straight to the active plan or creates a MOD/TMPY plan. */
  planEditPolicy(kind: ModificationKind, state: FmsState): PlanEditPolicy
  /** Condition monitoring after each action (messages, phase dependent state). */
  postProcess(draft: Draft<FmsState>, ctx: AdapterContext, action: FmsAction): void
  /** EXEC light / MOD indication. */
  isExecPending(state: FmsState): boolean
  /** Identifier used for turn points created by Direct-To (Boeing "(T/P)" vs Airbus "T-P"). */
  readonly turnPointIdent: string
}
