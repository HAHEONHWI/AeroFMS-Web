import type { ExternalAircraftState } from '@aerofms/core'
import type { FlightPlan } from '@aerofms/shared'

/**
 * AeroFMS Connector protocol v1 (JSON over WebSocket, default port 8787).
 * Flight Simulator ⇄ AeroFMS Connector (PC) ⇄ Local WebSocket ⇄ AeroFMS Web/Android.
 */
export const CONNECTOR_PROTOCOL_VERSION = 1
export const CONNECTOR_DEFAULT_PORT = 8787
export const CONNECTOR_INFO_PATH = '/aerofms/info'
export const CONNECTOR_WS_PATH = '/aerofms/ws'
export const CONNECTOR_MDNS_TYPE = 'aerofms'

export type SimulatorKind = 'MSFS' | 'XPLANE' | 'BUILTIN_REPLAY'

export interface SimulatorInfo {
  id: string
  kind: SimulatorKind
  name: string
  available: boolean
  detail?: string
}

export interface ConnectorInfo {
  app: 'AeroFMS-Connector'
  protocol: number
  version: string
  hostName: string
  port: number
  simulators: SimulatorInfo[]
}

export type ConnectorStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'WAITING_FOR_SIM' | 'ERROR'

export type ClientMessage =
  | { type: 'HELLO'; protocol: number; client: 'web' | 'android'; name?: string }
  | { type: 'SELECT_SIMULATOR'; id: string }
  | { type: 'SET_FLIGHT_PLAN'; plan: FlightPlan }
  | { type: 'REQUEST_FLIGHT_PLAN' }
  | { type: 'PING'; t: number }

export type ServerMessage =
  | { type: 'WELCOME'; protocol: number; info: ConnectorInfo; activeSimulator?: string }
  | { type: 'STATUS'; status: ConnectorStatus; simulator?: string; message?: string }
  | { type: 'AIRCRAFT_STATE'; state: ExternalAircraftState; t: number }
  | { type: 'FLIGHT_PLAN'; plan: FlightPlan }
  | { type: 'PONG'; t: number }
  | { type: 'ERROR'; code: string; message: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function isValidAircraftState(s: unknown): s is ExternalAircraftState {
  if (!isObj(s)) return false
  return (
    num(s.lat) && Math.abs(s.lat) <= 90 &&
    num(s.lon) && Math.abs(s.lon) <= 180 &&
    num(s.altitudeFt) && num(s.headingTrue) && num(s.trackTrue) && num(s.groundSpeedKt) &&
    num(s.trueAirspeedKt) && num(s.indicatedAirspeedKt) && num(s.verticalSpeedFpm) && typeof s.onGround === 'boolean'
  )
}

/** Validates an incoming server message (never trust the network). */
export function parseServerMessage(raw: string): ServerMessage | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(data) || typeof data.type !== 'string') return null
  switch (data.type) {
    case 'WELCOME':
      return num(data.protocol) && isObj(data.info) ? (data as ServerMessage) : null
    case 'STATUS':
      return typeof data.status === 'string' ? (data as ServerMessage) : null
    case 'AIRCRAFT_STATE':
      return isValidAircraftState(data.state) && num(data.t) ? (data as ServerMessage) : null
    case 'FLIGHT_PLAN':
      return isObj(data.plan) && Array.isArray((data.plan as Record<string, unknown>).elements) ? (data as ServerMessage) : null
    case 'PONG':
      return num(data.t) ? (data as ServerMessage) : null
    case 'ERROR':
      return typeof data.code === 'string' ? (data as ServerMessage) : null
    default:
      return null
  }
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(data) || typeof data.type !== 'string') return null
  switch (data.type) {
    case 'HELLO':
      return num(data.protocol) && (data.client === 'web' || data.client === 'android') ? (data as ClientMessage) : null
    case 'SELECT_SIMULATOR':
      return typeof data.id === 'string' ? (data as ClientMessage) : null
    case 'SET_FLIGHT_PLAN':
      return isObj(data.plan) && Array.isArray((data.plan as Record<string, unknown>).elements) ? (data as ClientMessage) : null
    case 'REQUEST_FLIGHT_PLAN':
      return data as ClientMessage
    case 'PING':
      return num(data.t) ? (data as ClientMessage) : null
    default:
      return null
  }
}
