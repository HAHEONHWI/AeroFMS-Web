import { alongTrackNm, bearingDeg, crossTrackNm, distanceNm, headingDiff, isLeg } from '@aerofms/shared'
import type { FlightPlan, FlightPlanLeg, LatLon } from '@aerofms/shared'

/** Simulation LNAV guidance (great-circle legs, simple turn anticipation). */

export interface LnavGuidance {
  fromLeg?: FlightPlanLeg
  toLeg?: FlightPlanLeg
  nextLeg?: FlightPlanLeg
  desiredTrackTrue: number
  crossTrackNm: number
  distanceToGoNm: number
  /** Distance before the TO fix at which the turn to the next leg starts. */
  turnAnticipationNm: number
  /** Leg should be sequenced now. */
  shouldSequence: boolean
  /** Path ends at a discontinuity or end of route. */
  endOfPath: boolean
}

function previousLeg(plan: FlightPlan, index: number): FlightPlanLeg | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const e = plan.elements[i]
    if (isLeg(e)) return e
    return undefined
  }
  return undefined
}

function nextLegAfter(plan: FlightPlan, index: number): FlightPlanLeg | undefined {
  const e = plan.elements[index + 1]
  return isLeg(e) && !e.missed ? e : undefined
}

export function computeLnavGuidance(plan: FlightPlan, position: LatLon, groundSpeedKt: number): LnavGuidance {
  const to = plan.elements[plan.activeLegIndex]
  if (!isLeg(to)) {
    return { desiredTrackTrue: 0, crossTrackNm: 0, distanceToGoNm: 0, turnAnticipationNm: 0, shouldSequence: false, endOfPath: true }
  }
  const from = previousLeg(plan, plan.activeLegIndex)
  const next = nextLegAfter(plan, plan.activeLegIndex)
  const dtg = distanceNm(position, to.waypoint)
  const dtk = from ? bearingDeg(from.waypoint, to.waypoint) : bearingDeg(position, to.waypoint)
  const xtk = from ? crossTrackNm(from.waypoint, to.waypoint, position) : 0
  let tad = 0
  if (next && !to.overfly && !to.hold) {
    const nextTrack = bearingDeg(to.waypoint, next.waypoint)
    const turn = Math.abs(headingDiff(dtk, nextTrack))
    // Radius for a 25° bank turn: r = V² / (g·tan φ), in NM.
    const vMs = (groundSpeedKt * 1852) / 3600
    const radiusNm = (vMs * vMs) / (9.81 * Math.tan((25 * Math.PI) / 180)) / 1852
    tad = Math.min(radiusNm * Math.tan(((turn / 2) * Math.PI) / 180), 8)
  }
  // Passed abeam the TO fix?
  const passed = from ? alongTrackNm(from.waypoint, to.waypoint, position) >= distanceNm(from.waypoint, to.waypoint) : dtg < 0.3
  const shouldSequence = !to.hold && (dtg <= Math.max(0.3, tad) || passed)
  return {
    fromLeg: from,
    toLeg: to,
    nextLeg: next,
    desiredTrackTrue: dtk,
    crossTrackNm: xtk,
    distanceToGoNm: dtg,
    turnAnticipationNm: tad,
    shouldSequence,
    endOfPath: !next,
  }
}

/** Heading command to capture and track the desired path (simple proportional intercept). */
export function interceptHeading(guidance: LnavGuidance, position: LatLon): number {
  if (!guidance.toLeg) return guidance.desiredTrackTrue
  if (!guidance.fromLeg) return bearingDeg(position, guidance.toLeg.waypoint)
  const correction = Math.max(-45, Math.min(45, -guidance.crossTrackNm * 25))
  return (guidance.desiredTrackTrue + correction + 360) % 360
}
