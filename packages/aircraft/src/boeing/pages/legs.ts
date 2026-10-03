import { isDiscontinuity, isLeg } from '@aerofms/shared'
import type { FlightPlan, FlightPlanLeg } from '@aerofms/shared'
import {
  clearLegConstraints,
  computeVnavProfile,
  connectToDownstream,
  deleteElement,
  displayedPerformance,
  displayedPlan,
  entryError,
  findLegIndex,
  insertWaypointBefore,
  opDirectTo,
  parseSpeedAltitudeConstraint,
  resolveWaypointEntry,
  row,
  setLegConstraints,
  setScratchpad,
  small,
  span,
  trackActiveLeg,
  trueToMag,
} from '@aerofms/core'
import type { FmsPageDefinition, FmsRow, FmsState, HandlerContext, LskHandler, RenderContext, TextSpan } from '@aerofms/core'
import type { Draft } from 'immer'
import { boxes, fmtAlt, fmtBoeingAltConstraint, fmtCourse, fmtDistance, fmtMach } from '../../common/format'
import { eraseOr, rteTitle, separatorLabel } from '../helpers'

/** A display row of the LEGS page: a leg, a discontinuity, or a hold attached to the previous leg. */
type LegsRow =
  | { kind: 'LEG'; index: number; leg: FlightPlanLeg; afterDisco: boolean }
  | { kind: 'DISCO'; index: number }
  | { kind: 'HOLD'; index: number; leg: FlightPlanLeg }

export function legsRows(plan: FlightPlan): LegsRow[] {
  const rows: LegsRow[] = []
  const start = Math.max(plan.elements.length > 1 ? 1 : 0, plan.activeLegIndex)
  let afterDisco = false
  for (let i = start; i < plan.elements.length; i++) {
    const e = plan.elements[i]
    if (isDiscontinuity(e)) {
      rows.push({ kind: 'DISCO', index: i })
      afterDisco = true
      continue
    }
    if (!isLeg(e)) continue
    rows.push({ kind: 'LEG', index: i, leg: e, afterDisco })
    afterDisco = false
    if (e.hold) rows.push({ kind: 'HOLD', index: i, leg: e })
  }
  return rows
}

const rowFor = (state: FmsState, subPage: number, r: number): LegsRow | undefined =>
  legsRows(displayedPlan(state))[(subPage - 1) * 5 + (r - 1)]

function rightData(state: FmsState, leg: FlightPlanLeg, ctx: RenderContext): TextSpan[] {
  const trans = state.performance.transitionAltitudeFt ?? 18000
  if (leg.speedConstraint || leg.altitudeConstraint) {
    const spd = leg.speedConstraint ? String(leg.speedConstraint.speedKt) : '---'
    return [span(`${spd}/${fmtBoeingAltConstraint(leg.altitudeConstraint, trans).padStart(6, ' ')}`, 'white')]
  }
  const profile = computeVnavProfile(displayedPlan(state), displayedPerformance(state), ctx.perf, ctx.nav)
  const pred = profile.legs.find((p) => p.legId === leg.id)
  if (!pred) return [span('---/------', 'white', 'S')]
  const spd = pred.phase === 'CRUISE' ? fmtMach(state.performance.cruise.mach ?? ctx.perf.cruise.machCi0) : String(pred.speedKt)
  return [span(`${spd}/${fmtAlt(pred.altitudeFt, trans).padStart(6, ' ')}`, 'white', 'S')]
}

