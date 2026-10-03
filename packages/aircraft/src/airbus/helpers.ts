import { displayedPlan, entryError, navigationHandler, opErase, row, small, span } from '@aerofms/core'
import type { FmsLine, FmsRow, FmsState, HandlerContext, LskHandler } from '@aerofms/core'
import type { Draft } from 'immer'

/** True when a temporary flight plan (TMPY) is pending INSERT/ERASE. */
export const hasTmpy = (state: FmsState): boolean => !!state.modifiedFlightPlan

/** Route text colour: yellow while a temporary flight plan is displayed, green otherwise. */
export const routeColor = (state: FmsState): 'yellow' | 'green' => (hasTmpy(state) ? 'yellow' : 'green')

/** MCDU title, or MFD-style "ACTIVE/xxx" title for A350. */
export function abTitle(state: FmsState, text: string, opts: { mfd?: boolean; mfdName?: string; color?: 'white' | 'green' | 'yellow' } = {}): FmsLine {
  const t = opts.mfd ? `ACTIVE/${opts.mfdName ?? text}` : text
  const tmpy = hasTmpy(state)
  return {
    left: tmpy ? [span('TMPY', 'yellow', 'S')] : undefined,
    center: [span(t, opts.color ?? 'white')],
  }
}

/** Row 6 with *ERASE / INSERT* when a TMPY exists, else the given prompts. */
export function tmpyRow(state: FmsState, label: FmsLine, left?: string, right?: string): FmsRow {
  if (hasTmpy(state)) return row(label, { left: [span('<ERASE', 'amber')], right: [span('INSERT*', 'amber')] })
  return row(label, { left: left ? [span(left)] : undefined, right: right ? [span(right)] : undefined })
}

export function insertTmpy(draft: Draft<FmsState>, ctx: HandlerContext): void {
  if (!draft.modifiedFlightPlan) return entryError('NOT_ALLOWED')
  draft.activeFlightPlan = { ...draft.modifiedFlightPlan, activated: true }
  draft.modifiedFlightPlan = undefined
  draft.modificationKind = undefined
  ctx.emit({ type: 'INSERT', detail: 'TMPY' })
}

/** 6L handler: ERASE when TMPY, else `fallback`. */
export function eraseOr(fallback?: LskHandler): LskHandler {
  const h: LskHandler = (draft, ctx) => {
    if (draft.modifiedFlightPlan) return opErase(draft, ctx)
    if (fallback) return fallback(draft, ctx)
    if (ctx.scratchpad) entryError('NOT_ALLOWED')
  }
  h.keepsScratchpad = true
  return h
}

/** 6R handler: INSERT when TMPY, else `fallback`. */
export function insertOr(fallback?: LskHandler): LskHandler {
  const h: LskHandler = (draft, ctx) => {
    if (draft.modifiedFlightPlan) return insertTmpy(draft, ctx)
    if (fallback) return fallback(draft, ctx)
    if (ctx.scratchpad) entryError('NOT_ALLOWED')
  }
  h.keepsScratchpad = true
  return h
}

export const goTo = (pageId: string, subPage = 1, context: FmsState['currentPage']['context'] = {}): LskHandler =>
  navigationHandler((_d, ctx) => ctx.openPage(pageId, subPage, context))

export const label = (left?: string, right?: string, center?: string): FmsLine => ({
  left: left ? [small(left)] : undefined,
  right: right ? [small(right)] : undefined,
  center: center ? [small(center)] : undefined,
})

/** The plan a revision page refers to (TMPY if pending). */
export const planFor = (state: FmsState) => displayedPlan(state)

export function legById(state: FmsState, id: unknown) {
  if (typeof id !== 'string') return undefined
  const plan = displayedPlan(state)
  const index = plan.elements.findIndex((e) => e.id === id)
  const el = plan.elements[index]
  return el && el.kind === 'LEG' ? { index, leg: el } : undefined
}
