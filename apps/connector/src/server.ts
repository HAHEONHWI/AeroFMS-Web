import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import type { ExternalAircraftState } from '@aerofms/core'
import type { FlightPlan } from '@aerofms/shared'
import { CONNECTOR_INFO_PATH, CONNECTOR_PROTOCOL_VERSION, CONNECTOR_WS_PATH, parseClientMessage } from '@aerofms/simulation'
import type { ConnectorInfo, ConnectorStatus, ServerMessage } from '@aerofms/simulation'
import { silentLogger } from './adapters/types'
import type { Logger, SimulatorAdapter } from './adapters/types'

export interface ConnectorServerOptions {
  port: number
  /** Interface to bind; 0.0.0.0 lets phones on the same LAN connect. */
  bindHost?: string
  hostName: string
  version: string
  adapters: SimulatorAdapter[]
  logger?: Logger
  maxClients?: number
  /** Minimum interval between AIRCRAFT_STATE messages per client. */
  stateIntervalMs?: number
}

interface Client {
  ws: WebSocket
  hello: boolean
  lastStateAt: number
}

const MAX_PAYLOAD = 2 * 1024 * 1024

export class ConnectorServer {
  private http?: Server
  private wss?: WebSocketServer
  private readonly clients = new Set<Client>()
  private activeId?: string
  /** True once a client picked a simulator explicitly; otherwise the first available one is used. */
  private manualSelection = false
  private lastPlan?: FlightPlan
  private readonly unsubscribers: Array<() => void> = []
  private readonly log: Logger
  private port = 0

  constructor(private readonly opts: ConnectorServerOptions) {
    this.log = opts.logger ?? silentLogger
  }

  info(): ConnectorInfo {
    return {
      app: 'AeroFMS-Connector',
      protocol: CONNECTOR_PROTOCOL_VERSION,
      version: this.opts.version,
      hostName: this.opts.hostName,
      port: this.port,
      simulators: this.opts.adapters.map((a) => a.info()),
    }
  }

  get activeSimulator(): string | undefined {
    return this.activeId
  }

  private adapter(id: string | undefined): SimulatorAdapter | undefined {
    return this.opts.adapters.find((a) => a.id === id)
  }

  private status(): { status: ConnectorStatus; simulator?: string } {
    const a = this.adapter(this.activeId)
    return a?.info().available ? { status: 'CONNECTED', simulator: a.id } : { status: 'WAITING_FOR_SIM', ...(a ? { simulator: a.id } : {}) }
  }

