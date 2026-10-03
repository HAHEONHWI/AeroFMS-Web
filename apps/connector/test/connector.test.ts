import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import type { ExternalAircraftState } from '@aerofms/core'
import type { FlightPlan, FlightPlanLeg, WaypointType } from '@aerofms/shared'
import { CONNECTOR_WS_PATH, parseServerMessage } from '@aerofms/simulation'
import type { ServerMessage } from '@aerofms/simulation'
import { DemoAdapter, DemoFlight } from '../src/adapters/demo'
import { msfsValuesToState } from '../src/adapters/msfs'
import { BaseAdapter } from '../src/adapters/types'
import { buildRrefRequest, parseRrefResponse, xplaneValuesToState } from '../src/adapters/xplane'
import { formatLla, toMsfsPln, toXPlaneFms } from '../src/export/plan'
import { ConnectorServer } from '../src/server'

const leg = (ident: string, lat: number, lon: number, type: WaypointType, segment: FlightPlanLeg['segment'], via?: string): FlightPlanLeg => ({
  kind: 'LEG',
  id: ident,
  waypoint: { ident, lat, lon, type },
  legType: 'TF',
  segment,
  ...(via ? { via } : {}),
})

const plan: FlightPlan = {
  id: 'p1',
  origin: 'RKSI',
  destination: 'RKPC',
  departureRunway: '33L',
  cruiseAltitudeFt: 33000,
  activated: true,
  activeLegIndex: 1,
  updatedAt: 0,
  elements: [
    leg('RKSI', 37.4692, 126.4505, 'AIRPORT', 'ORIGIN'),
    leg('BULTI', 37.2, 126.6, 'FIX', 'ENROUTE', 'DIRECT'),
    { kind: 'DISCONTINUITY', id: 'd1' },
    leg('OSN', 37.09, 127.03, 'VORDME', 'ENROUTE', 'Y711'),
    leg('RKPC', 33.5113, 126.4929, 'AIRPORT', 'DESTINATION'),
  ],
}

class FakeAdapter extends BaseAdapter {
  readonly id = 'fake'
  readonly kind = 'XPLANE' as const
  readonly name = 'Fake'
  async start() {
    this.setAvailable(true)
  }
  async stop() {
    this.setAvailable(false)
  }
  push(s: ExternalAircraftState) {
    this.emitState(s)
  }
}

const state: ExternalAircraftState = { lat: 37.5, lon: 126.9, altitudeFt: 12000, headingTrue: 90, trackTrue: 92, groundSpeedKt: 320, trueAirspeedKt: 330, indicatedAirspeedKt: 280, verticalSpeedFpm: 1500, onGround: false }

describe('X-Plane UDP', () => {
  it('builds RREF requests and parses responses', () => {
    const req = buildRrefRequest(3, 10, 'sim/flightmodel/position/psi')
    expect(req.length).toBe(413)
    expect(req.toString('ascii', 0, 4)).toBe('RREF')
    expect(req.readInt32LE(5)).toBe(10)
    expect(req.readInt32LE(9)).toBe(3)
    const res = Buffer.alloc(5 + 16)
    res.write('RREF,', 0, 'ascii')
    res.writeInt32LE(0, 5)
    res.writeFloatLE(37.5, 9)
    res.writeInt32LE(1, 13)
    res.writeFloatLE(126.25, 17)
    const parsed = parseRrefResponse(res)
    expect(parsed?.get(0)).toBeCloseTo(37.5)
    expect(parsed?.get(1)).toBeCloseTo(126.25)
    expect(parseRrefResponse(Buffer.from('DATA*'))).toBeNull()
  })

  it('converts dataref units', () => {
    const s = xplaneValuesToState(new Map([[0, 37], [1, 127], [2, 1000], [3, -10], [5, 100], [9, 1], [10, 5000]]))
    expect(s?.altitudeFt).toBeCloseTo(3280.84, 1)
    expect(s?.headingTrue).toBeCloseTo(350)
    expect(s?.groundSpeedKt).toBeCloseTo(194.38, 1)
    expect(s?.onGround).toBe(true)
    expect(s?.fuelKg).toBe(5000)
    expect(xplaneValuesToState(new Map([[0, 0], [1, 0]]))).toBeNull()
  })
})

describe('MSFS', () => {
  it('converts SimVars', () => {
    const s = msfsValuesToState([37, 127, 5000, 370, 10, 250, 260, 240, -500, 0, 1000])
    expect(s?.headingTrue).toBeCloseTo(10)
    expect(s?.fuelKg).toBeCloseTo(453.59, 1)
    expect(s?.onGround).toBe(false)
  })
})

