import { current } from 'immer'
import type { Draft } from 'immer'
import {
  bearingDeg,
  destinationPoint,
  distanceNm,
  headingDiff,
  iasToTas,
  isLeg,
  machToTas,
  normalizeHeading,
  tasToMach,
} from '@aerofms/shared'
import type { FlightPlan, FlightPlanLeg, LatLon } from '@aerofms/shared'
import {
  computeLnavGuidance,
  computeVnavProfile,
  cruiseFuelFlowKgH,
  effectiveSpeeds,
  grossWeightKg,
  climbRateFpm,
  interceptHeading,
  magToTrue,
  postMessage,
  updateGuidanceAndSequence,
  vref,
} from '@aerofms/core'
import type { AdapterContext, AircraftFmsAdapter, FmsState, SimulationControl, SimulationStepper, VnavProfile } from '@aerofms/core'

type Ctx = AdapterContext & { adapter: AircraftFmsAdapter }

const SUBSTEP_SEC = 1
const TAXI_SEC = 45

/**
 * Built-in standalone flight simulation (no external simulator needed).
 * Kinematic point-mass model following LNAV/VNAV guidance. Training approximation only.
 */
export class StandaloneSimulator implements SimulationStepper {
  control(draft: Draft<FmsState>, control: SimulationControl, ctx: Ctx): void {
    const sim = draft.simulation
    switch (control.kind) {
      case 'START':
        this.start(draft, ctx)
        return
      case 'PAUSE':
        if (sim.status === 'RUNNING') sim.status = 'PAUSED'
        return
      case 'RESUME':
        if (sim.status === 'PAUSED') sim.status = 'RUNNING'
        return
      case 'STOP':
        sim.status = 'COMPLETED'
        draft.guidance.lnav = 'OFF'
        draft.guidance.vnav = 'OFF'
        return
      case 'RESET':
        this.reset(draft, ctx)
        return
      case 'SET_SPEED':
        sim.timeScale = control.timeScale
        return
      case 'GO_AROUND':
        this.goAround(draft)
        return
    }
  }

  private origin(draft: Draft<FmsState>, ctx: Ctx) {
    const plan = draft.activeFlightPlan
    const ap = plan.origin ? ctx.nav.searchAirport(plan.origin) : undefined
    const rwy = ap && plan.departureRunway ? ap.runways.find((r) => r.ident === plan.departureRunway) : undefined
    return { ap, rwy }
  }

  private start(draft: Draft<FmsState>, ctx: Ctx): void {
    const plan = draft.activeFlightPlan
    const legs = plan.elements.filter(isLeg)
    const { ap, rwy } = this.origin(draft, ctx)
    if (!ap || legs.length < 2) {
      postMessage(draft, 'NO_ACTIVE_ROUTE', ctx.adapter.messages, ctx.nextId, ctx.now, 'ALERT')
      return
    }
    if (!plan.activated && draft.aircraft.manufacturer === 'BOEING') {
      postMessage(draft, 'NO_ACTIVE_ROUTE', ctx.adapter.messages, ctx.nextId, ctx.now, 'ALERT')
      return
    }
    const sim = draft.simulation
    const perf = draft.performance
    const model = ctx.adapter.performanceModel
    sim.status = 'RUNNING'
    sim.elapsedSec = 0
    sim.fuelUsedKg = 0
    sim.distanceFlownNm = 0
    sim.fuelKg = perf.fuelKg ?? Math.round(model.maxFuelKg * 0.35)
    if (perf.fuelKg === undefined) perf.fuelKg = sim.fuelKg
    if (perf.zfwKg === undefined) perf.zfwKg = Math.round((model.oewKg + model.mzfwKg) / 2 / 100) * 100
    sim.windDir = perf.cruiseWindDir ?? 0
    sim.windKt = Math.abs(perf.cruiseWindKt ?? 0)
    sim.hold = undefined
    sim.phaseTimerSec = 0
    const start = rwy ?? ap
    draft.position.aircraft = { lat: start.lat, lon: start.lon }
    draft.position.altitudeFt = rwy?.elevationFt ?? ap.elevationFt
    draft.position.headingTrue = rwy?.headingTrue ?? bearingDeg(ap, legs[1]?.waypoint ?? ap)
    draft.position.trackTrue = draft.position.headingTrue
    draft.position.groundSpeedKt = 0
    draft.position.onGround = true
    draft.position.initialized = true
    draft.flightPhase = rwy ? 'TAKEOFF' : 'TAXI'
    draft.guidance.lnav = 'ARMED'
    draft.guidance.vnav = 'ARMED'
    // Reset leg sequencing to the start of the route.
    plan.activeLegIndex = 1
    plan.progressed = false
    ctx.emit({ type: 'SIMULATION_EVENT', detail: `PHASE:${draft.flightPhase}` })
  }

