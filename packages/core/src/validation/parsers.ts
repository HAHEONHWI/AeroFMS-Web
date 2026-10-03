import { parseLatLonFms } from '@aerofms/shared'
import type { AltitudeConstraint, LatLon, SpeedConstraint } from '@aerofms/shared'

/**
 * Entry parsers shared by all aircraft. Each returns `undefined` for an invalid entry;
 * aircraft adapters apply their own limits (max altitude, CI range, ...) on top.
 */

const INT = /^\d+$/

/**
 * Altitude entry.
 * - "FL350" / "350" (1–3 digits) → flight level (×100)
 * - "5000" / "35000" (4–5 digits) → feet
 */
export function parseAltitude(input: string, maxFt = 45000): number | undefined {
  const s = input.trim().toUpperCase()
  let ft: number | undefined
  if (/^FL\d{1,3}$/.test(s)) ft = Number(s.slice(2)) * 100
  else if (/^\d{1,3}$/.test(s)) ft = Number(s) * 100
  else if (/^\d{4,5}$/.test(s)) ft = Number(s)
  if (ft === undefined || !Number.isFinite(ft)) return undefined
  if (ft < -1000 || ft > maxFt) return undefined
  return ft
}

/** Cruise altitude (must be ≥ 1000 ft and within the aircraft ceiling). */
export function parseCruiseAltitude(input: string, maxFt: number): number | undefined {
  const ft = parseAltitude(input, maxFt)
  if (ft === undefined || ft < 1000) return undefined
  return ft
}

export type SpeedEntry = { kind: 'IAS'; kt: number } | { kind: 'MACH'; mach: number }

/** "250" → IAS, ".78" / "0.78" / "M.78" / "78" (when allowMachInt) → Mach. */
export function parseSpeed(input: string, opts: { minKt?: number; maxKt?: number } = {}): SpeedEntry | undefined {
  const s = input.trim().toUpperCase().replace(/^M/, '')
  if (/^0?\.\d{1,3}$/.test(s)) {
    const mach = Number(s)
    if (mach < 0.4 || mach > 0.95) return undefined
    return { kind: 'MACH', mach: Math.round(mach * 1000) / 1000 }
  }
  if (INT.test(s)) {
    const kt = Number(s)
    if (kt < (opts.minKt ?? 100) || kt > (opts.maxKt ?? 399)) return undefined
    return { kind: 'IAS', kt }
  }
  return undefined
}

/** Boeing altitude constraint token: 10000, FL240, 240A, 240B, 220A240B */
export function parseBoeingAltitudeConstraint(input: string, maxFt = 45000): AltitudeConstraint | undefined {
  const s = input.trim().toUpperCase()
  const between = /^(FL)?(\d{1,5})A(FL)?(\d{1,5})B$/.exec(s)
  if (between) {
    const lo = parseAltitude(`${between[1] ?? ''}${between[2]}`, maxFt)
    const hi = parseAltitude(`${between[3] ?? ''}${between[4]}`, maxFt)
    if (lo === undefined || hi === undefined || lo >= hi) return undefined
    return { type: 'BETWEEN', altitudeFt: hi, altitude2Ft: lo }
  }
  const m = /^(FL)?(\d{1,5})([AB]?)$/.exec(s)
  if (!m) return undefined
  const ft = parseAltitude(`${m[1] ?? ''}${m[2]}`, maxFt)
  if (ft === undefined) return undefined
  return { type: m[3] === 'A' ? 'AT_OR_ABOVE' : m[3] === 'B' ? 'AT_OR_BELOW' : 'AT', altitudeFt: ft }
}

/** Airbus altitude constraint: "+FL240" at/above, "-10000" at/below, "5000" at. */
export function parseAirbusAltitudeConstraint(input: string, maxFt = 45000): AltitudeConstraint | undefined {
  const s = input.trim().toUpperCase()
  const sign = s[0] === '+' || s[0] === '-' ? s[0] : ''
  const ft = parseAltitude(sign ? s.slice(1) : s, maxFt)
  if (ft === undefined) return undefined
  return { type: sign === '+' ? 'AT_OR_ABOVE' : sign === '-' ? 'AT_OR_BELOW' : 'AT', altitudeFt: ft }
}

export interface SpeedAltitudeEntry {
  speed?: SpeedConstraint
  altitude?: AltitudeConstraint
  /** True when the corresponding part was present in the entry. */
  hasSpeed: boolean
  hasAltitude: boolean
}

/** Boeing LEGS right-side entry: "250/10000", "250/", "/FL240", "/240A", "250" */
export function parseSpeedAltitudeConstraint(input: string, maxFt = 45000): SpeedAltitudeEntry | undefined {
  const s = input.trim().toUpperCase()
  const parts = s.split('/')
  if (parts.length > 2) return undefined
  const [spdRaw = '', altRaw] = parts
  const out: SpeedAltitudeEntry = { hasSpeed: spdRaw.length > 0, hasAltitude: (altRaw ?? '').length > 0 }
  if (out.hasSpeed) {
    if (!/^\d{3}$/.test(spdRaw)) return undefined
    const kt = Number(spdRaw)
    if (kt < 100 || kt > 399) return undefined
    out.speed = { type: 'AT_OR_BELOW', speedKt: kt }
  }
  if (out.hasAltitude && altRaw !== undefined) {
    const alt = parseBoeingAltitudeConstraint(altRaw, maxFt)
    if (!alt) return undefined
    out.altitude = alt
  }
  if (parts.length === 1) {
    // A lone number is a speed if 3 digits ≤ 399 else an altitude.
    if (out.speed) return out
    return undefined
  }
  if (!out.hasSpeed && !out.hasAltitude) return undefined
  return out
}