describe('flight plan export', () => {
  it('writes X-Plane FMS v1100', () => {
    const fms = toXPlaneFms(plan)
    expect(fms).toContain('1100 Version')
    expect(fms).toContain('ADEP RKSI')
    expect(fms).toContain('DEPRWY RW33L')
    expect(fms).toContain('NUMENR 4')
    expect(fms).toMatch(/^1 RKSI ADEP /m)
    expect(fms).toMatch(/^11 BULTI DRCT /m)
    expect(fms).toMatch(/^3 OSN Y711 /m)
    expect(fms).toMatch(/^1 RKPC ADES /m)
  })

  it('writes MSFS PLN', () => {
    const pln = toMsfsPln(plan)
    expect(pln).toContain('<DepartureID>RKSI</DepartureID>')
    expect(pln).toContain('<CruisingAlt>33000</CruisingAlt>')
    expect(pln).toContain('<ATCAirway>Y711</ATCAirway>')
    expect(pln.match(/<ATCWaypoint /g)).toHaveLength(4)
    expect(formatLla(37.5, -122.25, 100)).toBe(`N37° 30' 0.00",W122° 15' 0.00",+000100.00`)
  })
})

describe('demo flight', () => {
  it('flies the route to the destination', () => {
    const f = new DemoFlight(plan)
    let s = f.step(1)
    let maxAlt = 0
    for (let i = 0; i < 20000 && !f.finished; i++) {
      s = f.step(1)
      maxAlt = Math.max(maxAlt, s.altitudeFt)
    }
    expect(f.finished).toBe(true)
    expect(maxAlt).toBeGreaterThan(10000)
    expect(s.onGround).toBe(true)
    expect(Math.abs(s.lat - 33.5113)).toBeLessThan(0.01)
  })
})

describe('ConnectorServer', () => {
  let server: ConnectorServer | undefined
  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  const connect = async (port: number) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${CONNECTOR_WS_PATH}`)
    const inbox: ServerMessage[] = []
    const waiters: Array<() => void> = []
    ws.on('message', (d) => {
      const m = parseServerMessage(d.toString())
      if (m) inbox.push(m)
      waiters.splice(0).forEach((w) => w())
    })
    await new Promise((r) => ws.once('open', r))
    const next = async <T extends ServerMessage['type']>(type: T, where: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true): Promise<Extract<ServerMessage, { type: T }>> => {
      for (let i = 0; i < 50; i++) {
        const idx = inbox.findIndex((m) => m.type === type && where(m as Extract<ServerMessage, { type: T }>))
        if (idx >= 0) return inbox.splice(idx, 1)[0] as Extract<ServerMessage, { type: T }>
        await new Promise<void>((r) => {
          waiters.push(r)
          setTimeout(r, 50)
        })
      }
      throw new Error(`timeout waiting for ${type}`)
    }
    return { ws, next, send: (m: unknown) => ws.send(JSON.stringify(m)) }
  }

  it('serves info, handshakes and relays aircraft state and flight plans', async () => {
    const fake = new FakeAdapter()
    const demo = new DemoAdapter()
    server = new ConnectorServer({ port: 0, bindHost: '127.0.0.1', hostName: 'test', version: '1.0.0', adapters: [fake, demo], stateIntervalMs: 0 })
    const port = await server.start()

    const info = (await (await fetch(`http://127.0.0.1:${port}/aerofms/info`)).json()) as { app: string; simulators: unknown[] }
    expect(info.app).toBe('AeroFMS-Connector')
    expect(info.simulators).toHaveLength(2)

    const c = await connect(port)
    c.send({ type: 'PING', t: 1 })
    expect((await c.next('ERROR')).code).toBe('HELLO_REQUIRED')
    c.send({ type: 'HELLO', protocol: 1, client: 'web' })
    const welcome = await c.next('WELCOME')
    expect(welcome.activeSimulator).toBe('fake')

    fake.push(state)
    expect((await c.next('AIRCRAFT_STATE')).state.altitudeFt).toBe(12000)

    c.send({ type: 'SET_FLIGHT_PLAN', plan })
    await new Promise((r) => setTimeout(r, 50))
    const c2 = await connect(port)
    c2.send({ type: 'HELLO', protocol: 1, client: 'android' })
    await c2.next('WELCOME')
    c2.send({ type: 'REQUEST_FLIGHT_PLAN' })
    expect((await c2.next('FLIGHT_PLAN')).plan.destination).toBe('RKPC')

    c2.send({ type: 'SELECT_SIMULATOR', id: 'demo' })
    const st = await c.next('STATUS', (m) => m.simulator === 'demo')
    expect(st.status).toBe('CONNECTED')
    expect(server.activeSimulator).toBe('demo')

    c.send({ type: 'SELECT_SIMULATOR', id: 'nope' })
    expect((await c.next('ERROR')).code).toBe('UNKNOWN_SIMULATOR')
    c.ws.close()
    c2.ws.close()
  })

  it('rejects unsupported protocol versions', async () => {
    server = new ConnectorServer({ port: 0, bindHost: '127.0.0.1', hostName: 'test', version: '1.0.0', adapters: [] })
    const port = await server.start()
    const c = await connect(port)
    const closed = new Promise<number>((r) => c.ws.once('close', (code) => r(code)))
    c.send({ type: 'HELLO', protocol: 99, client: 'web' })
    expect((await c.next('ERROR')).code).toBe('PROTOCOL')
    expect(await closed).toBe(1002)
  })
})