  private reset(draft: Draft<FmsState>, ctx: Ctx): void {
    const sim = draft.simulation
    sim.status = 'IDLE'
    sim.elapsedSec = 0
    sim.fuelUsedKg = 0
    sim.distanceFlownNm = 0
    sim.hold = undefined
    sim.trueAirspeedKt = 0
    sim.indicatedAirspeedKt = 0
    sim.verticalSpeedFpm = 0
    sim.fuelKg = draft.performance.fuelKg ?? 0
    const { ap, rwy } = this.origin(draft, ctx)
    if (ap) {
      draft.position.aircraft = { lat: (rwy ?? ap).lat, lon: (rwy ?? ap).lon }
      draft.position.altitudeFt = ap.elevationFt
    }
    draft.position.groundSpeedKt = 0
    draft.position.onGround = true
    draft.flightPhase = 'PREFLIGHT'
    draft.guidance.lnav = draft.activeFlightPlan.activated ? 'ARMED' : 'OFF'
    draft.guidance.vnav = 'OFF'
    draft.activeFlightPlan.activeLegIndex = 1
    draft.activeFlightPlan.progressed = false
  }

  private goAround(draft: Draft<FmsState>): void {
    if (draft.flightPhase !== 'APPROACH') return
    const plan = draft.activeFlightPlan
    const first = plan.elements.findIndex((e) => isLeg(e) && e.missed)
    draft.flightPhase = 'GO_AROUND'
    draft.simulation.phaseTimerSec = 0
    if (first >= 0) {
      for (const e of plan.elements) if (isLeg(e) && e.missed) e.missed = false
      plan.activeLegIndex = first
      plan.progressed = true
    }
    draft.guidance.lnav = 'ACTIVE'
  }

  step(draft: Draft<FmsState>, dtSec: number, ctx: Ctx): void {
    const sim = draft.simulation
    if (sim.status !== 'RUNNING' || dtSec <= 0) return
    const total = Math.min(dtSec * sim.timeScale, 120)
    // Prediction profile from plain (non-draft) objects; recomputed once per tick.
    const profile = computeVnavProfile(current(draft.activeFlightPlan), current(draft.performance), ctx.adapter.performanceModel, ctx.nav)
    let remaining = total
    while (remaining > 0 && sim.status === 'RUNNING') {
      const dt = Math.min(SUBSTEP_SEC, remaining)
      this.integrate(draft, dt, ctx, profile)
      remaining -= dt
    }
    sim.simTimeMs = Math.round(sim.simTimeMs + total * 1000)
    sim.elapsedSec += total
  }

