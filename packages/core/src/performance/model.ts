/**
 * Training performance model. Values are representative approximations chosen so that
 * the FMS pages behave plausibly; they are NOT certified aircraft performance data.
 */
export interface PerformanceModel {
  id: string
  engineName: string
  engineCount: number
  oewKg: number
  mzfwKg: number
  mtowKg: number
  mlwKg: number
  maxFuelKg: number
  maxCertifiedAltitudeFt: number
  costIndexRange: { min: number; max: number }
  /** CI above which ECON speeds saturate. */
  costIndexSaturation: number
  climb: { iasCi0: number; iasCiMax: number; machCi0: number; machCiMax: number }
  cruise: { machCi0: number; machCiMax: number; maxMach: number }
  descent: { iasCi0: number; iasCiMax: number; machCi0: number; machCiMax: number }
  /** Initial climb rate at sea level, light weight (fpm) and residual at the ceiling. */
  climbRate: { seaLevelFpm: number; ceilingFpm: number; weightPenaltyFpmPerTonne: number }
  /** Typical idle descent rate (fpm) and planning gradient (NM per 1000 ft). */
  descent3to1NmPer1000Ft: number
  descentRateFpm: number
  fuelFlow: {
    /** Total cruise fuel flow (kg/h) at `refWeightKg` and FL350, ISA. */
    cruiseKgH: number
    refWeightKg: number
    /** Additional kg/h per tonne above reference weight. */
    perTonneKgH: number
    climbFactor: number
    descentFactor: number
    taxiKgPerMin: number
  }
  optimumAltitude: { lightWeightKg: number; lightAltFt: number; heavyWeightKg: number; heavyAltFt: number }
  takeoff: {
    flaps: number[]
    thrustRatings: string[]
    /** V-speeds (kt) at `refWeightKg` for each flap setting, plus kt per tonne slope. */
    vSpeeds: Record<number, { v1: number; vr: number; v2: number }>
    refWeightKg: number
    ktPerTonne: number
    /** Representative take-off N1 % at ISA sea level per rating. */
    n1ByRating: Record<string, number>
    /** Maximum assumed temperature (°C). */
    maxAssumedTempC: number
  }
  landing: {
    flaps: number[]
    vref: Record<number, number>
    refWeightKg: number
    ktPerTonne: number
  }
  /** Climb N1 % (representative). */
  climbN1: number
}
