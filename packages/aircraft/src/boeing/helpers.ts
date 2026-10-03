import { displayedPlan, entryError, navigationHandler, opErase, small, span } from '@aerofms/core'
import type { FmsLine, FmsRow, FmsState, HandlerContext, LskHandler } from '@aerofms/core'
import type { Draft } from 'immer'

/** "RTE 1" / "ACT RTE 1" / "MOD RTE 1" */
export function rteTitle(state: FmsState, suffix: string): FmsLine {
  const plan = state.activeFlightPlan
  if (state.modifiedFlightPlan) return { center: [span(`MOD RTE 1 ${suffix}`.trim(), 'white')] }
  if (plan.activated) return { center: [span('ACT ', 'white', 'S'), span(`RTE 1 ${suffix}`.trim(), 'white')] }
  return { center: [span(`RTE 1 ${suffix}`.trim(), 'white')] }
}

export function modOrActTitle(state: FmsState, text: string, perfMod = false): FmsLine {
  const mod = perfMod ? !!state.modifiedPerformance : !!state.modifiedFlightPlan
  if (mod) return { center: [span(`MOD ${text}`)] }
  if (state.activeFlightPlan.activated) return { center: [span('ACT ', 'white', 'S'), span(text)] }
  return { center: [span(text)] }
}

export const separatorLabel = (): FmsLine => ({ left: [small('------------------------', 'white')] })

/** Row 6: "<ERASE" when a modification is pending, else the given left prompt. */
export function eraseOr(state: FmsState, left?: string, right?: string): FmsRow {
  const l = state.modifiedFlightPlan || state.modifiedPerformance ? '<ERASE' : left
  return {
    label: separatorLabel(),
    data: { left: l ? [span(l)] : undefined, right: right ? [span(right)] : undefined },
  }
}

export function eraseOrNavigate(pageId?: string): LskHandler {
  const handler = (draft: Draft<FmsState>, ctx: HandlerContext): void => {
    if (draft.modifiedFlightPlan || draft.modifiedPerformance) {
      opErase(draft, ctx)
      return
    }
    if (!pageId) entryError('INVALID_ENTRY')
    else ctx.openPage(pageId)
  }
  return handler
}

export const goTo = (pageId: string, subPage = 1): LskHandler => navigationHandler((_draft, ctx) => ctx.openPage(pageId, subPage))

/** Requires an empty scratchpad (pure prompt) – otherwise INVALID ENTRY. */
export function requireEmpty(ctx: HandlerContext): void {
  if (ctx.scratchpad || ctx.deleteMode) entryError('INVALID_ENTRY')
}

export function planOf(state: FmsState) {
  return displayedPlan(state)
}