  private integrate(draft: Draft<FmsState>, dt: number, ctx: Ctx, profile: VnavProfile): void {
    const sim = draft.simulation
    const pos = draft.position
    const model = ctx.adapter.performanceModel
    const perf = draft.performance
    const plan = draft.activeFlightPlan
    const speeds = effectiveSpeeds(model, perf as FmsState['performance'])
    const gw = (grossWeightKg(perf as FmsState['performance']) ?? model.oewKg + 30000) - sim.fuelUsedKg
    const dest = plan.destination ? ctx.nav.searchAirport(plan.destination) : undefined
    const arrRwy = dest && plan.arrivalRunway ? dest.runways.find((r) => r.ident === plan.arrivalRunway) : undefined
    const destPoint: LatLon | undefined = arrRwy ?? dest
    const fieldElev = dest?.elevationFt ?? 0
    const originElev = (plan.origin ? ctx.nav.searchAirport(plan.origin)?.elevationFt : undefined) ?? 0
    const crz = perf.cruiseAltitudeFt ?? 30000
    const distDest = draft.guidance.distanceToDestinationNm || profile.totalDistanceNm
    const descentNeeded = ((pos.altitudeFt - fieldElev) / 1000) * model.descent3to1NmPer1000Ft + 10
    sim.phaseTimerSec += dt
    const prevPhase = draft.flightPhase

    let targetIas = speeds.climbKt
    let targetVs = 0
    let targetAlt = pos.altitudeFt
    let useMach = false

    switch (draft.flightPhase) {
      case 'TAXI': {
        targetIas = 15
        if (sim.phaseTimerSec >= TAXI_SEC) this.setPhase(draft, 'TAKEOFF', ctx)
        break
      }
      case 'TAKEOFF': {
        const vr = perf.takeoff.vr ?? Math.max(120, (perf.takeoff.v2 ?? 150) - 5)
        targetIas = (perf.takeoff.v2 ?? vr + 6) + 15
        if (pos.onGround) {
          targetVs = 0
          if (sim.indicatedAirspeedKt >= vr) {
            pos.onGround = false
            draft.guidance.lnav = 'ACTIVE'
            ctx.emit({ type: 'SIMULATION_EVENT', detail: 'ROTATE' })
          }
        } else {
          targetVs = 2500
          targetAlt = crz
          if (pos.altitudeFt > originElev + 1500) this.setPhase(draft, 'CLIMB', ctx)
        }
        break
      }
      case 'CLIMB': {
        draft.guidance.vnav = 'ACTIVE'
        const restriction = perf.climb.speedRestrictionKt ?? 250
        const restrictionAlt = perf.climb.speedRestrictionAltFt ?? 10000
        targetIas = pos.altitudeFt < restrictionAlt ? Math.min(restriction, speeds.climbKt) : speeds.climbKt
        const mach = tasToMach(iasToTas(targetIas, pos.altitudeFt), pos.altitudeFt)
        useMach = mach >= speeds.climbMach
        targetAlt = this.climbCeiling(plan, crz)
        targetVs = Math.min(climbRateFpm(model, pos.altitudeFt, gw), 4000)
        if (pos.altitudeFt >= crz - 50) this.setPhase(draft, 'CRUISE', ctx)
        else if (distDest <= descentNeeded) this.setPhase(draft, 'DESCENT', ctx)
        break
      }
      case 'CRUISE': {
        useMach = true
        targetAlt = perf.cruise.stepToFt && profile.stepClimb && this.flownDistance(draft, profile) >= profile.stepClimb.distanceNm ? perf.cruise.stepToFt : crz
        targetVs = targetAlt > pos.altitudeFt ? 1000 : -1000
        const tod = profile.topOfDescent?.distanceNm
        if ((tod !== undefined && this.flownDistance(draft, profile) >= tod) || distDest <= descentNeeded) this.setPhase(draft, 'DESCENT', ctx)
        break
      }
      case 'DESCENT': {
        const restriction = perf.descent.speedRestrictionKt ?? 250
        const restrictionAlt = perf.descent.speedRestrictionAltFt ?? 10000
        targetIas = pos.altitudeFt < restrictionAlt + 500 ? Math.min(restriction, speeds.descentKt) : speeds.descentKt
        useMach = tasToMach(iasToTas(targetIas, pos.altitudeFt), pos.altitudeFt) > speeds.descentMach
        // Follow the geometric path, but never plan a level-off above the 3:1 profile to the field.
        const path = Math.min(this.pathAltitude(draft, profile, fieldElev), fieldElev + ((distDest - 8) / model.descent3to1NmPer1000Ft) * 1000)
        targetAlt = Math.max(fieldElev + 1500, Math.min(pos.altitudeFt, path))
        const above = pos.altitudeFt - path
        targetVs = -Math.min(model.descentRateFpm * 1.6, Math.max(1000, model.descentRateFpm + Math.max(0, above) * 0.8))
        if (above > 1500) postMessage(draft, 'DRAG_REQUIRED', ctx.adapter.messages, ctx.nextId, ctx.now)
        if ((distDest < 18 && pos.altitudeFt < fieldElev + 8000) || pos.altitudeFt < fieldElev + 4000) {
          this.setPhase(draft, 'APPROACH', ctx)
        }
        break
      }
      case 'APPROACH': {
        const flaps = perf.approach.flaps ?? model.landing.flaps[model.landing.flaps.length - 1] ?? 30
        const vapp = perf.approach.vapp ?? perf.approach.vref ?? (vref(model, gw, flaps) ?? 140) + 5
        targetIas = distDest > 12 ? 210 : distDest > 6 ? 180 : vapp
        const glide = fieldElev + 50 + distDest * 318
        targetAlt = Math.max(fieldElev, Math.min(this.pathAltitude(draft, profile, fieldElev), glide))
        const above = pos.altitudeFt - targetAlt
        targetVs = -Math.min(2000, Math.max(300, Math.max(0, above) * 1.2 + (pos.groundSpeedKt * 5.3 * (above > -100 ? 1 : 0))))
        if (above < -50) targetVs = 0
        const thr = destPoint && pos.aircraft ? distanceNm(pos.aircraft, destPoint) : distDest
        if (thr < 1 && pos.altitudeFt > fieldElev + 700) {
          // Unstable approach: automatic go-around (missed approach).
          postMessage(draft, 'CHECK_ALT_TGT', ctx.adapter.messages, ctx.nextId, ctx.now, 'ALERT')
          this.goAround(draft)
          ctx.emit({ type: 'SIMULATION_EVENT', detail: 'PHASE:GO_AROUND' })
        } else if (thr < 0.6 && pos.altitudeFt < fieldElev + 120) this.touchdown(draft, ctx, fieldElev)
        break
      }
      case 'GO_AROUND': {
        targetIas = 210
        targetVs = 2000
        const missedAlt = plan.elements.find((e) => isLeg(e) && e.segment === 'MISSED' && e.altitudeConstraint)
        targetAlt = isLeg(missedAlt) ? (missedAlt.altitudeConstraint?.altitudeFt ?? fieldElev + 3000) : fieldElev + 3000
        break
      }
      case 'LANDED': {
        targetIas = 0
        if (sim.indicatedAirspeedKt < 1) {
          sim.status = 'COMPLETED'
          draft.guidance.lnav = 'OFF'
          draft.guidance.vnav = 'OFF'
          ctx.emit({ type: 'SIMULATION_EVENT', detail: 'COMPLETED' })
        }
        break
      }
      default:
        break
    }

    // ── Speed constraint at the active waypoint.
    const activeLeg = plan.elements[plan.activeLegIndex]
    if (isLeg(activeLeg) && activeLeg.speedConstraint && !pos.onGround) {
      targetIas = Math.min(targetIas, activeLeg.speedConstraint.speedKt)
    }

    // ── Speed dynamics.
    const accel = pos.onGround ? (draft.flightPhase === 'LANDED' ? -4 : 3) : 1.5
    let ias = sim.indicatedAirspeedKt
    if (useMach) {
      const mach = draft.flightPhase === 'CRUISE' ? speeds.cruiseMach : draft.flightPhase === 'CLIMB' ? speeds.climbMach : speeds.descentMach
      const tasTarget = machToTas(mach, pos.altitudeFt, perf.isaDevC ?? 0)
      const iasEq = targetIas * (tasTarget / Math.max(1, iasToTas(targetIas, pos.altitudeFt, perf.isaDevC ?? 0)))
      targetIas = iasEq
    }
    if (draft.flightPhase === 'LANDED') ias = Math.max(0, ias - 4 * dt)
    else ias += Math.max(-Math.abs(accel) * dt, Math.min(Math.abs(accel) * dt, targetIas - ias))
    sim.indicatedAirspeedKt = Math.max(0, ias)
    const tas = pos.onGround ? ias : iasToTas(ias, pos.altitudeFt, perf.isaDevC ?? 0)
    sim.trueAirspeedKt = tas
    sim.mach = tasToMach(tas, pos.altitudeFt, perf.isaDevC ?? 0)
    sim.targetSpeedKt = Math.round(targetIas)

    // ── Vertical.
    if (!pos.onGround) {
      let vs = targetVs
      if (Math.abs(targetAlt - pos.altitudeFt) < Math.abs(vs) * (dt / 60)) {
        vs = ((targetAlt - pos.altitudeFt) / dt) * 60
      } else if ((targetAlt - pos.altitudeFt) * vs < 0) {
        vs = Math.sign(targetAlt - pos.altitudeFt) * Math.abs(vs)
      }
      sim.verticalSpeedFpm = Math.round(vs)
      pos.altitudeFt = Math.max(fieldElev, pos.altitudeFt + (vs * dt) / 60)
    } else sim.verticalSpeedFpm = 0
    sim.targetAltitudeFt = Math.round(targetAlt)

    // ── Lateral.
    const here = pos.aircraft
    if (!here) return
    let desiredHeading = pos.headingTrue
    if (!pos.onGround && draft.guidance.lnav === 'ACTIVE') {
      desiredHeading = this.lateralCommand(draft, ctx, dt) ?? desiredHeading
    }
    const maxTurn = 3 * dt
    pos.headingTrue = normalizeHeading(pos.headingTrue + Math.max(-maxTurn, Math.min(maxTurn, headingDiff(pos.headingTrue, desiredHeading))))
    // Wind triangle (wind FROM windDir).
    const windTo = normalizeHeading(sim.windDir + 180)
    const ve = tas * Math.sin((pos.headingTrue * Math.PI) / 180) + (pos.onGround ? 0 : sim.windKt * Math.sin((windTo * Math.PI) / 180))
    const vn = tas * Math.cos((pos.headingTrue * Math.PI) / 180) + (pos.onGround ? 0 : sim.windKt * Math.cos((windTo * Math.PI) / 180))
    const gs = Math.sqrt(ve * ve + vn * vn)
    pos.groundSpeedKt = Math.round(gs)
    pos.trackTrue = gs > 1 ? normalizeHeading((Math.atan2(ve, vn) * 180) / Math.PI) : pos.headingTrue
    const d = (gs * dt) / 3600
    pos.aircraft = destinationPoint(here, pos.trackTrue, d)
    sim.distanceFlownNm += d

    // ── Fuel.
    const factor =
      draft.flightPhase === 'CLIMB' || draft.flightPhase === 'TAKEOFF' || draft.flightPhase === 'GO_AROUND'
        ? model.fuelFlow.climbFactor
        : draft.flightPhase === 'DESCENT'
          ? model.fuelFlow.descentFactor
          : draft.flightPhase === 'TAXI' || draft.flightPhase === 'LANDED'
            ? 0.12
            : draft.flightPhase === 'APPROACH'
              ? 0.55
              : 1
    const burn = (cruiseFuelFlowKgH(model, gw, Math.max(10000, pos.altitudeFt)) * factor * dt) / 3600
    sim.fuelKg = Math.max(0, sim.fuelKg - burn)
    sim.fuelUsedKg += burn
    if (sim.fuelKg <= 0) {
      sim.status = 'COMPLETED'
      postMessage(draft, 'INSUFFICIENT_FUEL', ctx.adapter.messages, ctx.nextId, ctx.now, 'ALERT')
    }

    // ── Guidance / sequencing.
    if (!pos.onGround || draft.guidance.lnav === 'ACTIVE') {
      const r = updateGuidanceAndSequence(draft)
      if (r === 'DISCONTINUITY') postMessage(draft, 'ROUTE_DISCONTINUITY', ctx.adapter.messages, ctx.nextId, ctx.now, 'ALERT')
      if (r === 'END_OF_ROUTE' && draft.flightPhase !== 'APPROACH' && draft.flightPhase !== 'LANDED') {
        postMessage(draft, 'END_OF_ROUTE', ctx.adapter.messages, ctx.nextId, ctx.now, 'ALERT')
      }
    }
    if (prevPhase !== draft.flightPhase) sim.phaseTimerSec = 0
  }

