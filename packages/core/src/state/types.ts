import type { FlightPlan, LatLon, Waypoint } from '@aerofms/shared'

export const FMS_STATE_SCHEMA_VERSION = 1

export type FlightPhase =
  | 'PREFLIGHT'
  | 'TAXI'
  | 'TAKEOFF'
  | 'CLIMB'
  | 'CRUISE'
  | 'DESCENT'
  | 'APPROACH'
  | 'GO_AROUND'
  | 'LANDED'

export type Manufacturer = 'BOEING' | 'AIRBUS'

export interface AircraftState {
  /** Aircraft definition id, e.g. B737-800 */
  aircraftId: string
  adapterId: string
  manufacturer: Manufacturer
  model: string
  fmsType: string
  engine: string
}

export interface PositionState {
  /** Present position used by the FMS (from GPS/IRS in the simulation). */
  aircraft: LatLon | null
  altitudeFt: number
  headingTrue: number
  trackTrue: number
  groundSpeedKt: number
  onGround: boolean
  refAirport?: string
  gate?: string
  /** Position entered by the crew for IRS alignment. */
  irsPosition?: LatLon
  /** True once the IRS position has been entered (POS INIT complete). */
  initialized: boolean
}

export type SpeedMode = 'ECON' | 'MANUAL'

export interface TakeoffPerformance {
  runway?: string
  flaps?: number
  /** Thrust rating label, e.g. 26K, TO, TO-1, TOGA, FLEX */
  thrustRating?: string
  assumedTempC?: number
  oatC?: number
  v1?: number
  vr?: number
  v2?: number
  thrustReductionAltFt?: number
  accelerationAltFt?: number
  engineOutAccelAltFt?: number
  cgPercent?: number
  runwayWindKt?: number
  runwayCondition?: 'DRY' | 'WET'
}

export interface ClimbPerformance {
  mode: SpeedMode
  speedKt?: number
  mach?: number
  speedRestrictionKt?: number
  speedRestrictionAltFt?: number
}

export interface CruisePerformance {
  mode: SpeedMode
  speedKt?: number
  mach?: number
  /** Step climb increment (ft). 0 = no step climb planned. */
  stepSizeFt: number
  /** Pilot-entered step altitude target. */
  stepToFt?: number
}

export interface DescentPerformance {
  mode: SpeedMode
  speedKt?: number
  mach?: number
  speedRestrictionKt?: number
  speedRestrictionAltFt?: number
  /** Planned end-of-descent altitude (ft). */
  endOfDescentFt?: number
}

export interface ApproachPerformance {
  /** Landing flaps (Boeing) or CONF (Airbus: 3 or 4=FULL). */
  flaps?: number
  vref?: number
  vapp?: number
  qnhHpa?: number
  tempC?: number
  windDir?: number
  windKt?: number
  minimumFt?: number
  minimumType?: 'BARO' | 'RADIO'
  transitionLevelFt?: number
}

export interface PerformanceState {
  zfwKg?: number
  zfwCgPercent?: number
  /** Fuel on board / block fuel (kg). */
  fuelKg?: number
  reserveFuelKg?: number
  taxiFuelKg?: number
  costIndex?: number
  cruiseAltitudeFt?: number
  cruiseWindDir?: number
  cruiseWindKt?: number
  isaDevC?: number
  transitionAltitudeFt?: number
  takeoff: TakeoffPerformance
  climb: ClimbPerformance
  cruise: CruisePerformance
  descent: DescentPerformance
  approach: ApproachPerformance
}

export type ModificationKind =
  | 'ROUTE'
  | 'ACTIVATE'
  | 'DIRECT_TO'
  | 'HOLD'
  | 'PERFORMANCE'
  | 'LAT_REV'
  | 'AIRWAYS'
  | 'DEPARTURE'
  | 'ARRIVAL'
  | 'OFFSET'

export interface PageState {
  pageId: string
  /** 1-based sub page index (NEXT/PREV PAGE). */
  subPage: number
  /** Page specific context, e.g. LAT REV target leg id or scroll offset. */
  context: Record<string, string | number | boolean | null>
}

