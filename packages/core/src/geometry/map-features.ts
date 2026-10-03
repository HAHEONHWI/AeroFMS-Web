import { destinationPoint, isDiscontinuity, isLeg, normalizeHeading } from '@aerofms/shared'
import type { FlightPlan, FlightPlanLeg, HoldDefinition, LatLon } from '@aerofms/shared'
import type { NavigationProvider } from '@aerofms/navigation'
import type { FmsState } from '../state/types'
import type { VnavProfile } from '../vnav/profile'
import { magToTrue } from '../flightplan/geometry'

/**
 * Platform-neutral map geometry derived from FMS state (GeoJSON-like, [lon, lat]).
 * Web renders it with MapLibre; Android renders it with SVG. Both use the same data,
 * so the map can never disagree with the flight plan.
 */

export type Position = [number, number]

export interface MapLine {
  id: string
  coordinates: Position[]
  kind: 'ACTIVE' | 'MOD' | 'MISSED' | 'SKIPPED' | 'HOLD' | 'FIX_RADIAL' | 'FIX_RING' | 'RUNWAY' | 'AIRWAY' | 'SECONDARY' | 'TRACK'
  segment?: string
  dashed?: boolean
}

export interface MapPoint {
  id: string
  coordinate: Position
  kind: 'WAYPOINT' | 'AIRPORT' | 'NAVAID' | 'AIRCRAFT' | 'TOC' | 'TOD' | 'STEP' | 'DISCONTINUITY' | 'FIX_REF'
  label: string
  legId?: string
  active?: boolean
  highlighted?: boolean
  modified?: boolean
  constraint?: string
  headingTrue?: number
}

export interface MapScene {
  lines: MapLine[]
  points: MapPoint[]
  /** [minLon, minLat, maxLon, maxLat] */
  bounds?: [number, number, number, number]
}

const pos = (p: LatLon): Position => [p.lon, p.lat]

