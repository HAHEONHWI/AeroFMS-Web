import { bearingDeg, distanceNm, isLeg, normalizeHeading } from '@aerofms/shared'
import type { FlightPlan, FlightPlanLeg, LatLon } from '@aerofms/shared'

/**
 * Recomputes per-leg distance/track and cumulative distance.
 * A leg following a discontinuity has no calculated distance (path broken), but cumulative
 * distance still includes the great-circle gap so predictions remain meaningful.
 */
export function recomputeGeometry(plan: FlightPlan): void {
  let prev: FlightPlanLeg | undefined
  let afterDisco = false
  let cumulative = 0
  for (const el of plan.elements) {
    if (!isLeg(el)) {
      afterDisco = true
      continue
    }
    if (el.missed) {
      // Missed approach legs are measured from the previous missed/runway leg but excluded from totals.
      if (prev) {
        el.calculatedDistance = round1(distanceNm(prev.waypoint, el.waypoint))
        el.calculatedTrack = round1(bearingDeg(prev.waypoint, el.waypoint))
      }
      el.cumulativeDistance = undefined
      prev = el
      continue
    }
    if (prev) {
      const d = distanceNm(prev.waypoint, el.waypoint)
      cumulative += d
      el.calculatedDistance = afterDisco ? undefined : round1(d)
      el.calculatedTrack = afterDisco ? undefined : round1(d < 0.05 ? (el.calculatedTrack ?? 0) : bearingDeg(prev.waypoint, el.waypoint))
    } else {
      el.calculatedDistance = undefined
      el.calculatedTrack = undefined
    }
    el.cumulativeDistance = round1(cumulative)
    prev = el
    afterDisco = false
  }
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/** Magnetic course from a true track and the waypoint's magnetic variation (east positive). */
export function trueToMag(trackTrue: number, magVar = 0): number {
  return normalizeHeading(trackTrue - magVar)
}

export function magToTrue(courseMag: number, magVar = 0): number {
  return normalizeHeading(courseMag + magVar)
}

export function flownLegs(plan: FlightPlan): FlightPlanLeg[] {
  return plan.elements.filter((e): e is FlightPlanLeg => isLeg(e) && !e.missed)
}

/** Total planned distance from the first leg to the last non-missed leg. */
export function totalDistanceNm(plan: FlightPlan): number {
  const legs = flownLegs(plan)
  return legs[legs.length - 1]?.cumulativeDistance ?? 0
}

/** Distance from `position` to the end of the plan following the active leg onwards. */
export function distanceToDestinationNm(plan: FlightPlan, position: LatLon | null): number {
  const active = plan.elements[plan.activeLegIndex]
  const legs = flownLegs(plan)
  const last = legs[legs.length - 1]
  if (!last || last.cumulativeDistance === undefined) return 0
  if (!isLeg(active) || active.cumulativeDistance === undefined) return last.cumulativeDistance
  const toActive = position ? distanceNm(position, active.waypoint) : (active.calculatedDistance ?? 0)
  return Math.max(0, toActive + (last.cumulativeDistance - active.cumulativeDistance))
}

/** Index of the first element whose leg identifier matches. */
export function findLegIndex(plan: FlightPlan, ident: string, fromIndex = 0): number {
  for (let i = fromIndex; i < plan.elements.length; i++) {
    const e = plan.elements[i]
    if (isLeg(e) && !e.missed && e.waypoint.ident === ident) return i
  }
  return -1
}

export function legIndexById(plan: FlightPlan, id: string): number {
  return plan.elements.findIndex((e) => e.id === id)
}
