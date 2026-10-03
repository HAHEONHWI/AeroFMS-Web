/**
 * Spherical-earth navigation math used by the simulation.
 * All distances are nautical miles, all angles are degrees (true unless stated otherwise).
 * This is an educational approximation (spherical model), not a certified WGS-84 implementation.
 */

export interface LatLon {
  lat: number
  lon: number
}

export const EARTH_RADIUS_NM = 3440.065

const toRad = (deg: number): number => (deg * Math.PI) / 180
const toDeg = (rad: number): number => (rad * 180) / Math.PI

export function normalizeHeading(deg: number): number {
  const h = deg % 360
  return h < 0 ? h + 360 : h
}

/** Signed smallest difference a→b in degrees, range (-180, 180]. */
export function headingDiff(a: number, b: number): number {
  let d = normalizeHeading(b) - normalizeHeading(a)
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial great-circle bearing (true) from a to b. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat)
  const φ2 = toRad(b.lat)
  const Δλ = toRad(b.lon - a.lon)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return normalizeHeading(toDeg(Math.atan2(y, x)))
}

/** Point reached travelling `distance` NM on initial bearing `bearing` from `origin`. */
export function destinationPoint(origin: LatLon, bearing: number, distance: number): LatLon {
  const δ = distance / EARTH_RADIUS_NM
  const θ = toRad(bearing)
  const φ1 = toRad(origin.lat)
  const λ1 = toRad(origin.lon)
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: toDeg(φ2), lon: ((toDeg(λ2) + 540) % 360) - 180 }
}

/** Signed cross-track distance (NM) of `p` from the great circle start→end. Positive = right of track. */
export function crossTrackNm(start: LatLon, end: LatLon, p: LatLon): number {
  const δ13 = distanceNm(start, p) / EARTH_RADIUS_NM
  const θ13 = toRad(bearingDeg(start, p))
  const θ12 = toRad(bearingDeg(start, end))
  return Math.asin(Math.sin(δ13) * Math.sin(θ13 - θ12)) * EARTH_RADIUS_NM
}

/** Along-track distance (NM) from `start` to the closest point to `p` on start→end. */
export function alongTrackNm(start: LatLon, end: LatLon, p: LatLon): number {
  const δ13 = distanceNm(start, p) / EARTH_RADIUS_NM
  const δxt = crossTrackNm(start, end, p) / EARTH_RADIUS_NM
  const cos = Math.cos(δ13) / Math.max(1e-12, Math.cos(δxt))
  const sign = Math.cos(toRad(bearingDeg(start, p)) - toRad(bearingDeg(start, end))) >= 0 ? 1 : -1
  return sign * Math.acos(Math.max(-1, Math.min(1, cos))) * EARTH_RADIUS_NM
}

/** Linear interpolation along the great circle a→b by fraction f (0..1). */
export function interpolate(a: LatLon, b: LatLon, f: number): LatLon {
  const d = distanceNm(a, b)
  if (d < 1e-9) return { ...a }
  return destinationPoint(a, bearingDeg(a, b), d * f)
}

/** Formats latitude/longitude in the compact FMS style N3728.5E12626.4 */
export function formatLatLonFms(p: LatLon): string {
  const fmt = (v: number, posChar: string, negChar: string, degDigits: number): string => {
    const abs = Math.abs(v)
    const deg = Math.floor(abs)
    const min = (abs - deg) * 60
    const minStr = min.toFixed(1).padStart(4, '0')
    const fixed = minStr === '60.0' ? { d: deg + 1, m: '00.0' } : { d: deg, m: minStr }
    return `${v >= 0 ? posChar : negChar}${String(fixed.d).padStart(degDigits, '0')}${fixed.m}`
  }
  return `${fmt(p.lat, 'N', 'S', 2)}${fmt(p.lon, 'E', 'W', 3)}`
}

/**
 * Parses FMS lat/lon formats:
 *  - N3728.5E12626.4 (compact)
 *  - N37285E126264 (no decimal point, tenths implied)
 *  - N37E126 (whole degrees)
 */
export function parseLatLonFms(input: string): LatLon | null {
  const s = input.replace(/\s|\//g, '').toUpperCase()
  const m = /^([NS])(\d{2})(\d{2}(?:\.\d)?|\d{3})?([EW])(\d{3})(\d{2}(?:\.\d)?|\d{3})?$/.exec(s)
  if (!m) return null
  const [, ns, latD, latM, ew, lonD, lonM] = m
  const parseMin = (raw: string | undefined): number => {
    if (!raw) return 0
    if (raw.includes('.')) return Number(raw)
    if (raw.length === 3) return Number(raw) / 10
    return Number(raw)
  }
  const lat = Number(latD) + parseMin(latM) / 60
  const lon = Number(lonD) + parseMin(lonM) / 60
  if (lat > 90 || lon > 180 || parseMin(latM) >= 60 || parseMin(lonM) >= 60) return null
  return { lat: ns === 'S' ? -lat : lat, lon: ew === 'W' ? -lon : lon }
}

/** Bounding box of a set of points, padded by `padDeg`. */
export function boundingBox(points: LatLon[], padDeg = 0): [number, number, number, number] | null {
  if (points.length === 0) return null
  let minLat = Infinity
  let minLon = Infinity
  let maxLat = -Infinity
  let maxLon = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon)
    maxLon = Math.max(maxLon, p.lon)
  }
  return [minLon - padDeg, minLat - padDeg, maxLon + padDeg, maxLat + padDeg]
}
