import type { ExternalAircraftState } from '@aerofms/core'
import { bearingDeg, destinationPoint, distanceNm } from '@aerofms/shared'
import type { FlightPlan, LatLon } from '@aerofms/shared'
import { routeLegs } from '../export/plan'
import { BaseAdapter } from './types'

const TAXI_KT = 0
const ROTATE_KT = 150
const CLIMB_FPM = 2500
const DESCENT_FPM = 1800
const CRUISE_GS = 460
const APPROACH_GS = 150

/**
 * Deterministic kinematic flight along a flight plan's legs. Used by the built-in demo source so the
 * connector can be tested end-to-end without a flight simulator.
 */
export class DemoFlight {
  private readonly path: LatLon[]
  private readonly cruiseFt: number
  private readonly elevStartFt: number
  private segment = 0
  pos: LatLon
  altitudeFt: number
  groundSpeedKt = TAXI_KT
  verticalSpeedFpm = 0
  heading = 0
  finished = false
  private takeoffRollNm = 0

  constructor(plan: FlightPlan) {
    this.path = routeLegs(plan).map((l) => ({ lat: l.waypoint.lat, lon: l.waypoint.lon }))
    if (this.path.length < 2) throw new Error('A flight plan with at least two waypoints is required')
    this.cruiseFt = plan.cruiseAltitudeFt ?? 35000
    this.elevStartFt = 0
    this.pos = { ...(this.path[0] as LatLon) }
    this.altitudeFt = this.elevStartFt
    this.heading = bearingDeg(this.pos, this.path[1] as LatLon)
  }

  remainingNm(): number {
    let d = 0
    let p = this.pos
    for (let i = this.segment + 1; i < this.path.length; i++) {
      const q = this.path[i] as LatLon
      d += distanceNm(p, q)
      p = q
    }
    return d
  }

  /** Advances the flight by dt seconds. */
  step(dt: number): ExternalAircraftState {
    if (!this.finished) {
      const remaining = this.remainingNm()
      const descentNm = ((this.altitudeFt - this.elevStartFt) / 1000) * 3
      const onGround = this.altitudeFt <= this.elevStartFt + 1
      if (remaining < 0.2) {
        this.finished = true
        this.groundSpeedKt = 0
        this.verticalSpeedFpm = 0
        this.altitudeFt = this.elevStartFt
      } else if (onGround && this.takeoffRollNm < 1.2) {
        this.groundSpeedKt = Math.min(ROTATE_KT, this.groundSpeedKt + 6 * dt)
        this.takeoffRollNm += (this.groundSpeedKt * dt) / 3600
        this.verticalSpeedFpm = 0
      } else if (remaining <= descentNm + 2) {
        this.verticalSpeedFpm = -Math.min(DESCENT_FPM, ((this.altitudeFt - this.elevStartFt) / Math.max(remaining, 0.5)) * (this.groundSpeedKt / 60))
        this.groundSpeedKt = Math.max(APPROACH_GS, this.groundSpeedKt - 1.5 * dt)
      } else if (this.altitudeFt < this.cruiseFt - 50) {
        this.verticalSpeedFpm = CLIMB_FPM
        this.groundSpeedKt = Math.min(CRUISE_GS, this.groundSpeedKt + 2 * dt)
      } else {
        this.verticalSpeedFpm = 0
        this.altitudeFt = this.cruiseFt
        this.groundSpeedKt = CRUISE_GS
      }
      this.altitudeFt = Math.max(this.elevStartFt, Math.min(this.cruiseFt, this.altitudeFt + (this.verticalSpeedFpm * dt) / 60))
      this.advance((this.groundSpeedKt * dt) / 3600)
    }
    const onGround = this.altitudeFt <= this.elevStartFt + 1
    return {
      lat: this.pos.lat,
      lon: this.pos.lon,
      altitudeFt: this.altitudeFt,
      headingTrue: this.heading,
      trackTrue: this.heading,
      groundSpeedKt: this.groundSpeedKt,
      trueAirspeedKt: this.groundSpeedKt,
      indicatedAirspeedKt: this.groundSpeedKt / (1 + this.altitudeFt / 1000 * 0.02),
      verticalSpeedFpm: this.verticalSpeedFpm,
      onGround,
    }
  }

  private advance(nm: number): void {
    let left = nm
    while (left > 0 && this.segment < this.path.length - 1) {
      const next = this.path[this.segment + 1] as LatLon
      const d = distanceNm(this.pos, next)
      if (d <= left) {
        this.pos = { ...next }
        left -= d
        this.segment++
        const after = this.path[this.segment + 1]
        if (after) this.heading = bearingDeg(this.pos, after)
      } else {
        this.heading = bearingDeg(this.pos, next)
        this.pos = destinationPoint(this.pos, this.heading, left)
        left = 0
      }
    }
  }
}

/** Built-in source that flies the last flight plan sent by an AeroFMS client. */
export class DemoAdapter extends BaseAdapter {
  readonly id = 'demo'
  readonly kind = 'BUILTIN_REPLAY' as const
  readonly name = 'AeroFMS Demo Flight'
  private flight?: DemoFlight
  private timer?: ReturnType<typeof setInterval>

  constructor(private readonly timeScale = 1) {
    super()
    this.detail = 'Send a flight plan from AeroFMS to start'
  }

  async start(): Promise<void> {
    const hz = 4
    this.timer = setInterval(() => {
      if (this.flight) this.emitState(this.flight.step((1 / hz) * this.timeScale))
    }, 1000 / hz)
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  async setFlightPlan(plan: FlightPlan): Promise<string | undefined> {
    this.flight = new DemoFlight(plan)
    this.setAvailable(true, `${plan.origin ?? ''} → ${plan.destination ?? ''}`.trim())
    return undefined
  }
}
