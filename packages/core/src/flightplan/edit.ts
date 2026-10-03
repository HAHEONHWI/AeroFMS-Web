import { isDiscontinuity, isLeg } from '@aerofms/shared'
import type {
  Airport,
  FlightPlan,
  FlightPlanElement,
  FlightPlanLeg,
  FlightPlanSegment,
  HoldDefinition,
  LatLon,
  Procedure,
  Waypoint,
} from '@aerofms/shared'
import type { NavigationProvider } from '@aerofms/navigation'
import { FmsEntryError } from '../messages/codes'
import { airportWaypoint, makeDiscontinuity, makeLeg, runwayWaypoint } from './factory'
import type { IdFactory } from './factory'
import { recomputeGeometry, trueToMag } from './geometry'
import { buildProcedureLegs, procedureRunways } from './procedures'

/**
 * Flight plan editing operations. All functions mutate the given plan (an immer draft
 * in the engine) and keep the element graph consistent: discontinuities are real
 * elements that break the path, and the active leg pointer follows its element.
 */

const SEGMENT_ORDER: Record<FlightPlanSegment, number> = {
  ORIGIN: 0,
  DEPARTURE: 1,
  ENROUTE: 2,
  ARRIVAL: 3,
  APPROACH: 4,
  MISSED: 5,
  DESTINATION: 6,
}

export interface PlanEditContext {
  nav: NavigationProvider
  ids: IdFactory
}

/** Runs `fn` and keeps `activeLegIndex` pointing at the same element (or the nearest valid leg). */
export function trackActiveLeg(plan: FlightPlan, fn: () => void): void {
  const activeId = plan.elements[plan.activeLegIndex]?.id
  fn()
  const idx = activeId ? plan.elements.findIndex((e) => e.id === activeId) : -1
  if (idx >= 0) plan.activeLegIndex = idx
  normalizeActiveIndex(plan)
}

export function normalizeActiveIndex(plan: FlightPlan): void {
  const n = plan.elements.length
  if (n === 0) {
    plan.activeLegIndex = 0
    return
  }
  let idx = plan.progressed ? Math.min(Math.max(plan.activeLegIndex, n > 1 ? 1 : 0), n - 1) : Math.min(1, n - 1)
  while (idx < n - 1 && !isLeg(plan.elements[idx])) idx++
  plan.activeLegIndex = idx
}

export function finalizePlan(plan: FlightPlan, now: number): void {
  removeRedundantDiscontinuities(plan)
  normalizeActiveIndex(plan)
  recomputeGeometry(plan)
  plan.updatedAt = now
}

function removeRedundantDiscontinuities(plan: FlightPlan): void {
  const out: FlightPlanElement[] = []
  for (const e of plan.elements) {
    if (isDiscontinuity(e)) {
      const last = out[out.length - 1]
      if (!last || isDiscontinuity(last)) continue
      // A discontinuity before missed-approach legs is meaningless.
    }
    out.push(e)
  }
  while (out.length && isDiscontinuity(out[out.length - 1])) out.pop()
  // Discontinuity directly before the first missed leg is removed (missed legs are continuous with the runway).
  for (let i = out.length - 2; i >= 0; i--) {
    const next = out[i + 1]
    if (isDiscontinuity(out[i]) && isLeg(next) && next.missed) out.splice(i, 1)
  }
  if (out.length !== plan.elements.length) {
    trackActiveLegReplace(plan, out)
  }
}

function trackActiveLegReplace(plan: FlightPlan, elements: FlightPlanElement[]): void {
  const activeId = plan.elements[plan.activeLegIndex]?.id
  plan.elements = elements
  const idx = activeId ? elements.findIndex((e) => e.id === activeId) : -1
  if (idx >= 0) plan.activeLegIndex = idx
}

const segmentOf = (e: FlightPlanElement): FlightPlanSegment | undefined => (isLeg(e) ? e.segment : e.segment)