  private send(c: Client, msg: ServerMessage): void {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg))
  }

  private broadcast(msg: ServerMessage): void {
    for (const c of this.clients) if (c.hello) this.send(c, msg)
  }

  private broadcastStatus(message?: string): void {
    this.broadcast({ type: 'STATUS', ...this.status(), ...(message ? { message } : {}) })
  }

  private autoSelect(): void {
    if (this.manualSelection && this.adapter(this.activeId)) return
    const current = this.adapter(this.activeId)
    if (current?.info().available) return
    const next = this.opts.adapters.find((a) => a.info().available)
    if (next && next.id !== this.activeId) {
      this.activeId = next.id
      this.log.info(`Active simulator: ${next.name}`)
    }
  }

  private onState(adapter: SimulatorAdapter, state: ExternalAircraftState): void {
    if (adapter.id !== this.activeId) return
    const now = Date.now()
    const minInterval = this.opts.stateIntervalMs ?? 100
    for (const c of this.clients) {
      if (!c.hello || now - c.lastStateAt < minInterval) continue
      c.lastStateAt = now
      this.send(c, { type: 'AIRCRAFT_STATE', state, t: now })
    }
  }

  async start(): Promise<number> {
    for (const a of this.opts.adapters) {
      this.unsubscribers.push(a.onState((s) => this.onState(a, s)))
      this.unsubscribers.push(
        a.onAvailability(() => {
          this.autoSelect()
          this.broadcastStatus()
        }),
      )
    }
    this.http = createServer((req, res) => this.handleHttp(req, res))
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })
    this.http.on('upgrade', (req, socket, head) => {
      const path = (req.url ?? '').split('?')[0]
      if (path !== CONNECTOR_WS_PATH || this.clients.size >= (this.opts.maxClients ?? 16)) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      this.wss?.handleUpgrade(req, socket, head, (ws) => this.handleSocket(ws, req))
    })
    await new Promise<void>((resolve, reject) => {
      this.http?.once('error', reject)
      this.http?.listen(this.opts.port, this.opts.bindHost ?? '0.0.0.0', () => resolve())
    })
    this.port = (this.http.address() as AddressInfo).port
    await Promise.all(this.opts.adapters.map((a) => a.start()))
    this.autoSelect()
    return this.port
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    // Web clients fetch /aerofms/info cross-origin; Chrome's Private Network Access needs the extra header.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }
    const path = (req.url ?? '').split('?')[0]
    if (req.method === 'GET' && path === CONNECTOR_INFO_PATH) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(this.info()))
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
  }

  private handleSocket(ws: WebSocket, req: IncomingMessage): void {
    const client: Client = { ws, hello: false, lastStateAt: 0 }
    this.clients.add(client)
    const remote = req.socket.remoteAddress ?? '?'
    ws.on('close', () => {
      this.clients.delete(client)
      this.log.info(`Client disconnected (${remote})`)
    })
    ws.on('error', () => undefined)
    ws.on('message', (data, isBinary) => {
      if (isBinary) return this.send(client, { type: 'ERROR', code: 'BAD_MESSAGE', message: 'Binary frames are not supported' })
      const msg = parseClientMessage(data.toString())
      if (!msg) return this.send(client, { type: 'ERROR', code: 'BAD_MESSAGE', message: 'Malformed message' })
      if (!client.hello && msg.type !== 'HELLO') return this.send(client, { type: 'ERROR', code: 'HELLO_REQUIRED', message: 'Send HELLO first' })
      switch (msg.type) {
        case 'HELLO':
          if (msg.protocol !== CONNECTOR_PROTOCOL_VERSION) {
            this.send(client, { type: 'ERROR', code: 'PROTOCOL', message: `Protocol ${msg.protocol} is not supported (expected ${CONNECTOR_PROTOCOL_VERSION})` })
            ws.close(1002)
            return
          }
          client.hello = true
          this.log.info(`Client connected: ${msg.client} (${remote})`)
          this.send(client, { type: 'WELCOME', protocol: CONNECTOR_PROTOCOL_VERSION, info: this.info(), ...(this.status().status === 'CONNECTED' && this.activeId ? { activeSimulator: this.activeId } : {}) })
          this.send(client, { type: 'STATUS', ...this.status() })
          return
        case 'SELECT_SIMULATOR': {
          const a = this.adapter(msg.id)
          if (!a) return this.send(client, { type: 'ERROR', code: 'UNKNOWN_SIMULATOR', message: msg.id })
          this.activeId = a.id
          this.manualSelection = true
          this.log.info(`Simulator selected: ${a.name}`)
          this.broadcastStatus()
          return
        }
        case 'SET_FLIGHT_PLAN':
          this.lastPlan = msg.plan
          void this.exportPlan(msg.plan, client)
          return
        case 'REQUEST_FLIGHT_PLAN':
          if (this.lastPlan) this.send(client, { type: 'FLIGHT_PLAN', plan: this.lastPlan })
          return
        case 'PING':
          this.send(client, { type: 'PONG', t: msg.t })
          return
      }
    })
  }

  /** Every adapter that accepts flight plans receives it (file exports, demo flight). */
  private async exportPlan(plan: FlightPlan, client: Client): Promise<void> {
    const results: string[] = []
    for (const a of this.opts.adapters) {
      if (!a.setFlightPlan) continue
      try {
        const r = await a.setFlightPlan(plan)
        if (r) results.push(r)
      } catch (e) {
        this.send(client, { type: 'ERROR', code: 'FLIGHT_PLAN', message: `${a.name}: ${e instanceof Error ? e.message : String(e)}` })
      }
    }
    this.autoSelect()
    this.broadcastStatus(results.length ? `Flight plan exported: ${results.join(', ')}` : undefined)
  }

  async stop(): Promise<void> {
    for (const u of this.unsubscribers.splice(0)) u()
    for (const c of this.clients) c.ws.close(1001)
    this.clients.clear()
    await Promise.all(this.opts.adapters.map((a) => a.stop()))
    this.wss?.close()
    await new Promise<void>((resolve) => (this.http ? this.http.close(() => resolve()) : resolve()))
  }
}
