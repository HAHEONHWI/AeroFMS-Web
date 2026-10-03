import { isDiscontinuity, isLeg } from '@aerofms/shared'
import type { FlightPlan } from '@aerofms/shared'
import type { FlightPhase, FmsState } from '@aerofms/core'

/**
 * Declarative, JSON-serialisable state conditions. Used by lessons (step completion),
 * scenarios (objectives) and the Scenario Builder, so user-made content needs no code.
 */
export type PerfField = 'zfwKg' | 'fuelKg' | 'reserveFuelKg' | 'costIndex' | 'cruiseAltitudeFt'

export type Condition =
  | { kind: 'PAGE'; pageId: string; subPage?: number }
  | { kind: 'SCRATCHPAD'; equals: string }
  | { kind: 'SCRATCHPAD_PREFIX'; prefix: string }
  | { kind: 'REF_AIRPORT'; icao: string }
  | { kind: 'ORIGIN'; icao: string }
  | { kind: 'DESTINATION'; icao: string }
  | { kind: 'RUNWAY'; ident: string }
  | { kind: 'SID'; name: string; transition?: string }
  | { kind: 'STAR'; name: string; transition?: string }
  | { kind: 'APPROACH'; name: string; transition?: string }
  | { kind: 'ROUTE_CONTAINS'; idents: string[] }
  | { kind: 'NO_DISCONTINUITY' }
  | { kind: 'PLAN_ACTIVE' }
  | { kind: 'MODIFICATION_PENDING' }
  | { kind: 'NO_MODIFICATION' }
  | { kind: 'POS_INITIALIZED' }
  | { kind: 'PERF'; field: PerfField; equals?: number; min?: number; max?: number }
  | { kind: 'TAKEOFF_FLAPS'; value?: number }
  | { kind: 'TAKEOFF_SPEEDS_SET' }
  | { kind: 'FLIGHT_NUMBER'; equals?: string }
  | { kind: 'HOLD_AT'; ident: string }
  | { kind: 'ACTIVE_LEG'; ident: string }
  | { kind: 'CONSTRAINT_AT'; ident: string }
  | { kind: 'FIX_INFO'; ident: string }
  | { kind: 'SIM_PHASE'; phase: FlightPhase }
  | { kind: 'ALL'; conditions: Condition[] }
  | { kind: 'ANY'; conditions: Condition[] }

const displayed = (s: FmsState): FlightPlan => s.modifiedFlightPlan ?? s.activeFlightPlan

function routeIdents(plan: FlightPlan): string[] {
  return plan.elements.filter(isLeg).map((l) => l.waypoint.ident)
}

/** Subsequence match: every ident appears in order (not necessarily adjacent). */
function containsInOrder(list: string[], wanted: string[]): boolean {
  let i = 0
  for (const id of list) if (id === wanted[i]) i++
  return i === wanted.length
}