/** Origin → departure/enroute and approach → missed are continuous; other boundaries need a matching fix. */
function boundaryContinuous(prev: FlightPlanSegment, next: FlightPlanSegment): boolean {
  if (prev === next) return true
  if (prev === 'ORIGIN' && (next === 'DEPARTURE' || next === 'ENROUTE')) return true
  if (prev === 'APPROACH' && next === 'MISSED') return true
  return false
}

/** Index range [start, end) of the elements belonging to `segment` (or insertion point when empty). */
function segmentRange(plan: FlightPlan, segment: FlightPlanSegment): [number, number] {
  const order = SEGMENT_ORDER[segment]
  let start = -1
  let end = -1
  plan.elements.forEach((e, i) => {
    const s = segmentOf(e)
    if (s === segment) {
      if (start < 0) start = i
      end = i + 1
    }
  })
  if (start >= 0) return [start, end]
  // Insertion point: after the last leg whose segment precedes `segment`.
  let insertAt = 0
  plan.elements.forEach((e, i) => {
    if (isLeg(e) && SEGMENT_ORDER[e.segment] < order) insertAt = i + 1
  })
  return [insertAt, insertAt]
}

/** Replaces all elements of a segment and repairs both boundaries. */
export function replaceSegment(plan: FlightPlan, segment: FlightPlanSegment, legs: FlightPlanLeg[], ids: IdFactory): void {
  trackActiveLeg(plan, () => {
    plan.elements = plan.elements.filter((e) => segmentOf(e) !== segment)
    const [insertAt] = segmentRange(plan, segment)
    // Strip an untagged discontinuity at the insertion boundary; boundaries are rebuilt below.
    if (isDiscontinuity(plan.elements[insertAt]) && plan.elements[insertAt]?.segment === undefined) {
      plan.elements.splice(insertAt, 1)
    }
    plan.elements.splice(insertAt, 0, ...legs)
    repairBoundaries(plan, insertAt, insertAt + legs.length, ids)
  })
}

/**
 * Ensures boundary correctness around [start,end): merges duplicate fixes and inserts
 * a discontinuity where two non-continuous segments meet at different fixes.
 */
function repairBoundaries(plan: FlightPlan, start: number, end: number, ids: IdFactory): void {
  const fixPair = (beforeIdx: number): void => {
    // Find last leg at or before beforeIdx-1 and first leg at or after beforeIdx (skipping untagged discos).
    let a = beforeIdx - 1
    let discoIdx = -1
    while (a >= 0 && isDiscontinuity(plan.elements[a])) {
      if (plan.elements[a]?.segment === undefined) discoIdx = a
      a--
    }
    let b = beforeIdx
    while (b < plan.elements.length && isDiscontinuity(plan.elements[b])) {
      if (plan.elements[b]?.segment === undefined) discoIdx = b
      b++
    }
    const left = plan.elements[a]
    const right = plan.elements[b]
    if (!isLeg(left) || !isLeg(right)) return
    if (left.waypoint.ident === right.waypoint.ident && left.waypoint.type !== 'PBD') {
      // Keep the earlier leg, adopt constraints from the later (procedure) leg.
      if (right.altitudeConstraint) left.altitudeConstraint = right.altitudeConstraint
      if (right.speedConstraint) left.speedConstraint = right.speedConstraint
      if (right.constraintSource) left.constraintSource = right.constraintSource
      if (right.hold && !left.hold) left.hold = right.hold
      plan.elements.splice(b, 1)
      if (discoIdx >= 0 && discoIdx < b) plan.elements.splice(discoIdx, 1)
      return
    }
    const continuous = boundaryContinuous(left.segment, right.segment)
    if (continuous && discoIdx >= 0) {
      plan.elements.splice(discoIdx, 1)
    } else if (!continuous && a + 1 === b) {
      plan.elements.splice(b, 0, makeDiscontinuity(ids))
    }
  }
  // Fix the trailing boundary first so that indices of the leading boundary stay valid.
  fixPair(end)
  fixPair(start)
}

