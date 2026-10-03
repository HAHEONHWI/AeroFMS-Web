import { createSocket } from 'node:dgram'
import type { Socket } from 'node:dgram'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExternalAircraftState } from '@aerofms/core'
import type { FlightPlan } from '@aerofms/shared'
import { toXPlaneFms } from '../export/plan'
import { BaseAdapter, M_TO_FT, MPS_TO_KT, normalizeDeg, silentLogger } from './types'
import type { Logger } from './types'

/** Datarefs subscribed through X-Plane's UDP "RREF" interface (X-Plane 10.40+, 11, 12). */
export const XPLANE_DATAREFS = [
  'sim/flightmodel/position/latitude',
  'sim/flightmodel/position/longitude',
  'sim/flightmodel/position/elevation',
  'sim/flightmodel/position/psi',
  'sim/flightmodel/position/hpath',
  'sim/flightmodel/position/groundspeed',
  'sim/flightmodel/position/true_airspeed',
  'sim/flightmodel/position/indicated_airspeed',
  'sim/flightmodel/position/vh_ind_fpm',
  'sim/flightmodel/failures/onground_any',
  'sim/flightmodel/weight/m_fuel_total',
] as const

const RREF_DATAREF_BYTES = 400

/** "RREF\0" + int32 frequency + int32 client index + 400-byte null-padded dataref path. */
export function buildRrefRequest(index: number, frequencyHz: number, dataref: string): Buffer {
  const buf = Buffer.alloc(5 + 4 + 4 + RREF_DATAREF_BYTES)
  buf.write('RREF\0', 0, 'ascii')
  buf.writeInt32LE(frequencyHz, 5)
  buf.writeInt32LE(index, 9)
  buf.write(dataref.slice(0, RREF_DATAREF_BYTES - 1), 13, 'ascii')
  return buf
}

/** Parses an "RREF" response: 5-byte header followed by (int32 index, float32 value) pairs. */
export function parseRrefResponse(buf: Buffer): Map<number, number> | null {
  if (buf.length < 5 || buf.toString('ascii', 0, 4) !== 'RREF') return null
  const out = new Map<number, number>()
  for (let off = 5; off + 8 <= buf.length; off += 8) out.set(buf.readInt32LE(off), buf.readFloatLE(off + 4))
  return out
}

/** Converts raw dataref values (indexed as XPLANE_DATAREFS) to the connector aircraft state. */
export function xplaneValuesToState(values: ReadonlyMap<number, number>): ExternalAircraftState | null {
  const v = (i: number) => values.get(i)
  const lat = v(0)
  const lon = v(1)
  if (lat === undefined || lon === undefined || (lat === 0 && lon === 0)) return null
  const fuel = v(10)
  return {
    lat,
    lon,
    altitudeFt: (v(2) ?? 0) * M_TO_FT,
    headingTrue: normalizeDeg(v(3) ?? 0),
    trackTrue: normalizeDeg(v(4) ?? v(3) ?? 0),
    groundSpeedKt: (v(5) ?? 0) * MPS_TO_KT,
    trueAirspeedKt: (v(6) ?? 0) * MPS_TO_KT,
    indicatedAirspeedKt: v(7) ?? 0,
    verticalSpeedFpm: v(8) ?? 0,
    onGround: (v(9) ?? 0) >= 0.5,
    ...(fuel !== undefined ? { fuelKg: fuel } : {}),
  }
}

export interface XPlaneOptions {
  host: string
  port: number
  /** Directory that receives AEROFMS.fms (X-Plane "Output/FMS plans"). */
  fmsDir?: string
  frequencyHz?: number
  logger?: Logger
}

export class XPlaneAdapter extends BaseAdapter {
  readonly id = 'xplane'
  readonly kind = 'XPLANE' as const
  readonly name = 'X-Plane 11/12'
  private socket?: Socket
  private values = new Map<number, number>()
  private lastPacketAt = 0
  private watchdog?: ReturnType<typeof setInterval>
  private readonly log: Logger

  constructor(private readonly opts: XPlaneOptions) {
    super()
    this.log = opts.logger ?? silentLogger
    this.detail = `UDP ${opts.host}:${opts.port}`
  }

  async start(): Promise<void> {
    const socket = createSocket('udp4')
    this.socket = socket
    socket.on('message', (msg) => {
      const parsed = parseRrefResponse(msg)
      if (!parsed) return
      for (const [k, val] of parsed) this.values.set(k, val)
      this.lastPacketAt = Date.now()
      if (!this.available) {
        this.log.info(`X-Plane data received from ${this.opts.host}:${this.opts.port}`)
        this.setAvailable(true, `UDP ${this.opts.host}:${this.opts.port}`)
      }
      const state = xplaneValuesToState(this.values)
      if (state) this.emitState(state)
    })
    socket.on('error', (e) => this.log.warn(`X-Plane UDP error: ${e.message}`))
    await new Promise<void>((resolve) => socket.bind(0, resolve))
    this.subscribe(this.opts.frequencyHz ?? 10)
    // Re-subscribe periodically: X-Plane forgets subscriptions when it restarts.
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastPacketAt > 3000) {
        if (this.available) {
          this.log.info('X-Plane data stopped')
          this.setAvailable(false, `UDP ${this.opts.host}:${this.opts.port}`)
        }
        this.subscribe(this.opts.frequencyHz ?? 10)
      }
    }, 2000)
  }

  private subscribe(freq: number): void {
    XPLANE_DATAREFS.forEach((ref, i) => this.socket?.send(buildRrefRequest(i, freq, ref), this.opts.port, this.opts.host))
  }

  async stop(): Promise<void> {
    if (this.watchdog) clearInterval(this.watchdog)
    if (!this.socket) return
    this.subscribe(0)
    const s = this.socket
    this.socket = undefined
    await new Promise<void>((resolve) => s.close(() => resolve()))
    this.setAvailable(false, this.detail)
  }

  async setFlightPlan(plan: FlightPlan): Promise<string | undefined> {
    if (!this.opts.fmsDir) return undefined
    await mkdir(this.opts.fmsDir, { recursive: true })
    const file = join(this.opts.fmsDir, 'AEROFMS.fms')
    await writeFile(file, toXPlaneFms(plan), 'utf8')
    this.log.info(`X-Plane flight plan written: ${file}`)
    return file
  }
}
