import type { ExternalAircraftState } from '@aerofms/core'
import type { FlightPlan } from '@aerofms/shared'
import { CONNECTOR_PROTOCOL_VERSION, CONNECTOR_WS_PATH, parseServerMessage } from './protocol'
import type { ClientMessage, ConnectorInfo, ConnectorStatus } from './protocol'

/** Minimal WebSocket surface available in browsers and React Native. */
export interface WebSocketLike {
  readyState: number
  send(data: string): void
  close(): void
  onopen: ((ev: unknown) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
}

export type WebSocketFactory = (url: string) => WebSocketLike

export interface ConnectorClientEvents {
  status: (status: ConnectorStatus, message?: string) => void
  aircraft: (state: ExternalAircraftState) => void
  flightPlan: (plan: FlightPlan) => void
  info: (info: ConnectorInfo) => void
}

/**
 * Client used by the Web and Android apps to talk to the AeroFMS Connector on the local network.
 * Reconnects with exponential backoff until `disconnect()` is called.
 */
export class ConnectorClient {
  private ws?: WebSocketLike
  private status: ConnectorStatus = 'DISCONNECTED'
  private retry = 0
  private retryTimer?: ReturnType<typeof setTimeout>
  private wanted = false
  private readonly listeners: { [K in keyof ConnectorClientEvents]: Set<ConnectorClientEvents[K]> } = {
    status: new Set(),
    aircraft: new Set(),
    flightPlan: new Set(),
    info: new Set(),
  }

  constructor(
    private readonly factory: WebSocketFactory,
    private readonly clientKind: 'web' | 'android',
  ) {}

  get currentStatus(): ConnectorStatus {
    return this.status
  }

  on<K extends keyof ConnectorClientEvents>(event: K, fn: ConnectorClientEvents[K]): () => void {
    this.listeners[event].add(fn)
    return () => this.listeners[event].delete(fn)
  }

  private emit<K extends keyof ConnectorClientEvents>(event: K, ...args: Parameters<ConnectorClientEvents[K]>): void {
    for (const fn of this.listeners[event]) (fn as (...a: Parameters<ConnectorClientEvents[K]>) => void)(...args)
  }

  private setStatus(s: ConnectorStatus, message?: string): void {
    this.status = s
    this.emit('status', s, message)
  }

  /** host may be "192.168.0.10:8787" or "localhost:8787". */
  connect(host: string): void {
    this.wanted = true
    this.host = host
    this.open()
  }

  private host = ''

  private open(): void {
    if (!this.wanted) return
    this.setStatus('CONNECTING')
    let ws: WebSocketLike
    try {
      ws = this.factory(`ws://${this.host}${CONNECTOR_WS_PATH}`)
    } catch (e) {
      this.setStatus('ERROR', e instanceof Error ? e.message : String(e))
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.send({ type: 'HELLO', protocol: CONNECTOR_PROTOCOL_VERSION, client: this.clientKind })
    }
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      const msg = parseServerMessage(ev.data)
      if (!msg) return
      switch (msg.type) {
        case 'WELCOME':
          this.emit('info', msg.info)
          this.setStatus(msg.activeSimulator ? 'CONNECTED' : 'WAITING_FOR_SIM')
          break
        case 'STATUS':
          this.setStatus(msg.status, msg.message)
          break
        case 'AIRCRAFT_STATE':
          this.emit('aircraft', msg.state)
          break
        case 'FLIGHT_PLAN':
          this.emit('flightPlan', msg.plan)
          break
        case 'ERROR':
          this.setStatus('ERROR', msg.message)
          break
        default:
          break
      }
    }
    ws.onerror = () => this.setStatus('ERROR')
    ws.onclose = () => {
      this.ws = undefined
      if (this.wanted) {
        this.setStatus('CONNECTING')
        this.scheduleReconnect()
      } else this.setStatus('DISCONNECTED')
    }
  }

  private scheduleReconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    const delay = Math.min(15000, 500 * 2 ** this.retry++)
    this.retryTimer = setTimeout(() => this.open(), delay)
  }

  send(msg: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== 1) return false
    this.ws.send(JSON.stringify(msg))
    return true
  }

  selectSimulator(id: string): boolean {
    return this.send({ type: 'SELECT_SIMULATOR', id })
  }

  sendFlightPlan(plan: FlightPlan): boolean {
    return this.send({ type: 'SET_FLIGHT_PLAN', plan })
  }

  disconnect(): void {
    this.wanted = false
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.ws?.close()
    this.ws = undefined
    this.setStatus('DISCONNECTED')
  }
}

/** Probes candidate hosts for a running connector (used by "Search for simulators"). */
export async function probeConnectors(
  hosts: string[],
  fetchFn: (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>,
  timeoutMs = 800,
): Promise<Array<{ host: string; info: ConnectorInfo }>> {
  const results = await Promise.all(
    hosts.map(async (host) => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetchFn(`http://${host}/aerofms/info`, { signal: ctrl.signal })
        if (!res.ok) return null
        const info = (await res.json()) as ConnectorInfo
        return info?.app === 'AeroFMS-Connector' ? { host, info } : null
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    }),
  )
  return results.filter((r): r is { host: string; info: ConnectorInfo } => r !== null)
}

/** Candidate hosts on a /24 subnet derived from the device IP (e.g. 192.168.0.23 → 192.168.0.1-254). */
export function subnetHosts(deviceIp: string, port: number): string[] {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(deviceIp)
  if (!m) return []
  const prefix = `${m[1]}.${m[2]}.${m[3]}`
  return Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}:${port}`)
}