// ───────────────────────── Airports / runways ─────────────────────────

export function setOrigin(plan: FlightPlan, airport: Airport, ids: IdFactory, destination?: Airport): void {
  plan.origin = airport.icao
  plan.departureRunway = undefined
  plan.sid = undefined
  plan.star = undefined
  plan.approach = undefined
  plan.arrivalRunway = undefined
  plan.pendingVia = undefined
  plan.elements = [makeLeg(ids, airportWaypoint(airport), 'ORIGIN', { legType: 'IF' })]
  plan.activeLegIndex = 0
  plan.progressed = false
  plan.destination = destination?.icao
  if (destination) {
    plan.elements.push(
      makeDiscontinuity(ids),
      makeLeg(ids, airportWaypoint(destination), 'DESTINATION', { via: 'DIRECT' }),
    )
  }
}

export function setDestinationLeg(plan: FlightPlan, airport: Airport, ids: IdFactory): void {
  plan.destination = airport.icao
  plan.star = undefined
  plan.approach = undefined
  plan.arrivalRunway = undefined
  trackActiveLeg(plan, () => {
    plan.elements = plan.elements.filter((e) => {
      const s = segmentOf(e)
      return s !== 'ARRIVAL' && s !== 'APPROACH' && s !== 'MISSED' && s !== 'DESTINATION'
    })
  })
  replaceSegment(plan, 'DESTINATION', [makeLeg(ids, airportWaypoint(airport), 'DESTINATION', { via: 'DIRECT' })], ids)
}

export function setDepartureRunway(plan: FlightPlan, ctx: PlanEditContext, airport: Airport, runwayIdent: string): void {
  const rw = airport.runways.find((r) => r.ident === runwayIdent)
  if (!rw) throw new FmsEntryError('RUNWAY_NOT_FOUND', runwayIdent)
  plan.departureRunway = rw.ident
  replaceSegment(plan, 'ORIGIN', [makeLeg(ctx.ids, runwayWaypoint(airport, rw), 'ORIGIN', { legType: 'IF' })], ctx.ids)
  // Re-build or drop the SID depending on runway compatibility.
  if (plan.sid) {
    const proc = ctx.nav.getProcedure(plan.sid.id)
    if (!proc || !procedureRunways(proc, airport).includes(rw.ident)) {
      setSid(plan, ctx, airport, null)
    } else {
      setSid(plan, ctx, airport, proc, plan.sid.transition)
    }
  }
}

export function setSid(
  plan: FlightPlan,
  ctx: PlanEditContext,
  airport: Airport,
  proc: Procedure | null,
  transition?: string,
): void {
  if (!proc) {
    plan.sid = undefined
    replaceSegment(plan, 'DEPARTURE', [], ctx.ids)
    return
  }
  const runway = plan.departureRunway ? airport.runways.find((r) => r.ident === plan.departureRunway) : undefined
  if (runway && !procedureRunways(proc, airport).includes(runway.ident)) throw new FmsEntryError('INVALID_ENTRY', proc.name)
  const legs = buildProcedureLegs(proc, transition, 'DEPARTURE', { nav: ctx.nav, airport, runway, ids: ctx.ids })
  plan.sid = { id: proc.id, name: proc.name, transition }
  replaceSegment(plan, 'DEPARTURE', legs, ctx.ids)
}

export function setStar(
  plan: FlightPlan,
  ctx: PlanEditContext,
  airport: Airport,
  proc: Procedure | null,
  transition?: string,
): void {
  if (!proc) {
    plan.star = undefined
    replaceSegment(plan, 'ARRIVAL', [], ctx.ids)
    return
  }
  const legs = buildProcedureLegs(proc, transition, 'ARRIVAL', { nav: ctx.nav, airport, ids: ctx.ids })
  plan.star = { id: proc.id, name: proc.name, transition }
  replaceSegment(plan, 'ARRIVAL', legs, ctx.ids)
}

