import { isDiscontinuity, isLeg } from '@aerofms/shared'
import type { Draft } from 'immer'
import type { FlightPlan, Waypoint } from '@aerofms/shared'
import { FmsEntryError } from '../messages/codes'
import type { HandlerContext } from '../page/types'
import type { FmsState } from '../state/types'
import {
  appendRouteEntry,
  deleteElement,
  directTo,
  insertWaypointBefore,
  setApproach,
  setDepartureRunway,
  setDestinationLeg,
  setOrigin,
  setSid,
  setStar,
  trackActiveLeg,
} from '../flightplan/edit'
import { findLegIndex, legIndexById } from '../flightplan/geometry'
import { commitModification, discardModification } from '../execution/modification'
import {
  isIcao,
  parseCostIndex,
  parseCruiseAltitude,
  parseLatLon,
  parsePlaceBearingDistance,
  parseRunwayIdent,
  parseWeightKg,
} from '../validation/parsers'
import { destinationPoint } from '@aerofms/shared'
import { magToTrue } from '../flightplan/geometry'

/**
 * Domain operations shared by CDU/MCDU page handlers, the Modern View and the
 * simulator connector. Every operation validates its input and throws FmsEntryError.
 */

export function requireAirport(ctx: HandlerContext, icao: string) {
  const s = icao.trim().toUpperCase()
  if (!isIcao(s)) throw new FmsEntryError('INVALID_ENTRY', s)
  const ap = ctx.nav.searchAirport(s)
  if (!ap) throw new FmsEntryError('NOT_IN_DATABASE', s)
  return ap
}

/**
 * Resolves a waypoint entry: identifier, lat/lon (N3728.5E12626.4) or place/bearing/distance (OSN090/20).
 * Duplicate identifiers resolve to the one nearest `near`.
 */
export function resolveWaypointEntry(ctx: HandlerContext, entry: string, near?: { lat: number; lon: number }): Waypoint {
  const s = entry.trim().toUpperCase()
  const ll = parseLatLon(s)
  if (ll) {
    const ident = `${ll.lat >= 0 ? 'N' : 'S'}${Math.floor(Math.abs(ll.lat))}${ll.lon >= 0 ? 'E' : 'W'}${Math.floor(Math.abs(ll.lon))}`
    return { ident, lat: ll.lat, lon: ll.lon, type: 'LATLON' }
  }
  const pbd = parsePlaceBearingDistance(s)
  if (pbd) {
    const ref = ctx.nav.findWaypoint(pbd.ident, near)
    if (!ref) throw new FmsEntryError('NOT_IN_DATABASE', pbd.ident)
    const p = destinationPoint(ref, magToTrue(pbd.bearing, ref.magVar), pbd.distanceNm)
    return { ident: `${pbd.ident.slice(0, 3)}${String(pbd.bearing).padStart(3, '0')}`.slice(0, 7), lat: p.lat, lon: p.lon, type: 'PBD', magVar: ref.magVar }
  }
  if (!/^[A-Z0-9]{1,5}$/.test(s)) throw new FmsEntryError('INVALID_ENTRY', s)
  const wp = ctx.nav.findWaypoint(s, near)
  if (!wp) throw new FmsEntryError('NOT_IN_DATABASE', s)
  return wp
}

export function opSetOrigin(draft: Draft<FmsState>, ctx: HandlerContext, icao: string): void {
  const ap = requireAirport(ctx, icao)
  const plan = ctx.editPlan('ROUTE')
  const dest = plan.destination ? ctx.nav.searchAirport(plan.destination) : undefined
  setOrigin(plan, ap, ctx.nextId, dest)
  if (!draft.position.refAirport) draft.position.refAirport = ap.icao
  if (draft.flightPhase === 'PREFLIGHT') {
    draft.performance.transitionAltitudeFt = ap.transitionAltitudeFt
  }
  ctx.fieldChanged('ORIGIN', ap.icao)
}

export function opSetDestination(draft: Draft<FmsState>, ctx: HandlerContext, icao: string): void {
  const ap = requireAirport(ctx, icao)
  const plan = ctx.editPlan('ROUTE')
  setDestinationLeg(plan, ap, ctx.nextId)
  if (ap.transitionLevelFt) draft.performance.approach.transitionLevelFt = ap.transitionLevelFt
  ctx.fieldChanged('DESTINATION', ap.icao)
}

export function opSetDepartureRunway(ctx: HandlerContext, runway: string, kind: 'ROUTE' | 'DEPARTURE' = 'ROUTE'): void {
  const plan = ctx.editPlan(kind)
  if (!plan.origin) throw new FmsEntryError('ARR_DEP_FIRST')
  const ap = requireAirport(ctx, plan.origin)
  const rwy = parseRunwayIdent(runway)
  if (!rwy) throw new FmsEntryError('INVALID_ENTRY', runway)
  if (!ap.runways.some((r) => r.ident === rwy)) throw new FmsEntryError('NOT_IN_DATABASE', rwy)
  setDepartureRunway(plan, { nav: ctx.nav, ids: ctx.nextId }, ap, rwy)
  ctx.fieldChanged('DEPARTURE_RUNWAY', rwy)
}