export function constraintLabel(leg: FlightPlanLeg): string | undefined {
  const parts: string[] = []
  if (leg.speedConstraint) parts.push(`${leg.speedConstraint.speedKt}`)
  const a = leg.altitudeConstraint
  if (a) {
    const fmt = (ft: number): string => (ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${ft}`)
    if (a.type === 'BETWEEN') parts.push(`${fmt(a.altitude2Ft ?? 0)}A${fmt(a.altitudeFt)}B`)
    else parts.push(`${fmt(a.altitudeFt)}${a.type === 'AT_OR_ABOVE' ? 'A' : a.type === 'AT_OR_BELOW' ? 'B' : ''}`)
  }
  return parts.length ? parts.join('/') : undefined
}

/** Racetrack approximation of a holding pattern (inbound leg ends at the fix). */
export function holdRacetrack(fix: LatLon, hold: HoldDefinition, magVar = 0, groundSpeedKt = 210): Position[] {
  const inboundTrue = magToTrue(hold.inboundCourse, magVar)
  const legNm = hold.legDistanceNm ?? ((hold.legTimeMin ?? 1) * groundSpeedKt) / 60
  // Standard-rate (3°/s) turn radius ≈ GS / (60·π) NM.
  const radiusNm = Math.max(1, groundSpeedKt / (60 * Math.PI))
  const side = hold.turn === 'R' ? 90 : -90
  const outbound = normalizeHeading(inboundTrue + 180)
  const pts: Position[] = []
  // Turn at the fix onto the outbound leg.
  const center1 = destinationPoint(fix, normalizeHeading(inboundTrue + side), radiusNm)
  for (let a = 0; a <= 180; a += 15) {
    pts.push(pos(destinationPoint(center1, normalizeHeading(inboundTrue - side + (hold.turn === 'R' ? a : -a)), radiusNm)))
  }
  const outboundStart = destinationPoint(fix, normalizeHeading(inboundTrue + side), radiusNm * 2)
  const outboundEnd = destinationPoint(outboundStart, outbound, legNm)
  pts.push(pos(outboundEnd))
  const center2 = destinationPoint(outboundEnd, normalizeHeading(inboundTrue - side), radiusNm)
  for (let a = 0; a <= 180; a += 15) {
    pts.push(pos(destinationPoint(center2, normalizeHeading(outbound - side + (hold.turn === 'R' ? a : -a)), radiusNm)))
  }
  pts.push(pos(fix))
  return pts
}

function planLines(plan: FlightPlan, kind: 'ACTIVE' | 'MOD' | 'SECONDARY', idPrefix: string): MapLine[] {
  const lines: MapLine[] = []
  let current: Position[] = []
  let segment: string | undefined
  let n = 0
  const flush = (): void => {
    if (current.length >= 2) lines.push({ id: `${idPrefix}-${n++}`, coordinates: current, kind, segment, dashed: kind !== 'ACTIVE' })
    current = []
  }
  const missed: Position[] = []
  let lastFlown: FlightPlanLeg | undefined
  for (const e of plan.elements) {
    if (isDiscontinuity(e)) {
      flush()
      continue
    }
    if (!isLeg(e)) continue
    if (e.missed) {
      if (!missed.length && lastFlown) missed.push(pos(lastFlown.waypoint))
      missed.push(pos(e.waypoint))
      continue
    }
    if (segment !== undefined && e.segment !== segment && current.length) {
      // Break into per-segment lines so procedures can be styled, keeping continuity.
      const last = current[current.length - 1]
      flush()
      if (last) current.push(last)
    }
    segment = e.segment
    current.push(pos(e.waypoint))
    lastFlown = e
  }
  flush()
  if (missed.length >= 2) lines.push({ id: `${idPrefix}-missed`, coordinates: missed, kind: 'ACTIVE', segment: 'MISSED', dashed: true })
  return lines.map((l) => (l.segment === 'MISSED' ? { ...l, kind: 'MISSED' as const } : l))
}

export interface MapSceneOptions {
  showAirways?: boolean
  vnav?: VnavProfile
}

export function buildMapScene(state: FmsState, nav: NavigationProvider, options: MapSceneOptions = {}): MapScene {
  const lines: MapLine[] = []
  const points: MapPoint[] = []
  const active = state.activeFlightPlan
  const mod = state.modifiedFlightPlan
  const shown = mod ?? active
  const all: LatLon[] = []

  lines.push(...planLines(active, 'ACTIVE', 'act'))
  if (mod) {
    lines.push(...planLines(mod, 'MOD', 'mod'))
    // Skipped legs: present in active, missing in the modified plan.
    const modIds = new Set(mod.elements.map((e) => e.id))
    const skipped = active.elements.filter((e): e is FlightPlanLeg => isLeg(e) && !modIds.has(e.id))
    for (const s of skipped) {
      points.push({ id: `skip-${s.id}`, coordinate: pos(s.waypoint), kind: 'WAYPOINT', label: s.waypoint.ident, legId: s.id, modified: true })
    }
  }
  if (state.secondaryFlightPlan) lines.push(...planLines(state.secondaryFlightPlan, 'SECONDARY', 'sec'))

  shown.elements.forEach((e, i) => {
    if (isDiscontinuity(e)) {
      const prev = shown.elements[i - 1]
      if (isLeg(prev)) points.push({ id: e.id, coordinate: pos(prev.waypoint), kind: 'DISCONTINUITY', label: '' })
      return
    }
    if (!isLeg(e)) return
    all.push(e.waypoint)
    const isAirport = e.waypoint.type === 'AIRPORT'
    points.push({
      id: `wp-${e.id}`,
      coordinate: pos(e.waypoint),
      kind: isAirport ? 'AIRPORT' : 'WAYPOINT',
      label: e.waypoint.ident,
      legId: e.id,
      active: i === shown.activeLegIndex,
      highlighted: state.navigation.highlightedLegId === e.id,
      modified: !!mod,
      constraint: constraintLabel(e),
    })
    if (e.hold) {
      lines.push({ id: `hold-${e.id}`, coordinates: holdRacetrack(e.waypoint, e.hold, e.waypoint.magVar), kind: 'HOLD', dashed: e.missed })
    }
  })

  // Airports & runways of origin/destination.
  for (const icao of [shown.origin, shown.destination]) {
    if (!icao) continue
    const ap = nav.searchAirport(icao)
    if (!ap) continue
    all.push(ap)
    if (!points.some((p) => p.kind === 'AIRPORT' && p.label === ap.icao)) {
      points.push({ id: `ap-${ap.icao}`, coordinate: pos(ap), kind: 'AIRPORT', label: ap.icao })
    }
    for (const rw of ap.runways) {
      const end = destinationPoint(rw, rw.headingTrue, rw.lengthFt / 6076.12)
      if (rw.headingTrue >= 180) continue // one line per physical runway
      lines.push({ id: `rw-${ap.icao}-${rw.ident}`, coordinates: [pos(rw), pos(end)], kind: 'RUNWAY' })
    }
  }

  // FIX INFO rings and radials.
  state.navigation.fixInfo.forEach((f, idx) => {
    points.push({ id: `fix-${idx}`, coordinate: pos(f.ref), kind: 'FIX_REF', label: f.ref.ident })
    for (const r of f.radials) {
      const end = destinationPoint(f.ref, magToTrue(r, f.ref.magVar), 120)
      lines.push({ id: `fixr-${idx}-${r}`, coordinates: [pos(f.ref), pos(end)], kind: 'FIX_RADIAL', dashed: true })
    }
    for (const d of f.distancesNm) {
      const ring: Position[] = []
      for (let a = 0; a <= 360; a += 10) ring.push(pos(destinationPoint(f.ref, a, d)))
      lines.push({ id: `fixd-${idx}-${d}`, coordinates: ring, kind: 'FIX_RING', dashed: true })
    }
  })

  const vnav = options.vnav
  if (vnav?.topOfClimb) points.push({ id: 'toc', coordinate: pos(vnav.topOfClimb.position), kind: 'TOC', label: 'T/C' })
  if (vnav?.topOfDescent) points.push({ id: 'tod', coordinate: pos(vnav.topOfDescent.position), kind: 'TOD', label: 'T/D' })
  if (vnav?.stepClimb) points.push({ id: 'step', coordinate: pos(vnav.stepClimb.position), kind: 'STEP', label: 'S/C' })

  if (options.showAirways) {
    for (const aw of nav.allAirways()) {
      lines.push({ id: `aw-${aw.name}`, coordinates: aw.fixes.map(pos), kind: 'AIRWAY', segment: aw.name })
    }
  }

  const ac = state.position.aircraft
  if (ac) {
    all.push(ac)
    points.push({ id: 'aircraft', coordinate: pos(ac), kind: 'AIRCRAFT', label: '', headingTrue: state.position.headingTrue })
  }

  let bounds: MapScene['bounds']
  if (all.length) {
    const lons = all.map((p) => p.lon)
    const lats = all.map((p) => p.lat)
    bounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
  }
  return { lines, points, bounds }
}