export function setApproach(
  plan: FlightPlan,
  ctx: PlanEditContext,
  airport: Airport,
  proc: Procedure | null,
  transition?: string,
): void {
  if (!proc) {
    plan.approach = undefined
    plan.arrivalRunway = undefined
    replaceSegment(plan, 'MISSED', [], ctx.ids)
    replaceSegment(plan, 'APPROACH', [], ctx.ids)
    replaceSegment(plan, 'DESTINATION', [makeLeg(ctx.ids, airportWaypoint(airport), 'DESTINATION', { via: 'DIRECT' })], ctx.ids)
    return
  }
  const runway = airport.runways.find((r) => r.ident === proc.runways[0])
  const all = buildProcedureLegs(proc, transition, 'APPROACH', { nav: ctx.nav, airport, runway, ids: ctx.ids })
  plan.approach = { id: proc.id, name: proc.name, transition }
  plan.arrivalRunway = proc.runways[0]
  replaceSegment(plan, 'DESTINATION', [], ctx.ids)
  replaceSegment(plan, 'MISSED', [], ctx.ids)
  replaceSegment(plan, 'APPROACH', all.filter((l) => !l.missed), ctx.ids)
  const missed = all.filter((l) => l.missed)
  if (missed.length) replaceSegment(plan, 'MISSED', missed, ctx.ids)
}

// ───────────────────────── Route entries (RTE page) ─────────────────────────

export type RouteEntryKind = 'SID' | 'STAR' | 'AIRWAY' | 'DIRECT'

export interface RouteEntry {
  kind: RouteEntryKind
  via: string
  to: string
  legIds: string[]
}

const isAirwayVia = (via: string | undefined): boolean => !!via && via !== 'DIRECT'

/** Groups the flight plan into VIA/TO rows as shown on the Boeing RTE page. */
export function deriveRouteEntries(plan: FlightPlan): RouteEntry[] {
  const entries: RouteEntry[] = []
  let current: RouteEntry | undefined
  for (const e of plan.elements) {
    if (!isLeg(e)) {
      current = undefined
      continue
    }
    if (e.segment === 'DEPARTURE' || e.segment === 'ARRIVAL') {
      const kind: RouteEntryKind = e.segment === 'DEPARTURE' ? 'SID' : 'STAR'
      const sel = e.segment === 'DEPARTURE' ? plan.sid : plan.star
      const via = sel ? (sel.transition ? `${sel.name}.${sel.transition}` : sel.name) : (e.via ?? '')
      if (current && current.kind === kind) {
        current.to = e.waypoint.ident
        current.legIds.push(e.id)
      } else {
        current = { kind, via, to: e.waypoint.ident, legIds: [e.id] }
        entries.push(current)
      }
      continue
    }
    if (e.segment !== 'ENROUTE') {
      current = undefined
      continue
    }
    if (isAirwayVia(e.via) && current && current.kind === 'AIRWAY' && current.via === e.via) {
      current.to = e.waypoint.ident
      current.legIds.push(e.id)
      continue
    }
    current = isAirwayVia(e.via)
      ? { kind: 'AIRWAY', via: e.via ?? '', to: e.waypoint.ident, legIds: [e.id] }
      : { kind: 'DIRECT', via: 'DIRECT', to: e.waypoint.ident, legIds: [e.id] }
    entries.push(current)
  }
  return entries
}

