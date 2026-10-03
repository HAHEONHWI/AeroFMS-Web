import type { FlightPlan } from '@aerofms/shared'
import type { LskId } from '../page/types'

export type FmsEventType =
  | 'PAGE_OPEN'
  | 'KEY_PRESS'
  | 'LSK_PRESS'
  | 'SCRATCHPAD_CHANGED'
  | 'FIELD_CHANGED'
  | 'ROUTE_CHANGED'
  | 'EXEC'
  | 'INSERT'
  | 'ERASE'
  | 'ERROR'
  | 'MESSAGE'
  | 'SIMULATION_EVENT'

export interface FmsEventInput {
  type: FmsEventType
  /** Short machine-readable detail, e.g. page id, key, LSK, field name, message code. */
  detail: string
  value?: string | number | null
}

export interface FmsEvent extends FmsEventInput {
  /** Wall clock ms of the originating action. */
  t: number
  /** Index of the originating action in the session action log. */
  actionIndex: number
}

/** Hardware-style key identifiers. Alphanumerics are single characters. */
export type FmsKey = string

/**
 * Actions are the only way to change FMS state. They are persisted (event sourcing)
 * so that sessions can be replayed deterministically.
 */
export type FmsAction =
  | { type: 'KEY'; key: FmsKey; t: number }
  | { type: 'KEY_LONG'; key: FmsKey; t: number }
  | { type: 'LSK'; lsk: LskId; t: number }
  | { type: 'TEXT'; text: string; t: number }
  | { type: 'OPEN_PAGE'; pageId: string; subPage?: number; t: number }
  | { type: 'HIGHLIGHT_LEG'; legId: string | null; t: number }
  | { type: 'COMMAND'; command: FmsCommand; t: number }
  | { type: 'SIM_TICK'; dtSec: number; t: number }
  | { type: 'SIM_CONTROL'; control: SimulationControl; t: number }
  | { type: 'EXTERNAL_STATE'; aircraft: ExternalAircraftState; t: number }

export type SimulationControl =
  | { kind: 'START' }
  | { kind: 'PAUSE' }
  | { kind: 'RESUME' }
  | { kind: 'STOP' }
  | { kind: 'RESET' }
  | { kind: 'SET_SPEED'; timeScale: 1 | 2 | 4 | 8 | 16 }
  | { kind: 'GO_AROUND' }

export interface ExternalAircraftState {
  lat: number
  lon: number
  altitudeFt: number
  headingTrue: number
  trackTrue: number
  groundSpeedKt: number
  trueAirspeedKt: number
  indicatedAirspeedKt: number
  verticalSpeedFpm: number
  onGround: boolean
  fuelKg?: number
}

/**
 * Domain commands used by the Modern View, scenario setup and simulator connector.
 * They go through the same validation & state engine as CDU input.
 */
export type FmsCommand =
  | { kind: 'SET_ORIGIN'; icao: string }
  | { kind: 'SET_DESTINATION'; icao: string }
  | { kind: 'SET_FLIGHT_NUMBER'; value: string }
  | { kind: 'SET_DEPARTURE_RUNWAY'; runway: string }
  | { kind: 'SET_SID'; procedureId: string | null; transition?: string }
  | { kind: 'SET_STAR'; procedureId: string | null; transition?: string }
  | { kind: 'SET_APPROACH'; procedureId: string | null; transition?: string }
  | { kind: 'APPEND_ROUTE'; via: string; to: string }
  | { kind: 'DIRECT_TO'; ident: string }
  | { kind: 'DELETE_LEG'; legId: string }
  | { kind: 'INSERT_WAYPOINT'; beforeLegId: string; ident: string }
  | { kind: 'CLOSE_DISCONTINUITY'; discontinuityId: string }
  | { kind: 'SET_CRUISE_ALTITUDE'; value: string }
  | { kind: 'SET_COST_INDEX'; value: string }
  | { kind: 'SET_ZFW'; value: string }
  | { kind: 'SET_FUEL'; value: string }
  | { kind: 'SET_RESERVES'; value: string }
  | { kind: 'SET_POSITION_FROM_AIRPORT'; icao: string }
  | { kind: 'EXECUTE' }
  /** Scenario/lesson setup: activates the route without an EXEC step (Boeing). */
  | { kind: 'ACTIVATE_ROUTE' }
  | { kind: 'ERASE' }
  | { kind: 'LOAD_FLIGHT_PLAN'; plan: FlightPlan }

/** An action without its timestamp (the engine host stamps it). */
export type FmsActionInput = FmsAction extends infer A ? (A extends FmsAction ? Omit<A, 't'> : never) : never
