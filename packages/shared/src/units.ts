export type UnitSystem = 'AVIATION' | 'METRIC' | 'IMPERIAL'

export const KG_PER_LB = 0.45359237
export const M_PER_FT = 0.3048
export const KM_PER_NM = 1.852

export const kgToLb = (kg: number): number => kg / KG_PER_LB
export const lbToKg = (lb: number): number => lb * KG_PER_LB
export const ftToM = (ft: number): number => ft * M_PER_FT
export const nmToKm = (nm: number): number => nm * KM_PER_NM
export const cToF = (c: number): number => (c * 9) / 5 + 32
export const fToC = (f: number): number => ((f - 32) * 5) / 9

export interface UnitPreferences {
  weight: 'kg' | 'lb'
  altitude: 'ft' | 'm'
  distance: 'nm' | 'km'
  speed: 'kt' | 'kmh'
  temperature: 'c' | 'f'
}

export function unitPreferences(system: UnitSystem): UnitPreferences {
  switch (system) {
    case 'METRIC':
      return { weight: 'kg', altitude: 'm', distance: 'km', speed: 'kmh', temperature: 'c' }
    case 'IMPERIAL':
      return { weight: 'lb', altitude: 'ft', distance: 'nm', speed: 'kt', temperature: 'f' }
    case 'AVIATION':
    default:
      return { weight: 'kg', altitude: 'ft', distance: 'nm', speed: 'kt', temperature: 'c' }
  }
}

/** ISA temperature (°C) at a pressure altitude (ft). */
export function isaTemperatureC(altitudeFt: number): number {
  return altitudeFt < 36089 ? 15 - 1.98 * (altitudeFt / 1000) : -56.5
}

/** Speed of sound (kt) for a static air temperature (°C). */
export function speedOfSoundKt(tempC: number): number {
  return 38.967854 * Math.sqrt(tempC + 273.15)
}

/** Approximate TAS from IAS/CAS at altitude (simple density approximation, training only). */
export function iasToTas(iasKt: number, altitudeFt: number, isaDevC = 0): number {
  const tempK = isaTemperatureC(altitudeFt) + isaDevC + 273.15
  const pressureRatio = Math.pow(1 - 6.8755856e-6 * Math.min(altitudeFt, 36089), 5.2558797) *
    (altitudeFt > 36089 ? Math.exp(-4.80634e-5 * (altitudeFt - 36089)) : 1)
  const densityRatio = (pressureRatio * 288.15) / tempK
  return iasKt / Math.sqrt(Math.max(0.05, densityRatio))
}

export function machToTas(mach: number, altitudeFt: number, isaDevC = 0): number {
  return mach * speedOfSoundKt(isaTemperatureC(altitudeFt) + isaDevC)
}

export function tasToMach(tasKt: number, altitudeFt: number, isaDevC = 0): number {
  return tasKt / speedOfSoundKt(isaTemperatureC(altitudeFt) + isaDevC)
}

/** Altitude above which mach becomes the controlling speed for a given IAS/Mach pair. */
export function crossoverAltitudeFt(iasKt: number, mach: number): number {
  let lo = 10000
  let hi = 45000
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (iasToTas(iasKt, mid) > machToTas(mach, mid)) hi = mid
    else lo = mid
  }
  return Math.round(lo / 100) * 100
}

export function formatFlightLevel(altitudeFt: number, transitionAltitudeFt = 18000): string {
  if (altitudeFt >= transitionAltitudeFt) return `FL${String(Math.round(altitudeFt / 100)).padStart(3, '0')}`
  return String(Math.round(altitudeFt))
}

/** Display altitude: flight level at/above the transition altitude, otherwise feet with unit. */
export function formatAltitude(altitudeFt: number, transitionAltitudeFt = 18000): string {
  return altitudeFt >= transitionAltitudeFt ? formatFlightLevel(altitudeFt, transitionAltitudeFt) : `${Math.round(altitudeFt)} ft`
}

/** Formats seconds-of-day as HHMMz */
export function formatZuluTime(epochMs: number): string {
  const d = new Date(epochMs)
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}z`
}

/** Formats a duration in minutes as H+MM */
export function formatDurationHm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  return `${Math.floor(m / 60)}+${String(m % 60).padStart(2, '0')}`
}

/** Compact leg summary for list views: "Y711 · 18 NM · FL230". */
export function legDetail(leg: { via?: string; calculatedDistance?: number }, predictedAltitudeFt: number | undefined, transitionAltitudeFt = 18000): string {
  const parts: string[] = []
  if (leg.via) parts.push(leg.via)
  if (leg.calculatedDistance !== undefined) parts.push(`${leg.calculatedDistance < 10 ? leg.calculatedDistance.toFixed(1) : Math.round(leg.calculatedDistance)} NM`)
  if (predictedAltitudeFt !== undefined) parts.push(formatAltitude(predictedAltitudeFt, transitionAltitudeFt))
  return parts.join(' · ')
}