export function legsPage(): FmsPageDefinition {
  const left =
    (r: number): LskHandler =>
    (draft, ctx) => {
      const lr = rowFor(draft as FmsState, ctx.subPage, r)
      if (!lr) {
        if (ctx.scratchpad) entryError('INVALID_ENTRY')
        return
      }
      if (lr.kind === 'HOLD') {
        if (ctx.deleteMode) {
          const plan = ctx.editPlan('HOLD')
          const leg = plan.elements[lr.index]
          if (isLeg(leg)) leg.hold = undefined
          return
        }
        ctx.openPage('HOLD')
        return
      }
      if (ctx.deleteMode) {
        const plan = ctx.editPlan('ROUTE')
        deleteElement(plan, ctx.nextId, lr.index, { allowDiscontinuityDelete: false })
        ctx.fieldChanged('LEG_DELETED', lr.kind === 'LEG' ? lr.leg.waypoint.ident : 'DISCONTINUITY')
        return
      }
      if (!ctx.scratchpad) {
        if (lr.kind === 'LEG') {
          setScratchpad(draft, lr.leg.waypoint.ident)
          draft.navigation.highlightedLegId = lr.leg.id
        }
        return
      }
      enterWaypoint(draft, ctx, lr)
    }

  const right =
    (r: number): LskHandler =>
    (draft, ctx) => {
      const lr = rowFor(draft as FmsState, ctx.subPage, r)
      if (!lr || lr.kind !== 'LEG') {
        if (ctx.scratchpad || ctx.deleteMode) entryError('INVALID_ENTRY')
        return
      }
      const plan = ctx.editPlan('ROUTE')
      const leg = plan.elements[lr.index]
      if (!isLeg(leg)) return entryError('INVALID_ENTRY')
      if (ctx.deleteMode) {
        clearLegConstraints(leg)
        ctx.fieldChanged('CONSTRAINT', `${leg.waypoint.ident} DELETED`)
        return
      }
      if (!ctx.scratchpad) return
      const parsed = parseSpeedAltitudeConstraint(ctx.scratchpad, ctx.perf.maxCertifiedAltitudeFt)
      if (!parsed) return entryError('INVALID_ENTRY')
      setLegConstraints(leg, parsed)
      ctx.fieldChanged('CONSTRAINT', `${leg.waypoint.ident} ${ctx.scratchpad}`)
    }

  const sixLeft: LskHandler = (draft, ctx) => {
    if (draft.modifiedFlightPlan || draft.modifiedPerformance) {
      draft.modifiedFlightPlan = undefined
      draft.modifiedPerformance = undefined
      draft.modificationKind = undefined
      ctx.emit({ type: 'ERASE', detail: 'DISCARD' })
      return
    }
    if (ctx.scratchpad) entryError('INVALID_ENTRY')
  }

  const sixRight: LskHandler = (draft) => {
    const plan = displayedPlan(draft as FmsState)
    if (!plan.activated && !draft.modifiedFlightPlan) {
      if (!plan.origin || !plan.destination) return entryError('INVALID_ENTRY')
      draft.modifiedFlightPlan = { ...(JSON.parse(JSON.stringify(plan)) as FlightPlan), activated: true }
      draft.modificationKind = 'ACTIVATE'
      return
    }
    // STEP> : steps the map centre (highlight) through the legs.
    const legs = plan.elements.filter(isLeg)
    const cur = legs.findIndex((l) => l.id === draft.navigation.highlightedLegId)
    const next = legs[(cur + 1) % Math.max(1, legs.length)]
    draft.navigation.highlightedLegId = next?.id
  }
  sixRight.keepsScratchpad = true

  return {
    id: 'LEGS',
    title: 'LEGS',
    pageCount: (state) => Math.max(1, Math.ceil(legsRows(displayedPlan(state)).length / 5)),
    render: (state, ctx) => {
      const plan = displayedPlan(state)
      const rows = legsRows(plan)
      const out: FmsRow[] = []
      for (let i = 0; i < 5; i++) {
        const lr = rows[(ctx.subPage - 1) * 5 + i]
        if (!lr) {
          out.push(row())
          continue
        }
        if (lr.kind === 'DISCO') {
          out.push(row({ left: [small('THEN')] }, { left: [span(boxes(5))] }, { L: { fieldId: 'LEGS.DISCONTINUITY', explainKey: 'discontinuity' } }))
          continue
        }
        if (lr.kind === 'HOLD') {
          const h = lr.leg.hold
          out.push(
            row(
              { left: [small(`${fmtCourse(h?.inboundCourse)} ${h?.turn === 'L' ? 'L' : 'R'} TURN`)] },
              { left: [span(`HOLD AT ${lr.leg.waypoint.ident}`, lr.index === plan.activeLegIndex ? 'magenta' : 'white')] },
              { L: { fieldId: 'LEGS.HOLD', explainKey: 'hold', legId: lr.leg.id } },
            ),
          )
          continue
        }
        const leg = lr.leg
        const active = lr.index === plan.activeLegIndex && plan.activated
        const label = lr.afterDisco
          ? { left: [small('-ROUTE DISCONTINUITY-')] }
          : {
              left: [
                small(
                  `${leg.legType === 'VA' || leg.legType === 'CA' ? fmtCourse(leg.courseMag) : leg.calculatedTrack !== undefined ? fmtCourse(trueToMag(leg.calculatedTrack, leg.waypoint.magVar)) : '   '}`,
                ),
              ],
              center: [small(leg.calculatedDistance !== undefined ? `${fmtDistance(leg.calculatedDistance)}NM` : '')],
            }
        const highlighted = state.navigation.highlightedLegId === leg.id
        out.push(
          row(
            label,
            {
              left: [{ text: leg.waypoint.ident, color: active ? 'magenta' : 'white', size: 'L', inverse: highlighted }],
              right: rightData(state, leg, ctx),
            },
            { L: { fieldId: 'LEGS.WAYPOINT', explainKey: 'legsWaypoint', legId: leg.id }, R: { fieldId: 'LEGS.CONSTRAINT', explainKey: 'constraint', legId: leg.id } },
          ),
        )
      }
      const rightPrompt = !plan.activated && !state.modifiedFlightPlan ? 'ACTIVATE>' : 'STEP>'
      const six = state.modifiedFlightPlan ? eraseOr(state, undefined, rightPrompt) : row(separatorLabel(), { right: [span(rightPrompt)] })
      out.push(six)
      return { title: rteTitle(state, 'LEGS'), rows: out }
    },
    leftLskHandlers: [1, 2, 3, 4, 5].map(left).concat([sixLeft]),
    rightLskHandlers: [1, 2, 3, 4, 5].map(right).concat([sixRight]),
  }
}

