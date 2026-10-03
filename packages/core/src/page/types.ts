import type { Draft } from 'immer'
import type { NavigationProvider } from '@aerofms/navigation'
import type { FmsState } from '../state/types'
import type { FmsEventInput, SimulationControl } from '../events/types'
import type { PerformanceModel } from '../performance/model'
import type { AircraftFmsAdapter } from '../engine/adapter'
import type { FlightPlan } from '@aerofms/shared'
import type { ModificationKind } from '../state/types'

export type FmsColor = 'white' | 'green' | 'cyan' | 'magenta' | 'amber' | 'yellow' | 'red' | 'gray' | 'blue'
export type FmsTextSize = 'L' | 'S'

export interface TextSpan {
  text: string
  color?: FmsColor
  size?: FmsTextSize
  inverse?: boolean
}

export interface FmsLine {
  left?: TextSpan[]
  center?: TextSpan[]
  right?: TextSpan[]
}

export type LskSide = 'L' | 'R'
export type LskRow = 1 | 2 | 3 | 4 | 5 | 6
/** e.g. "1L", "6R" */
export type LskId = `${LskRow}${LskSide}`

export const LSK_IDS: LskId[] = ['1L', '2L', '3L', '4L', '5L', '6L', '1R', '2R', '3R', '4R', '5R', '6R']

export interface FieldBinding {
  /** Stable identifier, used in FIELD_CHANGED events and tests (e.g. RTE.ORIGIN). */
  fieldId: string
  /** Glossary key for Explain Mode. */
  explainKey?: string
  /** Flight plan leg represented by this line (map cross highlight). */
  legId?: string
}

export interface FmsRow {
  label: FmsLine
  data: FmsLine
  fields?: Partial<Record<LskSide, FieldBinding>>
}

export interface FmsPageContent {
  title: FmsLine
  /** Current / total sub pages shown at the top right. */
  pageNumber?: { current: number; total: number }
  /** Exactly six rows (label + data line). */
  rows: FmsRow[]
  /** Airbus slew/scroll arrow indicators. */
  arrows?: { up?: boolean; down?: boolean; left?: boolean; right?: boolean }
}

export interface RenderContext {
  nav: NavigationProvider
  perf: PerformanceModel
  subPage: number
}

/** Context passed to mutating handlers. Handlers mutate the immer draft or throw FmsEntryError. */
export interface HandlerContext {
  nav: NavigationProvider
  perf: PerformanceModel
  now: number
  lsk?: LskId
  subPage: number
  /** Scratchpad content at the time of the press (message text ignored). */
  scratchpad: string
  /** True when the scratchpad holds the delete token (DELETE / CLR). */
  deleteMode: boolean
  emit(event: FmsEventInput): void
  nextId(): string
  /** Records a FIELD_CHANGED event. */
  fieldChanged(field: string, value: string | number | null): void
  adapter: AircraftFmsAdapter
  /**
   * Returns the plan a modification must be applied to: the active plan (direct edit)
   * or the MOD / TEMPORARY plan, created on first use, depending on the adapter policy.
   */
  editPlan(kind: ModificationKind): Draft<FlightPlan>
  /** Starts/pauses/etc. the standalone simulation (CDU SIM CTL page). */
  simControl(control: SimulationControl): void
  /** Opens another page (resets page context). */
  openPage(pageId: string, subPage?: number, context?: FmsState['currentPage']['context']): void
}

export type LskHandler = ((draft: Draft<FmsState>, ctx: HandlerContext) => void) & {
  /** Navigation prompts keep the scratchpad content (they do not consume an entry). */
  keepsScratchpad?: boolean
}

/** Marks a handler as a pure navigation prompt (scratchpad is preserved). */
export function navigationHandler(fn: (draft: Draft<FmsState>, ctx: HandlerContext) => void): LskHandler {
  const h = fn as LskHandler
  h.keepsScratchpad = true
  return h
}

export interface KeyBinding {
  key: string
  handler: LskHandler
}

export interface FmsPageDefinition {
  id: string
  title: string
  /** Number of sub pages (NEXT/PREV). */
  pageCount?: (state: FmsState, ctx: RenderContext) => number
  render(state: FmsState, ctx: RenderContext): FmsPageContent
  /** Index 0 → LSK 1L ... index 5 → LSK 6L */
  leftLskHandlers: Array<LskHandler | undefined>
  rightLskHandlers: Array<LskHandler | undefined>
  keyBindings?: KeyBinding[]
  /** Called when the page is opened (reset context, scroll, etc.). */
  onOpen?: (draft: Draft<FmsState>, ctx: HandlerContext) => void
}

export const emptyLine = (): FmsLine => ({})
export const span = (text: string, color: FmsColor = 'white', size: FmsTextSize = 'L'): TextSpan => ({ text, color, size })
export const small = (text: string, color: FmsColor = 'white'): TextSpan => ({ text, color, size: 'S' })
export const row = (label: FmsLine = {}, data: FmsLine = {}, fields?: FmsRow['fields']): FmsRow => ({ label, data, fields })

export function padRows(rows: FmsRow[]): FmsRow[] {
  const out = rows.slice(0, 6)
  while (out.length < 6) out.push(row())
  return out
}

export function lskSide(lsk: LskId): LskSide {
  return lsk.endsWith('L') ? 'L' : 'R'
}

export function lskRow(lsk: LskId): LskRow {
  return Number(lsk[0]) as LskRow
}
