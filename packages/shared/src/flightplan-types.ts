import type { AltitudeConstraint, PathTerminator, SpeedConstraint, Waypoint } from './nav-types'

export type FlightPlanSegment = 'ORIGIN' | 'DEPARTURE' | 'ENROUTE' | 'ARRIVAL' | 'APPROACH' | 'MISSED' | 'DESTINATION'

export type HoldTurn = 'L' | 'R'

export interface HoldDefinition {
  /** Inbound course (magnetic) toward the hold fix. */
  inboundCourse: number
  turn: HoldTurn
  /** Outbound leg time in minutes (used when legDistanceNm is not set). */
  legTimeMin?: number
  /** Outbound leg distance in NM (takes precedence over time). */
  legDistanceNm?: number
  speedKt?: number
  altitudeFt?: number
  /** Expect further clearance time (HHMM, Zulu). */
  efc?: string
  /** True once EXIT HOLD has been armed. */
  exitArmed: boolean
  /** Source of the hold (pilot-entered or published in a procedure). */
  source: 'PILOT' | 'PROCEDURE'
}

export interface FlightPlanLeg {
  kind: 'LEG'
  /** Stable identity used for UI selection and map highlighting. */
  id: string
  waypoint: Waypoint
  legType: PathTerminator
  segment: FlightPlanSegment
  /** Airway name, procedure name or DIRECT. */
  via?: string
  speedConstraint?: SpeedConstraint
  altitudeConstraint?: AltitudeConstraint
  constraintSource?: 'PROCEDURE' | 'PILOT'
  /** Course for CF/CA legs (magnetic). */
  courseMag?: number
  overfly?: boolean
  hold?: HoldDefinition
  /** Leg is a missed-approach leg (displayed, not flown unless GO AROUND). */
  missed?: boolean
  /** Calculated leg distance from the previous leg's fix (NM). */
  calculatedDistance?: number
  /** Calculated great-circle track into this fix (degrees true). */
  calculatedTrack?: number
  /** Cumulative distance from the start of the plan (NM). */
  cumulativeDistance?: number
}

export interface FlightPlanDiscontinuity {
  kind: 'DISCONTINUITY'
  id: string
  segment?: FlightPlanSegment
}

export type FlightPlanElement = FlightPlanLeg | FlightPlanDiscontinuity

export interface ProcedureSelection {
  /** Procedure id in the navigation database. */
  id: string
  name: string
  transition?: string
}

export interface FlightPlan {
  id: string
  /** ICAO code. */
  origin?: string
  destination?: string
  alternate?: string
  flightNumber?: string
  companyRoute?: string
  departureRunway?: string
  arrivalRunway?: string
  sid?: ProcedureSelection
  star?: ProcedureSelection
  approach?: ProcedureSelection
  /** Ordered graph of legs. A DISCONTINUITY element breaks the path. */
  elements: FlightPlanElement[]
  /** Index into `elements` of the active (TO) leg. */
  activeLegIndex: number
  /**
   * True once legs have been sequenced or a Direct-To was flown. Before that, the active leg
   * is always the first leg after the origin.
   */
  progressed?: boolean
  /** Boeing: plan activated at least once (RTE ACTIVATE + EXEC). Airbus plans are always active. */
  activated: boolean
  /** Pending VIA for the next empty RTE row (Boeing airway entry before TO is known). */
  pendingVia?: string
  cruiseAltitudeFt?: number
  costIndex?: number
  updatedAt: number
}

export const isLeg = (e: FlightPlanElement | undefined): e is FlightPlanLeg => e?.kind === 'LEG'
export const isDiscontinuity = (e: FlightPlanElement | undefined): e is FlightPlanDiscontinuity =>
  e?.kind === 'DISCONTINUITY'