/** Fixes of `airway` strictly after `from` up to and including `to`, in travel order. */
export function expandAirway(nav: NavigationProvider, airwayName: string, from: string, to: string): Waypoint[] {
  const aw = nav.getAirway(airwayName)
  if (!aw) throw new FmsEntryError('NOT_IN_DATABASE', airwayName)
  const i = aw.fixes.findIndex((f) => f.ident === from)
  const j = aw.fixes.findIndex((f) => f.ident === to)
  if (i < 0) throw new FmsEntryError('AIRWAY_NOT_CONNECTED', `${airwayName}:${from}`)
  if (j < 0 || i === j) throw new FmsEntryError('INVALID_ENTRY', `${airwayName}:${to}`)
  const slice = i < j ? aw.fixes.slice(i + 1, j + 1) : aw.fixes.slice(j, i).reverse()
  return slice.map((f) => nav.findWaypoint(f.ident, f) ?? { ident: f.ident, lat: f.lat, lon: f.lon, type: f.type })
}

export function airwayContains(nav: NavigationProvider, airwayName: string, ident: string): boolean {
  return !!nav.getAirway(airwayName)?.fixes.some((f) => f.ident === ident)
}

/** Last leg before the enroute insertion point (end of enroute, else departure, else origin). */
export function lastEnrouteAnchor(plan: FlightPlan): { index: number; leg?: FlightPlanLeg } {
  let idx = -1
  plan.elements.forEach((e, i) => {
    if (isLeg(e) && SEGMENT_ORDER[e.segment] <= SEGMENT_ORDER.ENROUTE) idx = i
  })
  const leg = plan.elements[idx]
  return { index: idx, leg: isLeg(leg) ? leg : undefined }
}

/** Appends a VIA/TO row at the end of the enroute portion. */
export function appendRouteEntry(plan: FlightPlan, ctx: PlanEditContext, via: string, to: Waypoint): void {
  const anchor = lastEnrouteAnchor(plan)
  let legs: FlightPlanLeg[]
  if (via === 'DIRECT') {
    legs = [makeLeg(ctx.ids, to, 'ENROUTE', { via: 'DIRECT' })]
  } else {
    if (!anchor.leg) throw new FmsEntryError('INVALID_ENTRY', via)
    legs = expandAirway(ctx.nav, via, anchor.leg.waypoint.ident, to.ident).map((w) =>
      makeLeg(ctx.ids, w, 'ENROUTE', { via }),
    )
  }
  trackActiveLeg(plan, () => {
    const insertAt = anchor.index + 1
    plan.elements.splice(insertAt, 0, ...legs)
    repairBoundaries(plan, insertAt + legs.length, insertAt + legs.length, ctx.ids)
  })
}

/** Rebuilds an existing VIA/TO row with a new VIA and/or TO. */
export function replaceRouteEntry(plan: FlightPlan, ctx: PlanEditContext, entry: RouteEntry, via: string, to: Waypoint): void {
  const firstIdx = plan.elements.findIndex((e) => e.id === entry.legIds[0])
  if (firstIdx < 0) throw new FmsEntryError('INVALID_ENTRY')
  let prevIdx = firstIdx - 1
  while (prevIdx >= 0 && !isLeg(plan.elements[prevIdx])) prevIdx--
  const prev = plan.elements[prevIdx]
  let legs: FlightPlanLeg[]
  if (via === 'DIRECT') legs = [makeLeg(ctx.ids, to, 'ENROUTE', { via: 'DIRECT' })]
  else {
    if (!isLeg(prev)) throw new FmsEntryError('INVALID_ENTRY')
    legs = expandAirway(ctx.nav, via, prev.waypoint.ident, to.ident).map((w) => makeLeg(ctx.ids, w, 'ENROUTE', { via }))
  }
  trackActiveLeg(plan, () => {
    const remove = new Set(entry.legIds)
    plan.elements = plan.elements.filter((e) => !remove.has(e.id))
    plan.elements.splice(firstIdx, 0, ...legs)
    // Continuity with the following element.
    const after = firstIdx + legs.length
    const next = plan.elements[after]
    const last = legs[legs.length - 1]
    if (isLeg(next) && last) {
      if (next.waypoint.ident === last.waypoint.ident) plan.elements.splice(after, 1)
      else if (isAirwayVia(next.via) && next.segment === 'ENROUTE' && !airwayContains(ctx.nav, next.via ?? '', last.waypoint.ident)) {
        plan.elements.splice(after, 0, makeDiscontinuity(ctx.ids, 'ENROUTE'))
      }
    }
  })
}