export interface ScratchpadMessage {
  code: string
  text: string
  /** Entry-error messages restore the previous scratchpad text when cleared. */
  restoreText?: string
}

export interface ScratchpadState {
  text: string
  message?: ScratchpadMessage
  /** Boeing DELETE / Airbus CLR deletion token. */
  deleteMode: boolean
}

export type MessageKind = 'ALERT' | 'ADVISORY'

export interface FmsMessage {
  id: string
  code: string
  text: string
  kind: MessageKind
  createdAt: number
  acknowledged: boolean
}

export interface FixInfoEntry {
  ref: Waypoint
  /** Radials (magnetic) to display. */
  radials: number[]
  /** Distance rings (NM). */
  distancesNm: number[]
  abeam: boolean
}

export interface NavRadioState {
  vor1?: { ident?: string; frequency?: number; course?: number; manual: boolean }
  vor2?: { ident?: string; frequency?: number; course?: number; manual: boolean }
  ils?: { ident?: string; frequency?: number; course?: number }
  adf1?: number
}

export interface NavigationState {
  navDbCycle: string
  navDbName: string
  fixInfo: FixInfoEntry[]
  radios: NavRadioState
  /** Leg id highlighted by map/legs cross selection. */
  highlightedLegId?: string
  offsetNm?: number
  /** Pending SELECT DESIRED WPT choice. */
  pendingSelection?: {
    ident: string
    candidates: Waypoint[]
    returnPageId: string
    /** Serialized continuation (which field/LSK requested the lookup). */
    purpose: string
  }
}

export type GuidanceMode = 'OFF' | 'ARMED' | 'ACTIVE'

export interface GuidanceState {
  lnav: GuidanceMode
  vnav: GuidanceMode
  crossTrackNm: number
  desiredTrackTrue: number
  distanceToGoNm: number
  /** Distance remaining to destination along the flight plan (NM). */
  distanceToDestinationNm: number
}

export type SimulationStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED'

export interface SimulationState {
  status: SimulationStatus
  timeScale: 1 | 2 | 4 | 8 | 16
  /** Simulated UTC epoch ms. */
  simTimeMs: number
  elapsedSec: number
  trueAirspeedKt: number
  indicatedAirspeedKt: number
  mach: number
  verticalSpeedFpm: number
  targetAltitudeFt: number
  targetSpeedKt: number
  fuelKg: number
  fuelUsedKg: number
  distanceFlownNm: number
  /** Source of the aircraft state: built-in simulator or an external simulator connector. */
  source: 'STANDALONE' | 'CONNECTOR'
  windDir: number
  windKt: number
  /** Holding pattern state machine (standalone simulation). */
  hold?: { legId: string; phase: 'ENTRY' | 'OUTBOUND_TURN' | 'OUTBOUND' | 'INBOUND_TURN' | 'INBOUND'; timerSec: number }
  /** Seconds spent in the current phase (taxi/takeoff timing). */
  phaseTimerSec: number
}

export interface SessionState {
  sessionId: string
  name: string
  createdAt: number
  updatedAt: number
  /** Deterministic id counter used by reducers (event sourcing safe). */
  idCounter: number
  actionCount: number
}

export interface FmsState {
  schemaVersion: number
  aircraft: AircraftState
  position: PositionState
  activeFlightPlan: FlightPlan
  /** Boeing MOD plan / Airbus TEMPORARY flight plan. */
  modifiedFlightPlan?: FlightPlan
  /** Pending performance changes awaiting EXEC (Boeing VNAV pages). */
  modifiedPerformance?: PerformanceState
  modificationKind?: ModificationKind
  secondaryFlightPlan?: FlightPlan
  performance: PerformanceState
  flightPhase: FlightPhase
  currentPage: PageState
  scratchpad: ScratchpadState
  messages: FmsMessage[]
  navigation: NavigationState
  guidance: GuidanceState
  simulation: SimulationState
  session: SessionState
}
