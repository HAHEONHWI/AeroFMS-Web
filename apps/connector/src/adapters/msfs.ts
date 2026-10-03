import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { open, Protocol, SimConnectConstants, SimConnectDataType, SimConnectPeriod } from 'node-simconnect'
import type { ConnectionHandle, RawBuffer } from 'node-simconnect'
import type { ExternalAircraftState } from '@aerofms/core'
import type { FlightPlan } from '@aerofms/shared'
import { toMsfsPln } from '../export/plan'
import { BaseAdapter, LB_TO_KG, normalizeDeg, silentLogger } from './types'
import type { Logger } from './types'

/** SimVars read every few simulation frames (order matters: values are read back sequentially). */
export const MSFS_SIMVARS: ReadonlyArray<readonly [name: string, unit: string]> = [
  ['PLANE LATITUDE', 'degrees'],
  ['PLANE LONGITUDE', 'degrees'],
  ['PLANE ALTITUDE', 'feet'],
  ['PLANE HEADING DEGREES TRUE', 'degrees'],
  ['GPS GROUND TRUE TRACK', 'degrees'],
  ['GROUND VELOCITY', 'knots'],
  ['AIRSPEED TRUE', 'knots'],
  ['AIRSPEED INDICATED', 'knots'],
  ['VERTICAL SPEED', 'feet per minute'],
  ['SIM ON GROUND', 'bool'],
  ['FUEL TOTAL QUANTITY WEIGHT', 'pounds'],
]

export function msfsValuesToState(v: readonly number[]): ExternalAircraftState | null {
  const [lat, lon, alt, hdg, trk, gs, tas, ias, vs, onGround, fuelLb] = v
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    lat,
    lon,
    altitudeFt: alt ?? 0,
    headingTrue: normalizeDeg(hdg ?? 0),
    trackTrue: normalizeDeg(trk ?? hdg ?? 0),
    groundSpeedKt: gs ?? 0,
    trueAirspeedKt: tas ?? 0,
    indicatedAirspeedKt: ias ?? 0,
    verticalSpeedFpm: vs ?? 0,
    onGround: (onGround ?? 0) >= 0.5,
    ...(fuelLb !== undefined ? { fuelKg: fuelLb * LB_TO_KG } : {}),
  }
}

export interface MsfsOptions {
  /** Remote SimConnect (TCP). Omit to auto-detect the local named pipe on Windows. */
  host?: string
  port?: number
  /** Directory that receives AEROFMS.PLN (load it from the MSFS World Map). */
  plnDir?: string
  logger?: Logger
}

const DEFINITION_ID = 1
const REQUEST_ID = 1
const RETRY_MS = 5000

export class MsfsAdapter extends BaseAdapter {
  readonly id = 'msfs'
  readonly kind = 'MSFS' as const
  readonly name = 'Microsoft Flight Simulator (SimConnect)'
  private handle?: ConnectionHandle
  private retryTimer?: ReturnType<typeof setTimeout>
  private stopped = true
  private readonly log: Logger

  constructor(private readonly opts: MsfsOptions = {}) {
    super()
    this.log = opts.logger ?? silentLogger
    this.detail = opts.host ? `SimConnect ${opts.host}:${opts.port ?? 500}` : 'SimConnect (local)'
  }

  async start(): Promise<void> {
    this.stopped = false
    await this.connect()
  }

  private scheduleRetry(): void {
    if (this.stopped) return
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => void this.connect(), RETRY_MS)
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    try {
      const options = this.opts.host ? { remote: { host: this.opts.host, port: this.opts.port ?? 500 } } : undefined
      const { recvOpen, handle } = await open('AeroFMS Connector', Protocol.KittyHawk, options)
      this.handle = handle
      this.log.info(`Connected to ${recvOpen.applicationName}`)
      for (const [name, unit] of MSFS_SIMVARS) handle.addToDataDefinition(DEFINITION_ID, name, unit, SimConnectDataType.FLOAT64)
      // Every 6th simulation frame (≈ 5–10 Hz).
      handle.requestDataOnSimObject(REQUEST_ID, DEFINITION_ID, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SIM_FRAME, 0, 0, 6)
      handle.on('simObjectData', (data) => {
        if (data.requestID !== REQUEST_ID) return
        const state = msfsValuesToState(readFloats(data.data, MSFS_SIMVARS.length))
        if (state) this.emitState(state)
      })
      const lost = (why: string) => {
        if (this.handle !== handle) return
        this.handle = undefined
        this.log.info(`SimConnect closed (${why})`)
        this.setAvailable(false, this.detail)
        this.scheduleRetry()
      }
      handle.on('quit', () => lost('quit'))
      handle.on('close', () => lost('close'))
      handle.on('error', (e) => lost(e.message))
      this.setAvailable(true, `${recvOpen.applicationName}`)
    } catch (e) {
      // MSFS not running (or not on Windows without a remote host): keep retrying quietly.
      this.setAvailable(false, `${this.detail} – ${e instanceof Error ? e.message : String(e)}`)
      this.scheduleRetry()
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    const h = this.handle
    this.handle = undefined
    h?.close()
    this.setAvailable(false, this.detail)
  }

  async setFlightPlan(plan: FlightPlan): Promise<string | undefined> {
    if (!this.opts.plnDir) return undefined
    await mkdir(this.opts.plnDir, { recursive: true })
    const file = join(this.opts.plnDir, 'AEROFMS.PLN')
    await writeFile(file, toMsfsPln(plan), 'utf8')
    this.log.info(`MSFS flight plan written: ${file}`)
    return file
  }
}

function readFloats(buf: RawBuffer, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(buf.readFloat64())
  return out
}
