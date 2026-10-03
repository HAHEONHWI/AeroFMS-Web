/** Navigation database domain model (provider independent). Altitudes in feet, distances in NM. */

export type WaypointType =
  | 'FIX'
  | 'VOR'
  | 'VORDME'
  | 'DME'
  | 'NDB'
  | 'AIRPORT'
  | 'RUNWAY'
  | 'LATLON'
  | 'PBD'
  | 'USER'
  | 'TURN_POINT'

export interface Waypoint {
  ident: string
  lat: number
  lon: number
  type: WaypointType
  name?: string
  /** ICAO region code (e.g. RK, RJ) used to disambiguate duplicate identifiers. */
  region?: string
  /** Navaid frequency (MHz for VOR/DME, kHz for NDB). */
  frequency?: number
  /** Magnetic variation (degrees, east positive). */
  magVar?: number
}

export interface Navaid extends Waypoint {
  type: 'VOR' | 'VORDME' | 'DME' | 'NDB'
  frequency: number
  rangeNm?: number
}

export interface Runway {
  /** e.g. "15L" */
  ident: string
  /** Magnetic heading of the runway. */
  headingMag: number
  /** True course of the runway centerline. */
  headingTrue: number
  /** Threshold position. */
  lat: number
  lon: number
  lengthFt: number
  widthFt?: number
  elevationFt: number
  ilsFrequency?: number
  ilsCourse?: number
  glideslopeDeg?: number
}

export interface Airport {
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
  /** Speed limit below the limit altitude (kt), e.g. 250 below 10000. */
  speedLimitKt?: number
  speedLimitAltitudeFt?: number
  runways: Runway[]
}

export interface AirwayFix {
  ident: string
  lat: number
  lon: number
  type: WaypointType
  /** Minimum enroute altitude of the segment ending at this fix (ft). */
  minAltitudeFt?: number
}

export interface Airway {
  name: string
  /** Ordered fixes. Airways in the demo dataset are bidirectional. */
  fixes: AirwayFix[]
}

export type AltitudeConstraintType = 'AT' | 'AT_OR_ABOVE' | 'AT_OR_BELOW' | 'BETWEEN'

export interface AltitudeConstraint {
  type: AltitudeConstraintType
  /** For BETWEEN this is the upper bound. */
  altitudeFt: number
  /** Lower bound for BETWEEN. */
  altitude2Ft?: number
}

export type SpeedConstraintType = 'AT' | 'AT_OR_BELOW' | 'AT_OR_ABOVE'

export interface SpeedConstraint {
  type: SpeedConstraintType
  speedKt: number
}

/** ARINC-424 style path terminators supported by the simulation. */
export type PathTerminator = 'IF' | 'TF' | 'DF' | 'CF' | 'CA' | 'VA' | 'VM' | 'HM' | 'HA' | 'HF' | 'FM'

export type ProcedureType = 'SID' | 'STAR' | 'APPROACH'

export interface ProcedureLeg {
  /** Fix identifier, or `RWxx` for runway threshold. Empty for altitude-terminated legs. */
  fix: string
  pathTerminator: PathTerminator
  /** Course for CF/CA/VA legs (magnetic). */
  courseMag?: number
  altitude?: AltitudeConstraint
  speed?: SpeedConstraint
  overfly?: boolean
  /** Published holding pattern for HM/HA/HF legs. */
  hold?: { inboundCourseMag: number; turn: 'L' | 'R'; legTimeMin: number }
}

export interface ProcedureTransition {
  name: string
  legs: ProcedureLeg[]
}

export type ApproachType = 'ILS' | 'RNAV' | 'VOR' | 'LOC' | 'NDB' | 'VISUAL'

export interface Procedure {
  id: string
  airport: string
  type: ProcedureType
  /** e.g. BULTI1A, ILS33L */
  name: string
  /** Runways this procedure applies to (empty = all). */
  runways: string[]
  /** Legs flown after (SID) / before (STAR) transitions. */
  commonLegs: ProcedureLeg[]
  /** SID: enroute transitions appended after common legs. STAR/APPROACH: transitions prepended. */
  transitions: ProcedureTransition[]
  approachType?: ApproachType
  missedApproachLegs?: ProcedureLeg[]
}

export interface NavDatabaseMeta {
  id: string
  name: string
  /** Display cycle, e.g. DEMO-2026-01 */
  cycle: string
  effectiveFrom: string
  effectiveTo: string
  /** Free-text provenance / licence information. */
  source: string
  isDemo: boolean
}
