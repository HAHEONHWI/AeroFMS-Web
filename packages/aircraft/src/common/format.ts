import type { AltitudeConstraint, LatLon, SpeedConstraint } from '@aerofms/shared'

/** CDU text formatting helpers shared by Boeing and Airbus page sets. */

export const BOX = '□'
export const boxes = (n: number): string => BOX.repeat(n)
export const dashes = (n: number): string => '-'.repeat(n)

export function fmtAlt(ft: number | undefined, transitionAltitudeFt = 18000): string {
  if (ft === undefined) return ''
  if (ft >= transitionAltitudeFt) return `FL${String(Math.round(ft / 100)).padStart(3, '0')}`
  return String(Math.round(ft))
}

export function fmtFl(ft: number | undefined): string {
  if (ft === undefined) return ''
  return `FL${String(Math.round(ft / 100)).padStart(3, '0')}`
}

/** Boeing style constraint: " 4000A", "FL240B", "220A240B", "5000" */
export function fmtBoeingAltConstraint(c: AltitudeConstraint | undefined, trans = 18000): string {
  if (!c) return ''
  if (c.type === 'BETWEEN') return `${fmtAlt(c.altitude2Ft ?? 0, trans)}A${fmtAlt(c.altitudeFt, trans)}B`
  const suffix = c.type === 'AT_OR_ABOVE' ? 'A' : c.type === 'AT_OR_BELOW' ? 'B' : ''
  return `${fmtAlt(c.altitudeFt, trans)}${suffix}`
}

/** Airbus style constraint: "+FL240", "-10000", "5000" */
export function fmtAirbusAltConstraint(c: AltitudeConstraint | undefined, trans = 18000): string {
  if (!c) return ''
  if (c.type === 'BETWEEN') return `+${fmtAlt(c.altitude2Ft ?? 0, trans)}`
  const prefix = c.type === 'AT_OR_ABOVE' ? '+' : c.type === 'AT_OR_BELOW' ? '-' : ''
  return `${prefix}${fmtAlt(c.altitudeFt, trans)}`
}

export function fmtSpeedConstraint(c: SpeedConstraint | undefined): string {
  return c ? String(c.speedKt) : ''
}

export function fmtMach(m: number | undefined): string {
  if (m === undefined) return ''
  return `.${String(Math.round(m * 1000)).padStart(3, '0')}`
}

/** Thousands of kg with one decimal: 61500 → "61.5" */
export function fmtWeight(kg: number | undefined, decimals = 1): string {
  if (kg === undefined) return ''
  return (kg / 1000).toFixed(decimals)
}

export function fmtCourse(deg: number | undefined): string {
  if (deg === undefined || !Number.isFinite(deg)) return '---°'
  const v = Math.round(deg) % 360
  return `${String(v === 0 ? 360 : v).padStart(3, '0')}°`
}

export function fmtLatLonBoeing(p: LatLon | undefined): string {
  if (!p) return ''
  const part = (v: number, pos: string, neg: string, w: number): string => {
    const a = Math.abs(v)
    const d = Math.floor(a)
    const m = ((a - d) * 60).toFixed(1).padStart(4, '0')
    return `${v >= 0 ? pos : neg}${String(d).padStart(w, '0')}°${m}`
  }
  return `${part(p.lat, 'N', 'S', 2)} ${part(p.lon, 'E', 'W', 3)}`
}

export function fmtLatLonAirbus(p: LatLon | undefined): string {
  if (!p) return ''
  const part = (v: number, pos: string, neg: string, w: number): string => {
    const a = Math.abs(v)
    const d = Math.floor(a)
    const m = ((a - d) * 60).toFixed(1).padStart(4, '0')
    return `${String(d).padStart(w, '0')}°${m}${v >= 0 ? pos : neg}`
  }
  return `${part(p.lat, 'N', 'S', 2)}/${part(p.lon, 'E', 'W', 3)}`
}

/** "1234.5z" */
export function fmtZulu(epochMs: number | undefined, decimals = true): string {
  if (epochMs === undefined || !Number.isFinite(epochMs)) return '----z'
  const d = new Date(epochMs)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = d.getUTCMinutes() + (decimals ? Math.floor(d.getUTCSeconds() / 6) / 10 : 0)
  return `${hh}${decimals ? mm.toFixed(1).padStart(4, '0') : String(Math.floor(mm)).padStart(2, '0')}z`
}

/** "HHMM" for Airbus time columns */
export function fmtHhmm(epochMs: number | undefined): string {
  if (epochMs === undefined || !Number.isFinite(epochMs)) return '----'
  const d = new Date(epochMs)
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function fmtDistance(nm: number | undefined): string {
  if (nm === undefined || !Number.isFinite(nm)) return ''
  return nm >= 100 ? String(Math.round(nm)) : nm.toFixed(nm < 10 ? 1 : 0)
}

export function fmtTemp(c: number | undefined): string {
  if (c === undefined) return ''
  return `${c >= 0 ? '+' : ''}${c}°C`
}

export const padTo = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length))
export const padStartTo = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s)
