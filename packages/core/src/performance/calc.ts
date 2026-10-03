import { machToTas, iasToTas, crossoverAltitudeFt } from '@aerofms/shared'
import type { PerformanceState } from '../state/types'
import type { PerformanceModel } from './model'

/** Simulation-only performance helpers ("training model"). */

export function grossWeightKg(perf: PerformanceState): number | undefined {
  if (perf.zfwKg === undefined || perf.fuelKg === undefined) return undefined
  return perf.zfwKg + perf.fuelKg
}

const lerp = (a: number, b: number, f: number): number => a + (b - a) * Math.max(0, Math.min(1, f))

function ciFraction(model: PerformanceModel, ci: number | undefined): number {
  return (ci ?? 0) / model.costIndexSaturation
}

export interface TargetSpeeds {
  climbKt: number
  climbMach: number
  cruiseMach: number
  descentKt: number
  descentMach: number
}

/** ECON target speeds for a cost index (higher CI → faster). */
export function econSpeeds(model: PerformanceModel, ci: number | undefined): TargetSpeeds {
  const f = ciFraction(model, ci)
  const r2 = (v: number): number => Math.round(v)
  const m3 = (v: number): number => Math.round(v * 1000) / 1000
  return {
    climbKt: r2(lerp(model.climb.iasCi0, model.climb.iasCiMax, f)),
    climbMach: m3(lerp(model.climb.machCi0, model.climb.machCiMax, f)),
    cruiseMach: m3(lerp(model.cruise.machCi0, model.cruise.machCiMax, f)),
    descentKt: r2(lerp(model.descent.iasCi0, model.descent.iasCiMax, f)),
    descentMach: m3(lerp(model.descent.machCi0, model.descent.machCiMax, f)),
  }
}

/** Effective speeds honouring manual (pilot-selected) entries. */
export function effectiveSpeeds(model: PerformanceModel, perf: PerformanceState): TargetSpeeds {
  const econ = econSpeeds(model, perf.costIndex)
  return {
    climbKt: perf.climb.mode === 'MANUAL' && perf.climb.speedKt ? perf.climb.speedKt : econ.climbKt,
    climbMach: perf.climb.mode === 'MANUAL' && perf.climb.mach ? perf.climb.mach : econ.climbMach,
    cruiseMach: perf.cruise.mode === 'MANUAL' && perf.cruise.mach ? perf.cruise.mach : econ.cruiseMach,
    descentKt: perf.descent.mode === 'MANUAL' && perf.descent.speedKt ? perf.descent.speedKt : econ.descentKt,
    descentMach: perf.descent.mode === 'MANUAL' && perf.descent.mach ? perf.descent.mach : econ.descentMach,
  }
}

export function optimumAltitudeFt(model: PerformanceModel, weightKg: number): number {
  const o = model.optimumAltitude
  const f = (weightKg - o.lightWeightKg) / (o.heavyWeightKg - o.lightWeightKg)
  const alt = lerp(o.lightAltFt, o.heavyAltFt, f)
  return Math.min(model.maxCertifiedAltitudeFt, Math.round(alt / 100) * 100)
}

/** Maximum altitude (≈ 1.3g buffet margin approximation): optimum + 2000 ft, capped. */
export function maxAltitudeFt(model: PerformanceModel, weightKg: number): number {
  return Math.min(model.maxCertifiedAltitudeFt, optimumAltitudeFt(model, weightKg) + 2000)
}

export function climbRateFpm(model: PerformanceModel, altitudeFt: number, weightKg: number): number {
  const c = model.climbRate
  const f = altitudeFt / model.maxCertifiedAltitudeFt
  const base = lerp(c.seaLevelFpm, c.ceilingFpm, f)
  const penalty = Math.max(0, (weightKg - model.oewKg) / 1000) * c.weightPenaltyFpmPerTonne * (0.4 + f)
  return Math.max(300, base - penalty)
}

/** Cruise fuel flow (kg/h, all engines). */
export function cruiseFuelFlowKgH(model: PerformanceModel, weightKg: number, altitudeFt: number): number {
  const ff = model.fuelFlow
  const weightTerm = ((weightKg - ff.refWeightKg) / 1000) * ff.perTonneKgH
  // Lower altitudes burn more (≈ +2.5% per 1000 ft below FL350, +1% per 1000 ft above).
  const dAlt = (35000 - altitudeFt) / 1000
  const altFactor = dAlt >= 0 ? 1 + 0.025 * dAlt : 1 + 0.01 * -dAlt
  return Math.max(500, (ff.cruiseKgH + weightTerm) * altFactor)
}

