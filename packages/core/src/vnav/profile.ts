import { interpolate, isLeg } from '@aerofms/shared'
import type { AltitudeConstraint, FlightPlan, FlightPlanLeg, LatLon } from '@aerofms/shared'
import type { NavigationProvider } from '@aerofms/navigation'
import type { PerformanceModel } from '../performance/model'
import { climbRateFpm, effectiveSpeeds, grossWeightKg, optimumAltitudeFt, tasForPhase, cruiseFuelFlowKgH } from '../performance/calc'
import type { PerformanceState } from '../state/types'

/**
 * Simulation VNAV profile (training approximation — not a certified VNAV path).
 * Climb is predicted with the performance model's climb rate; descent uses a geometric
 * path built backwards from the last altitude constraint/destination, honouring
 * AT / AT_OR_ABOVE / AT_OR_BELOW / BETWEEN restrictions.
 */

export interface LegPrediction {
  legId: string
  altitudeFt: number
  speedKt: number
  /** Predicted elapsed time from departure (min). */
  etaMin: number
  /** Predicted fuel remaining (kg). */
  fuelKg?: number
  phase: 'CLIMB' | 'CRUISE' | 'DESCENT'
  constraintViolated: boolean
}

export interface ProfilePoint {
  distanceNm: number
  position: LatLon
}

export interface VnavProfile {
  valid: boolean
  cruiseAltitudeFt?: number
  topOfClimb?: ProfilePoint
  topOfDescent?: ProfilePoint
  /** Step climb point (if planned). */
  stepClimb?: ProfilePoint & { toAltitudeFt: number }
  legs: LegPrediction[]
  totalDistanceNm: number
  tripTimeMin: number
  tripFuelKg?: number
  destinationFuelKg?: number
  /** True when TOC would be after TOD (route too short for the cruise altitude). */
  unableCruiseAltitude: boolean
  /** Messages produced by the prediction. */
  warnings: Array<'UNABLE_CRZ_ALT' | 'DES_PATH_UNACHIEVABLE' | 'INSUFFICIENT_FUEL'>
}

const cache = new WeakMap<object, { perf: PerformanceState; result: VnavProfile }>()

function constraintTarget(c: AltitudeConstraint, preferHigh: boolean): number {
  if (c.type === 'BETWEEN') return preferHigh ? c.altitudeFt : (c.altitude2Ft ?? c.altitudeFt)
  return c.altitudeFt
}

function satisfies(c: AltitudeConstraint | undefined, alt: number, tol = 100): boolean {
  if (!c) return true
  switch (c.type) {
    case 'AT':
      return Math.abs(alt - c.altitudeFt) <= tol
    case 'AT_OR_ABOVE':
      return alt >= c.altitudeFt - tol
    case 'AT_OR_BELOW':
      return alt <= c.altitudeFt + tol
    case 'BETWEEN':
      return alt <= c.altitudeFt + tol && alt >= (c.altitude2Ft ?? 0) - tol
  }
}

function pointAt(legs: FlightPlanLeg[], distance: number): LatLon {
  for (let i = 1; i < legs.length; i++) {
    const a = legs[i - 1]
    const b = legs[i]
    if (!a || !b || a.cumulativeDistance === undefined || b.cumulativeDistance === undefined) continue
    if (distance <= b.cumulativeDistance) {
      const segLen = b.cumulativeDistance - a.cumulativeDistance
      const f = segLen > 0 ? (distance - a.cumulativeDistance) / segLen : 0
      return interpolate(a.waypoint, b.waypoint, f)
    }
  }
  const last = legs[legs.length - 1]
  return last ? { lat: last.waypoint.lat, lon: last.waypoint.lon } : { lat: 0, lon: 0 }
}

export function computeVnavProfile(
  plan: FlightPlan,
  perf: PerformanceState,
  model: PerformanceModel,
  nav: NavigationProvider,
): VnavProfile {
  const hit = cache.get(plan)
  if (hit && hit.perf === perf) return hit.result
  const result = compute(plan, perf, model, nav)
  cache.set(plan, { perf, result })
  return result
}