  /** Lowest AT/AT_OR_BELOW constraint ahead in the departure/climb portion caps the climb. */
  private climbCeiling(plan: Draft<FlightPlan>, crz: number): number {
    for (let i = plan.activeLegIndex; i < plan.elements.length; i++) {
      const e = plan.elements[i]
      if (!isLeg(e)) break
      if (e.segment !== 'DEPARTURE') break
      const c = e.altitudeConstraint
      if (c && (c.type === 'AT_OR_BELOW' || c.type === 'AT')) return Math.min(crz, c.altitudeFt)
      if (c && c.type === 'BETWEEN') return Math.min(crz, c.altitudeFt)
    }
    return crz
  }

  private flownDistance(draft: Draft<FmsState>, profile: VnavProfile): number {
    return Math.max(0, profile.totalDistanceNm - draft.guidance.distanceToDestinationNm)
  }

  /** Geometric descent path altitude at the aircraft's along-track position. */
  private pathAltitude(draft: Draft<FmsState>, profile: VnavProfile, fieldElev: number): number {
    const flown = this.flownDistance(draft, profile)
    const plan = draft.activeFlightPlan
    let prevD = 0
    let prevAlt = profile.cruiseAltitudeFt ?? draft.position.altitudeFt
    for (const p of profile.legs) {
      const leg = plan.elements.find((e) => e.id === p.legId) as FlightPlanLeg | undefined
      const d = leg?.cumulativeDistance ?? 0
      if (d >= flown) {
        const f = d - prevD > 0 ? (flown - prevD) / (d - prevD) : 1
        return Math.max(fieldElev, prevAlt + (p.altitudeFt - prevAlt) * Math.max(0, Math.min(1, f)))
      }
      prevD = d
      prevAlt = p.altitudeFt
    }
    return fieldElev
  }