export function takeoffSpeeds(
  model: PerformanceModel,
  weightKg: number,
  flaps: number,
): { v1: number; vr: number; v2: number } | undefined {
  const base = model.takeoff.vSpeeds[flaps]
  if (!base) return undefined
  const dt = (weightKg - model.takeoff.refWeightKg) / 1000
  const k = model.takeoff.ktPerTonne
  return {
    v1: Math.round(base.v1 + dt * k * 0.9),
    vr: Math.round(base.vr + dt * k),
    v2: Math.round(base.v2 + dt * k),
  }
}

export function vref(model: PerformanceModel, landingWeightKg: number, flaps: number): number | undefined {
  const base = model.landing.vref[flaps]
  if (base === undefined) return undefined
  return Math.round(base + ((landingWeightKg - model.landing.refWeightKg) / 1000) * model.landing.ktPerTonne)
}

/** Representative take-off N1 % adjusted for OAT/assumed temperature. */
export function takeoffN1(model: PerformanceModel, rating: string, oatC: number, assumedTempC?: number): number | undefined {
  const base = model.takeoff.n1ByRating[rating]
  if (base === undefined) return undefined
  const effective = assumedTempC !== undefined && assumedTempC > oatC ? assumedTempC : oatC
  // Flat rated to ISA+15 (30°C at sea level); beyond, thrust decays ≈0.3 %N1/°C.
  const derate = Math.max(0, effective - 30) * 0.3 + (assumedTempC !== undefined ? Math.max(0, assumedTempC - oatC) * 0.15 : 0)
  const coldBoost = Math.max(0, 15 - oatC) * -0.1
  return Math.round((base - derate + coldBoost) * 10) / 10
}

export function tasForPhase(
  speeds: TargetSpeeds,
  phase: 'CLIMB' | 'CRUISE' | 'DESCENT',
  altitudeFt: number,
  isaDev = 0,
): number {
  if (phase === 'CRUISE') return machToTas(speeds.cruiseMach, altitudeFt, isaDev)
  const ias = phase === 'CLIMB' ? speeds.climbKt : speeds.descentKt
  const mach = phase === 'CLIMB' ? speeds.climbMach : speeds.descentMach
  const xover = crossoverAltitudeFt(ias, mach)
  return altitudeFt >= xover ? machToTas(mach, altitudeFt, isaDev) : iasToTas(ias, altitudeFt, isaDev)
}

/** Head-wind component (positive = headwind) for a track and wind. */
export function headwindComponent(trackTrue: number, windDir: number, windKt: number): number {
  return windKt * Math.cos(((windDir - trackTrue) * Math.PI) / 180)
}

export interface PerformanceResult {
  grossWeightKg?: number
  optimumAltitudeFt?: number
  maxAltitudeFt?: number
  speeds: TargetSpeeds
  takeoff?: { v1: number; vr: number; v2: number }
  n1?: number
  vref?: number
  warnings: Array<'GW_OVER_MTOW' | 'ZFW_OVER_MZFW' | 'FUEL_OVER_CAPACITY' | 'CRZ_ABOVE_MAX'>
}

export function calculatePerformance(model: PerformanceModel, perf: PerformanceState): PerformanceResult {
  const gw = grossWeightKg(perf)
  const warnings: PerformanceResult['warnings'] = []
  if (gw !== undefined && gw > model.mtowKg) warnings.push('GW_OVER_MTOW')
  if (perf.zfwKg !== undefined && perf.zfwKg > model.mzfwKg) warnings.push('ZFW_OVER_MZFW')
  if (perf.fuelKg !== undefined && perf.fuelKg > model.maxFuelKg) warnings.push('FUEL_OVER_CAPACITY')
  const maxAlt = gw !== undefined ? maxAltitudeFt(model, gw) : undefined
  if (maxAlt !== undefined && perf.cruiseAltitudeFt !== undefined && perf.cruiseAltitudeFt > maxAlt) warnings.push('CRZ_ABOVE_MAX')
  const flaps = perf.takeoff.flaps
  const rating = perf.takeoff.thrustRating ?? model.takeoff.thrustRatings[0]
  const lw = gw !== undefined ? gw - (perf.fuelKg ?? 0) * 0.7 : undefined
  return {
    grossWeightKg: gw,
    optimumAltitudeFt: gw !== undefined ? optimumAltitudeFt(model, gw) : undefined,
    maxAltitudeFt: maxAlt,
    speeds: effectiveSpeeds(model, perf),
    takeoff: gw !== undefined && flaps !== undefined ? takeoffSpeeds(model, gw, flaps) : undefined,
    n1: rating ? takeoffN1(model, rating, perf.takeoff.oatC ?? 15, perf.takeoff.assumedTempC) : undefined,
    vref:
      lw !== undefined && perf.approach.flaps !== undefined ? vref(model, Math.max(model.oewKg, lw), perf.approach.flaps) : undefined,
    warnings,
  }
}