export interface CostIndexLimits {
  min: number
  max: number
}

export function parseCostIndex(input: string, limits: CostIndexLimits): number | undefined {
  const s = input.trim()
  if (!INT.test(s)) return undefined
  const v = Number(s)
  return v >= limits.min && v <= limits.max ? v : undefined
}

/**
 * Weight entry in thousands of kg ("61.5" → 61 500 kg) or raw kg (≥ 1000).
 */
export function parseWeightKg(input: string, minKg = 0, maxKg = 600000): number | undefined {
  const s = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined
  const v = Number(s)
  const kg = v < 1000 ? Math.round(v * 1000) : Math.round(v)
  return kg >= minKg && kg <= maxKg ? kg : undefined
}

/** Temperature in °C: "15", "-5", "+30", "15C", "59F" */
export function parseTemperatureC(input: string, min = -70, max = 70): number | undefined {
  const s = input.trim().toUpperCase()
  const m = /^([+-]?\d{1,3})([CF]?)$/.exec(s)
  if (!m) return undefined
  let v = Number(m[1])
  if (m[2] === 'F') v = Math.round(((v - 32) * 5) / 9)
  return v >= min && v <= max ? v : undefined
}

/** Wind "270/45" (direction true, speed kt). */
export function parseWind(input: string): { dir: number; kt: number } | undefined {
  const m = /^(\d{1,3})\/(\d{1,3})$/.exec(input.trim())
  if (!m) return undefined
  const dir = Number(m[1])
  const kt = Number(m[2])
  if (dir > 360 || kt > 250) return undefined
  return { dir: dir % 360, kt }
}

/** Runway designator: "33L", "RW33L", "07" */
export function parseRunwayIdent(input: string): string | undefined {
  const m = /^(?:RW)?(\d{1,2})([LRC]?)$/.exec(input.trim().toUpperCase())
  if (!m) return undefined
  const n = Number(m[1])
  if (n < 1 || n > 36) return undefined
  return `${String(n).padStart(2, '0')}${m[2] ?? ''}`
}

export function parseLatLon(input: string): LatLon | undefined {
  return parseLatLonFms(input) ?? undefined
}

/** Place/bearing/distance: "OSN090/20" → ident OSN, bearing 090 mag, 20 NM */
export function parsePlaceBearingDistance(input: string): { ident: string; bearing: number; distanceNm: number } | undefined {
  const m = /^([A-Z0-9]{2,5})(\d{3})\/(\d{1,3}(?:\.\d)?)$/.exec(input.trim().toUpperCase())
  if (!m || !m[1]) return undefined
  const bearing = Number(m[2])
  const distanceNm = Number(m[3])
  if (bearing > 360 || distanceNm <= 0 || distanceNm > 700) return undefined
  return { ident: m[1], bearing: bearing % 360, distanceNm }
}

/** Waypoint / navaid identifier (1–5 alphanumerics, must start with a letter). */
export function isIdent(input: string): boolean {
  return /^[A-Z][A-Z0-9]{0,4}$/.test(input.trim().toUpperCase())
}

export function isIcao(input: string): boolean {
  return /^[A-Z]{4}$/.test(input.trim().toUpperCase())
}

export function parseFlightNumber(input: string): string | undefined {
  const s = input.trim().toUpperCase()
  return /^[A-Z0-9]{1,10}$/.test(s) ? s : undefined
}

/** Course 0–360 (3 digits, "090" or "90"). */
export function parseCourse(input: string): number | undefined {
  const s = input.trim()
  if (!/^\d{1,3}$/.test(s)) return undefined
  const v = Number(s)
  return v <= 360 ? v % 360 : undefined
}

/** Hold inbound course / turn direction: "270/L", "270", "/R" */
export function parseInboundCourseTurn(input: string): { course?: number; turn?: 'L' | 'R' } | undefined {
  const m = /^(\d{1,3})?(?:\/([LR]))?$/.exec(input.trim().toUpperCase())
  if (!m || (!m[1] && !m[2])) return undefined
  const course = m[1] !== undefined ? parseCourse(m[1]) : undefined
  if (m[1] !== undefined && course === undefined) return undefined
  return { course, turn: m[2] as 'L' | 'R' | undefined }
}

/** Decimal number within range, e.g. leg time "1.5" */
export function parseDecimal(input: string, min: number, max: number, decimals = 1): number | undefined {
  const re = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$|^\\.\\d{1,${decimals}}$`)
  const s = input.trim()
  if (!re.test(s)) return undefined
  const v = Number(s)
  return v >= min && v <= max ? v : undefined
}

export function parseInteger(input: string, min: number, max: number): number | undefined {
  const s = input.trim()
  if (!/^[+-]?\d+$/.test(s)) return undefined
  const v = Number(s)
  return v >= min && v <= max ? v : undefined
}

/** QNH "1013" (hPa) or "29.92" (inHg → hPa). */
export function parseQnhHpa(input: string): number | undefined {
  const s = input.trim()
  if (/^\d{3,4}$/.test(s)) {
    const v = Number(s)
    return v >= 745 && v <= 1100 ? v : undefined
  }
  if (/^\d{2}\.\d{2}$/.test(s)) {
    const inHg = Number(s)
    if (inHg < 22 || inHg > 32.5) return undefined
    return Math.round(inHg * 33.8639)
  }
  return undefined
}

/** Splits "A/B" entries; missing sides are undefined. "/B" → [undefined, B]. */
export function splitSlash(input: string): [string | undefined, string | undefined] {
  const idx = input.indexOf('/')
  if (idx < 0) return [input || undefined, undefined]
  const a = input.slice(0, idx)
  const b = input.slice(idx + 1)
  return [a || undefined, b || undefined]
}