function compute(plan: FlightPlan, perf: PerformanceState, model: PerformanceModel, nav: NavigationProvider): VnavProfile {
  const legs = plan.elements.filter((e): e is FlightPlanLeg => isLeg(e) && !e.missed && e.cumulativeDistance !== undefined)
  const empty: VnavProfile = {
    valid: false,
    legs: [],
    totalDistanceNm: 0,
    tripTimeMin: 0,
    unableCruiseAltitude: false,
    warnings: [],
  }
  if (legs.length < 2) return empty
  const total = legs[legs.length - 1]?.cumulativeDistance ?? 0
  const origin = plan.origin ? nav.searchAirport(plan.origin) : undefined
  const dest = plan.destination ? nav.searchAirport(plan.destination) : undefined
  const startAlt = origin?.elevationFt ?? 0
  const endAlt = dest?.elevationFt ?? 0
  const crz = perf.cruiseAltitudeFt ?? plan.cruiseAltitudeFt
  const weight = grossWeightKg(perf) ?? model.oewKg + (model.mzfwKg - model.oewKg) * 0.6 + model.maxFuelKg * 0.3
  const speeds = effectiveSpeeds(model, perf)
  if (crz === undefined) return { ...empty, totalDistanceNm: total }

  // ── Climb: integrate in 500 ft steps → distance to reach each altitude.
  const climbDistanceTo = (target: number): number => {
    let alt = startAlt
    let dist = 0
    while (alt < target) {
      const step = Math.min(500, target - alt)
      const rate = climbRateFpm(model, alt, weight)
      const gs = tasForPhase(speeds, 'CLIMB', alt, perf.isaDevC ?? 0) * (alt < 10000 ? 0.85 : 1)
      dist += (step / rate) * (gs / 60)
      alt += step
    }
    return dist
  }

  // ── Descent: geometric path backwards from destination, honouring constraints.
  const gradientFtPerNm = 1000 / model.descent3to1NmPer1000Ft
  const descentAlt = new Map<string, number>()
  let pathAlt = endAlt + 50
  let pathDist = total
  for (let i = legs.length - 1; i >= 0; i--) {
    const leg = legs[i]
    if (!leg || leg.cumulativeDistance === undefined) continue
    const d = pathDist - leg.cumulativeDistance
    let alt = pathAlt + d * gradientFtPerNm
    const c = leg.altitudeConstraint
    if (c && (leg.segment === 'ARRIVAL' || leg.segment === 'APPROACH' || leg.segment === 'ENROUTE' || leg.segment === 'DESTINATION')) {
      if (c.type === 'AT') alt = c.altitudeFt
      else if (c.type === 'AT_OR_BELOW' && alt > c.altitudeFt) alt = c.altitudeFt
      else if (c.type === 'AT_OR_ABOVE' && alt < c.altitudeFt) alt = c.altitudeFt
      else if (c.type === 'BETWEEN') alt = Math.min(Math.max(alt, c.altitude2Ft ?? alt), c.altitudeFt)
    }
    if (leg.segment === 'DESTINATION' || (leg.waypoint.type === 'RUNWAY' && leg.segment === 'APPROACH')) alt = endAlt + 50
    alt = Math.min(alt, crz)
    descentAlt.set(leg.id, alt)
    pathAlt = alt
    pathDist = leg.cumulativeDistance
  }
  // TOD: first point (from the start) where the descent path reaches cruise altitude.
  let todDist = total
  for (let i = legs.length - 1; i >= 0; i--) {
    const leg = legs[i]
    if (!leg || leg.cumulativeDistance === undefined) continue
    const alt = descentAlt.get(leg.id) ?? crz
    if (alt >= crz - 1) {
      const next = legs[i + 1]
      if (next && next.cumulativeDistance !== undefined) {
        const nextAlt = descentAlt.get(next.id) ?? endAlt
        const span = next.cumulativeDistance - leg.cumulativeDistance
        todDist = next.cumulativeDistance - Math.min(span, (crz - nextAlt) / gradientFtPerNm)
      } else todDist = leg.cumulativeDistance
      break
    }
    todDist = leg.cumulativeDistance
  }
  // TOC with climb constraints (AT_OR_BELOW causes level segments; approximated by delaying TOC).
  let tocDist = climbDistanceTo(crz)
  for (const leg of legs) {
    const c = leg.altitudeConstraint
    if (!c || leg.segment !== 'DEPARTURE' || leg.cumulativeDistance === undefined) continue
    if (c.type === 'AT_OR_BELOW' || c.type === 'AT') {
      const capped = constraintTarget(c, true)
      if (capped < crz) {
        const reach = climbDistanceTo(capped)
        if (reach < leg.cumulativeDistance) tocDist += leg.cumulativeDistance - reach
      }
    }
  }
  const warnings: VnavProfile['warnings'] = []
  const unable = tocDist >= todDist
  if (unable) warnings.push('UNABLE_CRZ_ALT')

  // ── Predictions per leg.
  const predictions: LegPrediction[] = []
  let timeMin = 0
  let fuel = perf.fuelKg
  let prevDist = 0
  let prevAlt = startAlt
  const climbDist = Math.min(tocDist, todDist)
  for (const leg of legs) {
    const dist = leg.cumulativeDistance ?? 0
    let phase: LegPrediction['phase']
    let alt: number
    if (dist <= climbDist) {
      phase = 'CLIMB'
      // Invert the climb distance function by bisection.
      let lo = startAlt
      let hi = crz
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2
        if (climbDistanceTo(mid) < dist) lo = mid
        else hi = mid
      }
      alt = lo
      const c = leg.altitudeConstraint
      if (c?.type === 'AT_OR_BELOW' && alt > c.altitudeFt) alt = c.altitudeFt
      if (c?.type === 'AT') alt = Math.min(alt, c.altitudeFt)
      if (unable) alt = Math.min(alt, descentAlt.get(leg.id) ?? alt)
    } else if (dist < todDist) {
      phase = 'CRUISE'
      alt = crz
    } else {
      phase = 'DESCENT'
      alt = descentAlt.get(leg.id) ?? crz
    }
    const avgAlt = (alt + prevAlt) / 2
    const tas = tasForPhase(speeds, phase, avgAlt, perf.isaDevC ?? 0)
    const windAdj = phase === 'CRUISE' && perf.cruiseWindKt ? -perf.cruiseWindKt * 0.5 : 0
    const gs = Math.max(120, tas + windAdj)
    const dt = ((dist - prevDist) / gs) * 60
    timeMin += dt
    if (fuel !== undefined) {
      const ff = cruiseFuelFlowKgH(model, weight, Math.max(10000, avgAlt))
      const factor = phase === 'CLIMB' ? model.fuelFlow.climbFactor : phase === 'DESCENT' ? model.fuelFlow.descentFactor : 1
      fuel -= (ff * factor * dt) / 60
    }
    const iasOrMach = phase === 'CRUISE' ? Math.round(tas) : phase === 'CLIMB' ? speeds.climbKt : speeds.descentKt
    predictions.push({
      legId: leg.id,
      altitudeFt: Math.round(alt / 10) * 10,
      speedKt: leg.speedConstraint ? Math.min(iasOrMach, leg.speedConstraint.speedKt) : iasOrMach,
      etaMin: timeMin,
      fuelKg: fuel !== undefined ? Math.round(fuel) : undefined,
      phase,
      constraintViolated: !satisfies(leg.altitudeConstraint, alt, 300),
    })
    prevDist = dist
    prevAlt = alt
  }
  if (predictions.some((p) => p.constraintViolated && p.phase === 'DESCENT')) warnings.push('DES_PATH_UNACHIEVABLE')
  const destFuel = fuel !== undefined ? Math.round(fuel) : undefined
  if (destFuel !== undefined && perf.reserveFuelKg !== undefined && destFuel < perf.reserveFuelKg) warnings.push('INSUFFICIENT_FUEL')

  let stepClimb: VnavProfile['stepClimb']
  if (perf.cruise.stepSizeFt > 0 && !unable) {
    // Step when burn-off makes (crz + step) ≤ optimum altitude.
    const target = perf.cruise.stepToFt ?? crz + perf.cruise.stepSizeFt
    const ff = cruiseFuelFlowKgH(model, weight, crz)
    for (let d = tocDist; d < todDist; d += 10) {
      const burned = ((d - tocDist) / Math.max(200, tasForPhase(speeds, 'CRUISE', crz))) * ff
      if (optimumAltitudeFt(model, weight - burned) >= target && target <= model.maxCertifiedAltitudeFt) {
        stepClimb = { distanceNm: d, position: pointAt(legs, d), toAltitudeFt: target }
        break
      }
    }
  }

  return {
    valid: true,
    cruiseAltitudeFt: crz,
    topOfClimb: { distanceNm: climbDist, position: pointAt(legs, climbDist) },
    topOfDescent: unable ? undefined : { distanceNm: todDist, position: pointAt(legs, todDist) },
    stepClimb,
    legs: predictions,
    totalDistanceNm: total,
    tripTimeMin: timeMin,
    tripFuelKg: perf.fuelKg !== undefined && destFuel !== undefined ? Math.round(perf.fuelKg - destFuel) : undefined,
    destinationFuelKg: destFuel,
    unableCruiseAltitude: unable,
    warnings,
  }
}