  private lateralCommand(draft: Draft<FmsState>, ctx: Ctx, dt: number): number | undefined {
    const pos = draft.position
    const here = pos.aircraft
    if (!here) return undefined
    const plan = draft.activeFlightPlan
    const active = plan.elements[plan.activeLegIndex]
    if (!isLeg(active)) return undefined
    // Holding pattern.
    if (active.hold && (draft.simulation.hold || distanceNm(here, active.waypoint) < 1)) {
      return this.flyHold(draft, active, dt, ctx)
    }
    const g = computeLnavGuidance(plan as FlightPlan, here, Math.max(120, pos.groundSpeedKt))
    if (draft.navigation.offsetNm && g.fromLeg) {
      g.crossTrackNm -= draft.navigation.offsetNm
    }
    if (active.legType === 'VA' || active.legType === 'CA') {
      return magToTrue(active.courseMag ?? 0, active.waypoint.magVar)
    }
    return interceptHeading(g, here)
  }

  private flyHold(draft: Draft<FmsState>, leg: Draft<FlightPlanLeg>, dt: number, ctx: Ctx): number {
    const sim = draft.simulation
    const h = leg.hold
    if (!h) return draft.position.headingTrue
    const inbound = magToTrue(h.inboundCourse, leg.waypoint.magVar)
    const outbound = normalizeHeading(inbound + 180)
    const legSec = h.legDistanceNm ? (h.legDistanceNm / Math.max(120, draft.position.groundSpeedKt)) * 3600 : (h.legTimeMin ?? 1) * 60
    if (!sim.hold || sim.hold.legId !== leg.id) {
      sim.hold = { legId: leg.id, phase: 'OUTBOUND_TURN', timerSec: 0 }
      ctx.emit({ type: 'SIMULATION_EVENT', detail: `HOLD_ENTRY:${leg.waypoint.ident}` })
    }
    const st = sim.hold
    st.timerSec += dt
    const turnSign = h.turn === 'R' ? 1 : -1
    switch (st.phase) {
      case 'OUTBOUND_TURN':
        if (Math.abs(headingDiff(draft.position.headingTrue, outbound)) < 5) {
          st.phase = 'OUTBOUND'
          st.timerSec = 0
        }
        return normalizeHeading(draft.position.headingTrue + turnSign * 30)
      case 'OUTBOUND':
        if (st.timerSec >= legSec) {
          st.phase = 'INBOUND_TURN'
          st.timerSec = 0
        }
        return outbound
      case 'INBOUND_TURN':
        if (Math.abs(headingDiff(draft.position.headingTrue, inbound)) < 10) {
          st.phase = 'INBOUND'
          st.timerSec = 0
        }
        return normalizeHeading(draft.position.headingTrue + turnSign * 30)
      case 'INBOUND':
      case 'ENTRY': {
        const here = draft.position.aircraft
        const toFix = here ? bearingDeg(here, leg.waypoint) : inbound
        if (here && distanceNm(here, leg.waypoint) < 0.6) {
          if (h.exitArmed) {
            // Exit: remove the hold and let LNAV sequence the next leg.
            leg.hold = undefined
            sim.hold = undefined
            ctx.emit({ type: 'SIMULATION_EVENT', detail: `HOLD_EXIT:${leg.waypoint.ident}` })
            return toFix
          }
          st.phase = 'OUTBOUND_TURN'
          st.timerSec = 0
        }
        return toFix
      }
    }
  }

  private touchdown(draft: Draft<FmsState>, ctx: Ctx, fieldElev: number): void {
    draft.position.onGround = true
    draft.position.altitudeFt = fieldElev
    this.setPhase(draft, 'LANDED', ctx)
  }

  private setPhase(draft: Draft<FmsState>, phase: FmsState['flightPhase'], ctx: Ctx): void {
    if (draft.flightPhase === phase) return
    draft.flightPhase = phase
    draft.simulation.phaseTimerSec = 0
    ctx.emit({ type: 'SIMULATION_EVENT', detail: `PHASE:${phase}` })
  }
}