export function opSetProcedure(
  ctx: HandlerContext,
  type: 'SID' | 'STAR' | 'APPROACH',
  procedureId: string | null,
  transition?: string,
  kind: 'DEPARTURE' | 'ARRIVAL' | 'ROUTE' = 'ROUTE',
): void {
  const plan = ctx.editPlan(kind)
  const icao = type === 'SID' ? plan.origin : plan.destination
  if (!icao) throw new FmsEntryError('ARR_DEP_FIRST')
  const ap = requireAirport(ctx, icao)
  const proc = procedureId ? ctx.nav.getProcedure(procedureId) : null
  if (procedureId && !proc) throw new FmsEntryError('NOT_IN_DATABASE', procedureId)
  if (proc && (proc.airport !== ap.icao || proc.type !== type)) throw new FmsEntryError('INVALID_ENTRY', proc.name)
  const ectx = { nav: ctx.nav, ids: ctx.nextId }
  if (type === 'SID') setSid(plan, ectx, ap, proc ?? null, transition)
  else if (type === 'STAR') setStar(plan, ectx, ap, proc ?? null, transition)
  else setApproach(plan, ectx, ap, proc ?? null, transition)
  ctx.fieldChanged(type, proc ? `${proc.name}${transition ? `.${transition}` : ''}` : null)
}

export function opAppendRoute(ctx: HandlerContext, via: string, to: string): void {
  const plan = ctx.editPlan('ROUTE')
  if (!plan.origin) throw new FmsEntryError('ARR_DEP_FIRST')
  const v = via.trim().toUpperCase() || 'DIRECT'
  if (v !== 'DIRECT' && !ctx.nav.getAirway(v)) throw new FmsEntryError('NOT_IN_DATABASE', v)
  const near = lastLegPoint(plan)
  const wp = resolveWaypointEntry(ctx, to, near)
  appendRouteEntry(plan, { nav: ctx.nav, ids: ctx.nextId }, v, wp)
  ctx.fieldChanged('ROUTE', `${v} ${wp.ident}`)
}

export function lastLegPoint(plan: FlightPlan): { lat: number; lon: number } | undefined {
  for (let i = plan.elements.length - 1; i >= 0; i--) {
    const e = plan.elements[i]
    if (isLeg(e) && e.segment !== 'DESTINATION' && !e.missed) return e.waypoint
  }
  return undefined
}

/** Present position for Direct-To / PPOS: aircraft position, else departure runway / origin. */
export function presentPosition(state: FmsState, plan: FlightPlan): { lat: number; lon: number } | undefined {
  if (state.position.aircraft) return state.position.aircraft
  const first = plan.elements[0]
  return isLeg(first) ? first.waypoint : undefined
}

export function opDirectTo(draft: Draft<FmsState>, ctx: HandlerContext, entry: string): void {
  const plan = ctx.editPlan('DIRECT_TO')
  const ppos = presentPosition(draft as FmsState, plan as FlightPlan)
  if (!ppos) throw new FmsEntryError('NO_ACTIVE_ROUTE')
  const s = entry.trim().toUpperCase()
  const idx = findLegIndex(plan, s, Math.max(1, plan.activeLegIndex))
  if (idx >= 0) directTo(plan, ctx.nextId, { index: idx }, ppos, ctx.adapter.turnPointIdent)
  else directTo(plan, ctx.nextId, { waypoint: resolveWaypointEntry(ctx, s, ppos) }, ppos, ctx.adapter.turnPointIdent)
  ctx.fieldChanged('DIRECT_TO', s)
}

export function opDeleteLeg(ctx: HandlerContext, legId: string, allowDiscontinuityDelete: boolean): void {
  const plan = ctx.editPlan('ROUTE')
  const idx = legIndexById(plan, legId)
  if (idx < 0) throw new FmsEntryError('INVALID_DELETE')
  deleteElement(plan, ctx.nextId, idx, { allowDiscontinuityDelete })
  ctx.fieldChanged('LEG_DELETED', legId)
}

export function opInsertWaypoint(ctx: HandlerContext, beforeLegId: string, entry: string, withDiscontinuity: boolean): void {
  const plan = ctx.editPlan('ROUTE')
  const idx = legIndexById(plan, beforeLegId)
  if (idx <= 0) throw new FmsEntryError('INVALID_ENTRY')
  const prev = plan.elements[idx - 1]
  const near = isLeg(prev) ? prev.waypoint : lastLegPoint(plan)
  const wp = resolveWaypointEntry(ctx, entry, near)
  const existing = findLegIndex(plan, wp.ident, idx)
  if (existing >= 0) {
    trackActiveLeg(plan, () => {
      plan.elements.splice(idx, existing - idx)
    })
  } else insertWaypointBefore(plan, ctx.nextId, idx, wp, withDiscontinuity)
  ctx.fieldChanged('LEG_INSERTED', wp.ident)
}

