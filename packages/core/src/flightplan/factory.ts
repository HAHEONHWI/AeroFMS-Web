import type { Airport, FlightPlan, FlightPlanDiscontinuity, FlightPlanLeg, FlightPlanSegment, Runway, Waypoint } from '@aerofms/shared'

export type IdFactory = () => string

export function createEmptyFlightPlan(id: string, now: number): FlightPlan {
  return { id, elements: [], activeLegIndex: 0, activated: false, updatedAt: now }
}

export function airportWaypoint(airport: Airport): Waypoint {
  return {
    ident: airport.icao,
    lat: airport.lat,
    lon: airport.lon,
    type: 'AIRPORT',
    name: airport.name,
    magVar: airport.magVar,
  }
}

export function runwayWaypoint(airport: Airport, runway: Runway): Waypoint {
  return {
    ident: `RW${runway.ident}`,
    lat: runway.lat,
    lon: runway.lon,
    type: 'RUNWAY',
    name: `${airport.icao} RW${runway.ident}`,
    magVar: airport.magVar,
  }
}

export function makeLeg(
  ids: IdFactory,
  waypoint: Waypoint,
  segment: FlightPlanSegment,
  extra: Partial<Omit<FlightPlanLeg, 'kind' | 'id' | 'waypoint' | 'segment'>> = {},
): FlightPlanLeg {
  return { kind: 'LEG', id: ids(), waypoint, legType: extra.legType ?? 'TF', segment, ...extra }
}

export function makeDiscontinuity(ids: IdFactory, segment?: FlightPlanSegment): FlightPlanDiscontinuity {
  return { kind: 'DISCONTINUITY', id: ids(), segment }
}

export function clonePlan(plan: FlightPlan): FlightPlan {
  return JSON.parse(JSON.stringify(plan)) as FlightPlan
}