/** Deletes a VIA/TO row; the gap becomes a route discontinuity. */
export function deleteRouteEntry(plan: FlightPlan, ctx: PlanEditContext, entry: RouteEntry): void {
  if (entry.kind === 'SID' || entry.kind === 'STAR') throw new FmsEntryError('INVALID_DELETE')
  trackActiveLeg(plan, () => {
    const firstIdx = plan.elements.findIndex((e) => e.id === entry.legIds[0])
    const remove = new Set(entry.legIds)
    plan.elements = plan.elements.filter((e) => !remove.has(e.id))
    if (firstIdx > 0 && firstIdx < plan.elements.length) {
      plan.elements.splice(firstIdx, 0, makeDiscontinuity(ctx.ids, 'ENROUTE'))
    }
  })
}

// ───────────────────────── LEGS / F-PLN editing ─────────────────────────

function segmentForInsert(plan: FlightPlan, index: number): FlightPlanSegment {
  const at = plan.elements[index]
  const prev = plan.elements[index - 1]
  const seg = (isLeg(at) ? at.segment : undefined) ?? (isLeg(prev) ? prev.segment : undefined) ?? 'ENROUTE'
  return seg === 'ORIGIN' || seg === 'DESTINATION' ? 'ENROUTE' : seg
}

/**
 * Inserts `waypoint` before element `index`.
 * withDiscontinuity=true (Boeing): a ROUTE DISCONTINUITY follows the new waypoint.
 */
export function insertWaypointBefore(
  plan: FlightPlan,
  ids: IdFactory,
  index: number,
  waypoint: Waypoint,
  withDiscontinuity: boolean,
): FlightPlanLeg {
  if (index <= 0) throw new FmsEntryError('INVALID_ENTRY')
  const leg = makeLeg(ids, waypoint, segmentForInsert(plan, index), { via: 'DIRECT' })
  trackActiveLeg(plan, () => {
    const target = plan.elements[index]
    const items: FlightPlanElement[] = [leg]
    if (withDiscontinuity && !isDiscontinuity(target) && target) items.push(makeDiscontinuity(ids, leg.segment))
    plan.elements.splice(index, 0, ...items)
  })
  if (plan.activeLegIndex === index + (withDiscontinuity ? 2 : 1)) plan.activeLegIndex = index
  return leg
}

/** Connects element `index` directly to existing downstream element `targetIndex` (deletes everything between). */
export function connectToDownstream(plan: FlightPlan, index: number, targetIndex: number): void {
  if (targetIndex <= index) throw new FmsEntryError('INVALID_ENTRY')
  trackActiveLeg(plan, () => {
    plan.elements.splice(index, targetIndex - index)
  })
  if (plan.activeLegIndex > index) plan.activeLegIndex = Math.max(1, Math.min(plan.activeLegIndex, index))
  const leg = plan.elements[index]
  if (isLeg(leg) && leg.segment === 'ENROUTE') leg.via = 'DIRECT'
}

/** Deletes element `index`. Legs are replaced by a discontinuity unless one is already adjacent. */
export function deleteElement(plan: FlightPlan, ids: IdFactory, index: number, opts: { allowDiscontinuityDelete: boolean }): void {
  const el = plan.elements[index]
  if (!el) throw new FmsEntryError('INVALID_DELETE')
  if (isDiscontinuity(el)) {
    if (!opts.allowDiscontinuityDelete) throw new FmsEntryError('INVALID_DELETE')
    trackActiveLeg(plan, () => {
      plan.elements.splice(index, 1)
    })
    return
  }
  if (el.segment === 'ORIGIN' || index === 0) throw new FmsEntryError('INVALID_DELETE')
  if (el.segment === 'DESTINATION') throw new FmsEntryError('INVALID_DELETE')
  const wasActive = plan.activeLegIndex === index
  trackActiveLeg(plan, () => {
    const prev = plan.elements[index - 1]
    const next = plan.elements[index + 1]
    if (isDiscontinuity(prev) || isDiscontinuity(next) || !next) plan.elements.splice(index, 1)
    else plan.elements.splice(index, 1, makeDiscontinuity(ids, el.segment))
  })
  if (wasActive) {
    plan.activeLegIndex = Math.min(index, plan.elements.length - 1)
    normalizeActiveIndex(plan)
  }
}