export function opCloseDiscontinuity(ctx: HandlerContext, discontinuityId: string): void {
  const plan = ctx.editPlan('ROUTE')
  const idx = legIndexById(plan, discontinuityId)
  if (idx < 0 || !isDiscontinuity(plan.elements[idx])) throw new FmsEntryError('INVALID_ENTRY')
  trackActiveLeg(plan, () => {
    plan.elements.splice(idx, 1)
  })
  ctx.fieldChanged('DISCONTINUITY_CLOSED', discontinuityId)
}

export function opSetCruiseAltitude(draft: Draft<FmsState>, ctx: HandlerContext, value: string): void {
  const ft = parseCruiseAltitude(value, ctx.perf.maxCertifiedAltitudeFt)
  if (ft === undefined) throw new FmsEntryError('INVALID_ENTRY', value)
  draft.performance.cruiseAltitudeFt = ft
  draft.activeFlightPlan.cruiseAltitudeFt = ft
  if (draft.modifiedFlightPlan) draft.modifiedFlightPlan.cruiseAltitudeFt = ft
  ctx.fieldChanged('CRZ_ALT', ft)
}

export function opSetCostIndex(draft: Draft<FmsState>, ctx: HandlerContext, value: string): void {
  const ci = parseCostIndex(value, ctx.perf.costIndexRange)
  if (ci === undefined) throw new FmsEntryError('INVALID_ENTRY', value)
  draft.performance.costIndex = ci
  draft.activeFlightPlan.costIndex = ci
  ctx.fieldChanged('COST_INDEX', ci)
}

export function opSetZfw(draft: Draft<FmsState>, ctx: HandlerContext, value: string): void {
  const kg = parseWeightKg(value, ctx.perf.oewKg, ctx.perf.mzfwKg * 1.05)
  if (kg === undefined) throw new FmsEntryError('INVALID_ENTRY', value)
  draft.performance.zfwKg = kg
  ctx.fieldChanged('ZFW', kg)
}

export function opSetFuel(draft: Draft<FmsState>, ctx: HandlerContext, value: string): void {
  const kg = parseWeightKg(value, 0, ctx.perf.maxFuelKg)
  if (kg === undefined) throw new FmsEntryError('INVALID_ENTRY', value)
  draft.performance.fuelKg = kg
  if (draft.simulation.status === 'IDLE') draft.simulation.fuelKg = kg
  ctx.fieldChanged('FUEL', kg)
}

export function opSetReserves(draft: Draft<FmsState>, ctx: HandlerContext, value: string): void {
  const kg = parseWeightKg(value, 0, ctx.perf.maxFuelKg / 2)
  if (kg === undefined) throw new FmsEntryError('INVALID_ENTRY', value)
  draft.performance.reserveFuelKg = kg
  ctx.fieldChanged('RESERVES', kg)
}

export function opSetPositionFromAirport(draft: Draft<FmsState>, ctx: HandlerContext, icao: string): void {
  const ap = requireAirport(ctx, icao)
  draft.position.refAirport = ap.icao
  draft.position.irsPosition = { lat: ap.lat, lon: ap.lon }
  draft.position.initialized = true
  if (draft.simulation.status === 'IDLE') {
    draft.position.aircraft = { lat: ap.lat, lon: ap.lon }
    draft.position.altitudeFt = ap.elevationFt
  }
  ctx.fieldChanged('IRS_POS', ap.icao)
}

export function opExecute(draft: Draft<FmsState>, ctx: HandlerContext): void {
  if (!commitModification(draft)) throw new FmsEntryError('NOT_ALLOWED')
  ctx.emit({ type: 'EXEC', detail: 'COMMIT' })
}

export function opErase(draft: Draft<FmsState>, ctx: HandlerContext): void {
  if (!discardModification(draft)) throw new FmsEntryError('NOT_ALLOWED')
  ctx.emit({ type: 'ERASE', detail: 'DISCARD' })
}

export function opLoadFlightPlan(draft: Draft<FmsState>, ctx: HandlerContext, plan: FlightPlan): void {
  draft.activeFlightPlan = JSON.parse(JSON.stringify(plan)) as FlightPlan
  draft.modifiedFlightPlan = undefined
  draft.modificationKind = undefined
  if (plan.cruiseAltitudeFt) draft.performance.cruiseAltitudeFt = plan.cruiseAltitudeFt
  if (plan.costIndex !== undefined) draft.performance.costIndex = plan.costIndex
  ctx.fieldChanged('FLIGHT_PLAN_LOADED', plan.id)
}