export function evaluateCondition(c: Condition, s: FmsState): boolean {
  const active = s.activeFlightPlan
  switch (c.kind) {
    case 'PAGE':
      return s.currentPage.pageId === c.pageId && (c.subPage === undefined || s.currentPage.subPage === c.subPage)
    case 'SCRATCHPAD':
      return s.scratchpad.text === c.equals && !s.scratchpad.message
    case 'SCRATCHPAD_PREFIX':
      return s.scratchpad.text.startsWith(c.prefix) && !s.scratchpad.message
    case 'REF_AIRPORT':
      return s.position.refAirport === c.icao
    case 'ORIGIN':
      return displayed(s).origin === c.icao
    case 'DESTINATION':
      return displayed(s).destination === c.icao
    case 'RUNWAY':
      return displayed(s).departureRunway === c.ident
    case 'SID':
      return active.sid?.name === c.name && (c.transition === undefined || active.sid?.transition === c.transition)
    case 'STAR':
      return active.star?.name === c.name && (c.transition === undefined || active.star?.transition === c.transition)
    case 'APPROACH':
      return active.approach?.name === c.name && (c.transition === undefined || active.approach?.transition === c.transition)
    case 'ROUTE_CONTAINS':
      return containsInOrder(routeIdents(active), c.idents)
    case 'NO_DISCONTINUITY':
      return !active.elements.some((e, i) => isDiscontinuity(e) && i < active.elements.length - 1) && active.elements.length > 1
    case 'PLAN_ACTIVE':
      return active.activated && !s.modifiedFlightPlan
    case 'MODIFICATION_PENDING':
      return !!s.modifiedFlightPlan || !!s.modifiedPerformance
    case 'NO_MODIFICATION':
      return !s.modifiedFlightPlan && !s.modifiedPerformance
    case 'POS_INITIALIZED':
      return s.position.initialized
    case 'PERF': {
      const v = s.performance[c.field]
      if (v === undefined) return false
      if (c.equals !== undefined && v !== c.equals) return false
      if (c.min !== undefined && v < c.min) return false
      if (c.max !== undefined && v > c.max) return false
      return true
    }
    case 'TAKEOFF_FLAPS':
      return s.performance.takeoff.flaps !== undefined && (c.value === undefined || s.performance.takeoff.flaps === c.value)
    case 'TAKEOFF_SPEEDS_SET': {
      const t = s.performance.takeoff
      return t.v1 !== undefined && t.vr !== undefined && t.v2 !== undefined
    }
    case 'FLIGHT_NUMBER':
      return !!displayed(s).flightNumber && (c.equals === undefined || displayed(s).flightNumber === c.equals)
    case 'HOLD_AT':
      return active.elements.some((e) => isLeg(e) && e.waypoint.ident === c.ident && !!e.hold && e.hold.source === 'PILOT')
    case 'ACTIVE_LEG': {
      const e = active.elements[active.activeLegIndex]
      return isLeg(e) && e.waypoint.ident === c.ident && !s.modifiedFlightPlan
    }
    case 'CONSTRAINT_AT':
      return active.elements.some((e) => isLeg(e) && e.waypoint.ident === c.ident && e.constraintSource === 'PILOT')
    case 'FIX_INFO':
      return s.navigation.fixInfo.some((f) => f.ref.ident === c.ident)
    case 'SIM_PHASE':
      return s.flightPhase === c.phase
    case 'ALL':
      return c.conditions.every((x) => evaluateCondition(x, s))
    case 'ANY':
      return c.conditions.some((x) => evaluateCondition(x, s))
  }
}

/** Validates a condition loaded from JSON (scenario builder / shared scenarios). */
export function isValidCondition(c: unknown, depth = 0): c is Condition {
  if (depth > 5 || typeof c !== 'object' || c === null) return false
  const x = c as Record<string, unknown>
  const str = (k: string) => typeof x[k] === 'string' && (x[k] as string).length <= 40
  switch (x.kind) {
    case 'PAGE':
      return str('pageId')
    case 'SCRATCHPAD':
      return str('equals')
    case 'SCRATCHPAD_PREFIX':
      return str('prefix')
    case 'REF_AIRPORT':
    case 'ORIGIN':
    case 'DESTINATION':
      return str('icao')
    case 'RUNWAY':
    case 'HOLD_AT':
    case 'ACTIVE_LEG':
    case 'CONSTRAINT_AT':
    case 'FIX_INFO':
      return str('ident')
    case 'SID':
    case 'STAR':
    case 'APPROACH':
      return str('name')
    case 'ROUTE_CONTAINS':
      return Array.isArray(x.idents) && x.idents.length <= 40 && x.idents.every((i) => typeof i === 'string')
    case 'NO_DISCONTINUITY':
    case 'PLAN_ACTIVE':
    case 'MODIFICATION_PENDING':
    case 'NO_MODIFICATION':
    case 'POS_INITIALIZED':
    case 'TAKEOFF_SPEEDS_SET':
    case 'FLIGHT_NUMBER':
    case 'TAKEOFF_FLAPS':
      return true
    case 'PERF':
      return ['zfwKg', 'fuelKg', 'reserveFuelKg', 'costIndex', 'cruiseAltitudeFt'].includes(String(x.field))
    case 'SIM_PHASE':
      return str('phase')
    case 'ALL':
    case 'ANY':
      return Array.isArray(x.conditions) && x.conditions.length <= 20 && x.conditions.every((y) => isValidCondition(y, depth + 1))
    default:
      return false
  }
}