export function setLegConstraints(
  leg: FlightPlanLeg,
  entry: { speed?: FlightPlanLeg['speedConstraint']; altitude?: FlightPlanLeg['altitudeConstraint']; hasSpeed: boolean; hasAltitude: boolean },
): void {
  if (entry.hasSpeed) leg.speedConstraint = entry.speed
  if (entry.hasAltitude) leg.altitudeConstraint = entry.altitude
  leg.constraintSource = 'PILOT'
}

export function clearLegConstraints(leg: FlightPlanLeg): void {
  leg.speedConstraint = undefined
  leg.altitudeConstraint = undefined
  leg.constraintSource = undefined
}

/**
 * Direct-To. The aircraft position becomes a turn point leg, legs between the present
 * active leg and the target are skipped. A target not in the plan is inserted with a
 * discontinuity after it.
 */
export function directTo(
  plan: FlightPlan,
  ids: IdFactory,
  target: { index: number } | { waypoint: Waypoint },
  ppos: LatLon,
  turnPointIdent: string,
): void {
  const fromIdx = Math.max(1, plan.activeLegIndex)
  const tp = makeLeg(
    ids,
    { ident: turnPointIdent, lat: ppos.lat, lon: ppos.lon, type: 'TURN_POINT' },
    segmentForInsert(plan, fromIdx),
    { legType: 'IF', via: 'DIRECT' },
  )
  if ('index' in target) {
    const t = plan.elements[target.index]
    if (!isLeg(t) || target.index < fromIdx) throw new FmsEntryError('INVALID_ENTRY')
    const history = plan.elements.slice(0, fromIdx)
    const rest = plan.elements.slice(target.index)
    plan.elements = [...history, tp, ...rest]
    const tgt = plan.elements[history.length + 1]
    if (isLeg(tgt)) {
      tgt.legType = 'DF'
    }
    plan.activeLegIndex = history.length + 1
    plan.progressed = true
  } else {
    const history = plan.elements.slice(0, fromIdx)
    const rest = plan.elements.slice(fromIdx)
    const leg = makeLeg(ids, target.waypoint, tp.segment, { legType: 'DF', via: 'DIRECT' })
    plan.elements = [...history, tp, leg, makeDiscontinuity(ids, tp.segment), ...rest]
    plan.activeLegIndex = history.length + 1
    plan.progressed = true
  }
}

export function defaultHoldFor(leg: FlightPlanLeg, altitudeFt: number): HoldDefinition {
  const inbound = leg.calculatedTrack !== undefined ? trueToMag(leg.calculatedTrack, leg.waypoint.magVar) : 0
  return {
    inboundCourse: Math.round(inbound) % 360,
    turn: 'R',
    legTimeMin: altitudeFt > 14000 ? 1.5 : 1,
    exitArmed: false,
    source: 'PILOT',
  }
}

export function plannedLegs(plan: FlightPlan): FlightPlanLeg[] {
  return plan.elements.filter((e): e is FlightPlanLeg => isLeg(e))
}

/** Removes the destination/arrival data when origin == destination edits etc. Utility for tests and import. */
export function hasDiscontinuity(plan: FlightPlan): boolean {
  return plan.elements.some((e, i) => isDiscontinuity(e) && i < plan.elements.length - 1)
}
