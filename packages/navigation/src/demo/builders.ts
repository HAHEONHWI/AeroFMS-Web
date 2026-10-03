import { destinationPoint, normalizeHeading } from '@aerofms/shared'
import type { Airport, LatLon, Runway, Waypoint } from '@aerofms/shared'

const FT_PER_NM = 6076.12

export interface AirportSpec {
  icao: string
  iata?: string
  name: string
  nameKo?: string
  city?: string
  country: string
  lat: number
  lon: number
  elevationFt: number
  magVar: number
  transitionAltitudeFt: number
  transitionLevelFt?: number
  runways: RunwayPairSpec[]
}

export interface RunwayPairSpec {
  /** Low-numbered end, e.g. "15L" */
  a: string
  /** Opposite end, e.g. "33R" */
  b: string
  /** Magnetic heading of end `a`. */
  headingMagA: number
  lengthFt: number
  /** Lateral offset of runway centre from airport reference point, NM (positive = right of `a` heading). */
  lateralNm?: number
  /** Longitudinal offset of runway centre along heading `a`, NM. */
  alongNm?: number
  ilsA?: number
  ilsB?: number
}

/** Builds an airport with runway thresholds derived from the runway centre geometry. */
export function buildAirport(spec: AirportSpec): Airport {
  const runways: Runway[] = []
  const ref: LatLon = { lat: spec.lat, lon: spec.lon }
  for (const r of spec.runways) {
    const trueA = normalizeHeading(r.headingMagA + spec.magVar)
    const trueB = normalizeHeading(trueA + 180)
    let center = destinationPoint(ref, normalizeHeading(trueA + 90), r.lateralNm ?? 0)
    center = destinationPoint(center, trueA, r.alongNm ?? 0)
    const half = r.lengthFt / FT_PER_NM / 2
    const thrA = destinationPoint(center, trueB, half)
    const thrB = destinationPoint(center, trueA, half)
    const round = (v: number): number => Math.round(v * 1e6) / 1e6
    runways.push({
      ident: r.a,
      headingMag: r.headingMagA,
      headingTrue: Math.round(trueA * 10) / 10,
      lat: round(thrA.lat),
      lon: round(thrA.lon),
      lengthFt: r.lengthFt,
      elevationFt: spec.elevationFt,
      ilsFrequency: r.ilsA,
      ilsCourse: r.ilsA ? r.headingMagA : undefined,
      glideslopeDeg: r.ilsA ? 3 : undefined,
    })
    const magB = normalizeHeading(r.headingMagA + 180)
    runways.push({
      ident: r.b,
      headingMag: magB,
      headingTrue: Math.round(trueB * 10) / 10,
      lat: round(thrB.lat),
      lon: round(thrB.lon),
      lengthFt: r.lengthFt,
      elevationFt: spec.elevationFt,
      ilsFrequency: r.ilsB,
      ilsCourse: r.ilsB ? magB : undefined,
      glideslopeDeg: r.ilsB ? 3 : undefined,
    })
  }
  return {
    icao: spec.icao,
    iata: spec.iata,
    name: spec.name,
    nameKo: spec.nameKo,
    city: spec.city,
    country: spec.country,
    lat: spec.lat,
    lon: spec.lon,
    elevationFt: spec.elevationFt,
    magVar: spec.magVar,
    transitionAltitudeFt: spec.transitionAltitudeFt,
    transitionLevelFt: spec.transitionLevelFt,
    speedLimitKt: 250,
    speedLimitAltitudeFt: 10000,
    runways,
  }
}

/** A fix on the extended runway centreline `distNm` before the threshold (approach side). */
export function finalFix(airport: Airport, runwayIdent: string, ident: string, distNm: number, offsetDeg = 0): Waypoint {
  const rwy = airport.runways.find((r) => r.ident === runwayIdent)
  if (!rwy) throw new Error(`Runway ${runwayIdent} not found at ${airport.icao}`)
  const p = destinationPoint(rwy, normalizeHeading(rwy.headingTrue + 180 + offsetDeg), distNm)
  return { ident, lat: round4(p.lat), lon: round4(p.lon), type: 'FIX', region: airport.icao.slice(0, 2), magVar: airport.magVar }
}

/** A fix beyond the departure end of a runway (`distNm` after the opposite threshold, along heading). */
export function departureFix(airport: Airport, runwayIdent: string, ident: string, distNm: number, turnDeg = 0): Waypoint {
  const rwy = airport.runways.find((r) => r.ident === runwayIdent)
  if (!rwy) throw new Error(`Runway ${runwayIdent} not found at ${airport.icao}`)
  const p = destinationPoint(rwy, normalizeHeading(rwy.headingTrue + turnDeg), distNm + rwy.lengthFt / FT_PER_NM)
  return { ident, lat: round4(p.lat), lon: round4(p.lon), type: 'FIX', region: airport.icao.slice(0, 2), magVar: airport.magVar }
}

export const fix = (ident: string, lat: number, lon: number, region: string, magVar: number): Waypoint => ({
  ident,
  lat,
  lon,
  type: 'FIX',
  region,
  magVar,
})

const round4 = (v: number): number => Math.round(v * 1e4) / 1e4