/**
 * Boeing LEGS waypoint entry:
 *  - on the active row while airborne → DIRECT TO
 *  - waypoint already downstream → route is connected (intermediate legs deleted)
 *  - new waypoint → inserted, followed by a ROUTE DISCONTINUITY
 *  - on a discontinuity row → closes the discontinuity / inserts the waypoint
 */
function enterWaypoint(state: Draft<FmsState>, ctx: HandlerContext, lr: Exclude<LegsRow, { kind: 'HOLD' }>): void {
  const entry = ctx.scratchpad
  const display = displayedPlan(state as FmsState)
  const airborne = !state.position.onGround
  if (lr.kind === 'LEG' && lr.index === display.activeLegIndex && airborne && display.activated) {
    opDirectTo(state, ctx, entry)
    return
  }
  const plan = ctx.editPlan('ROUTE')
  const near = lr.kind === 'LEG' ? lr.leg.waypoint : undefined
  const downstream = findLegIndex(plan, entry, lr.index + (lr.kind === 'LEG' ? 1 : 0))
  if (lr.kind === 'DISCO') {
    if (downstream > lr.index) {
      trackActiveLeg(plan, () => {
        plan.elements.splice(lr.index, downstream - lr.index)
      })
    } else {
      const prev = plan.elements[lr.index - 1]
      const wp = resolveWaypointEntry(ctx, entry, isLeg(prev) ? prev.waypoint : undefined)
      insertWaypointBefore(plan, ctx.nextId, lr.index, wp, false)
    }
    ctx.fieldChanged('LEGS', entry)
    return
  }
  if (lr.leg.waypoint.ident === entry) return
  if (downstream > lr.index) {
    connectToDownstream(plan, lr.index, downstream)
    ctx.fieldChanged('LEGS', entry)
    return
  }
  const upstream = findLegIndex(plan, entry, Math.max(1, plan.activeLegIndex))
  if (upstream >= 0 && upstream < lr.index) {
    trackActiveLeg(plan, () => {
      plan.elements.splice(upstream + 1, lr.index - upstream - 1)
    })
    ctx.fieldChanged('LEGS', entry)
    return
  }
  const wp = resolveWaypointEntry(ctx, entry, near)
  insertWaypointBefore(plan, ctx.nextId, lr.index, wp, true)
  ctx.fieldChanged('LEGS', entry)
}

