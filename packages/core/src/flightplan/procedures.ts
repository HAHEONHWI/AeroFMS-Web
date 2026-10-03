import { destinationPoint } from '@aerofms/shared'
import type { Airport, FlightPlanLeg, FlightPlanSegment, LatLon, Procedure, ProcedureLeg, Runway, Waypoint } from '@aerofms/shared'
import type { NavigationProvider } from '@aerofms/navigation'
import { FmsEntryError } from '../messages/codes'
import { makeLeg, runwayWaypoint } from './factory'
import type { IdFactory } from './factory'
import { magToTrue } from './geometry'

const FT_PER_NM = 6076.12
/** Planning climb gradient for heading-to-altitude legs (ft per NM). */
const VA_CLIMB_FT_PER_NM = 350

export interface ProcedureBuildContext {
  nav: NavigationProvider
  airport: Airport
  runway?: Runway
  ids: IdFactory
}

/** Ordered procedure legs for the selected transition (SID: common→transition; STAR/APP: transition→common). */
export function procedureLegSequence(proc: Procedure, transition?: string): ProcedureLeg[] {
  const trans = transition ? proc.transitions.find((t) => t.name === transition) : undefined
  if (transition && !trans) throw new FmsEntryError('NOT_IN_DATABASE', transition)
  const tLegs = trans?.legs ?? []
  const seq = proc.type === 'SID' ? [...proc.commonLegs, ...tLegs] : [...tLegs, ...proc.commonLegs]
  // Remove consecutive duplicate fixes (transition end == common start), keeping the later constraints.
  const out: ProcedureLeg[] = []
  for (const leg of seq) {
    const last = out[out.length - 1]
    if (last && leg.fix && last.fix === leg.fix && leg.pathTerminator !== 'HM') {
      out[out.length - 1] = { ...last, ...leg, altitude: leg.altitude ?? last.altitude, speed: leg.speed ?? last.speed }
      continue
    }
    out.push(leg)
  }
  return out
}

function resolveFix(ctx: ProcedureBuildContext, ident: string, near: LatLon): Waypoint {
  if (/^RW\d{2}[LRC]?$/.test(ident)) {
    const rw = ctx.airport.runways.find((r) => `RW${r.ident}` === ident)
    if (!rw) throw new FmsEntryError('NOT_IN_DATABASE', ident)
    return runwayWaypoint(ctx.airport, rw)
  }
  const wp = ctx.nav.findWaypoint(ident, near)
  if (!wp) throw new FmsEntryError('NOT_IN_DATABASE', ident)
  return wp
}

/**
 * Converts procedure legs into flight-plan legs. Altitude-terminated legs (VA/CA) become
 * pseudo waypoints such as "(1600)" positioned with a planning climb gradient.
 */
export function buildProcedureLegs(
  proc: Procedure,
  transition: string | undefined,
  segment: FlightPlanSegment,
  ctx: ProcedureBuildContext,
  startPoint?: LatLon,
): FlightPlanLeg[] {
  const legs: FlightPlanLeg[] = []
  let cursor: LatLon =
    startPoint ??
    (ctx.runway && segment === 'DEPARTURE'
      ? destinationPoint(ctx.runway, ctx.runway.headingTrue, ctx.runway.lengthFt / FT_PER_NM)
      : ctx.airport)
  let altitudeFt = ctx.runway?.elevationFt ?? ctx.airport.elevationFt
  for (const pl of procedureLegSequence(proc, transition)) {
    legs.push(...convertLeg(pl, proc, segment, ctx, cursor, altitudeFt))
    const last = legs[legs.length - 1]
    if (last) {
      cursor = last.waypoint
      if (pl.altitude) altitudeFt = pl.altitude.altitudeFt
    }
  }
  if (proc.type === 'APPROACH' && proc.missedApproachLegs) {
    let missedAlt = ctx.runway?.elevationFt ?? ctx.airport.elevationFt
    for (const pl of proc.missedApproachLegs) {
      const converted = convertLeg(pl, proc, 'MISSED', ctx, cursor, missedAlt)
      for (const c of converted) c.missed = true
      // HM at the same fix as the previous leg attaches the hold to that leg.
      if (pl.pathTerminator === 'HM' && pl.hold) {
        const prev = legs[legs.length - 1]
        if (prev && prev.waypoint.ident === pl.fix) {
          prev.hold = {
            inboundCourse: pl.hold.inboundCourseMag,
            turn: pl.hold.turn,
            legTimeMin: pl.hold.legTimeMin,
            altitudeFt: pl.altitude?.altitudeFt,
            exitArmed: false,
            source: 'PROCEDURE',
          }
          continue
        }
      }
      legs.push(...converted)
      const last = legs[legs.length - 1]
      if (last) cursor = last.waypoint
      if (pl.altitude) missedAlt = pl.altitude.altitudeFt
    }
  }
  return legs
}

function convertLeg(
  pl: ProcedureLeg,
  proc: Procedure,
  segment: FlightPlanSegment,
  ctx: ProcedureBuildContext,
  cursor: LatLon,
  currentAltitudeFt: number,
): FlightPlanLeg[] {
  const base = {
    legType: pl.pathTerminator,
    via: proc.name,
    altitudeConstraint: pl.altitude,
    speedConstraint: pl.speed,
    constraintSource: pl.altitude || pl.speed ? ('PROCEDURE' as const) : undefined,
    overfly: pl.overfly,
    courseMag: pl.courseMag,
  }
  if (pl.pathTerminator === 'VA' || pl.pathTerminator === 'CA') {
    const target = pl.altitude?.altitudeFt ?? currentAltitudeFt + 1000
    const climbNm = Math.max(1, (target - currentAltitudeFt) / VA_CLIMB_FT_PER_NM)
    const course = magToTrue(pl.courseMag ?? 0, ctx.airport.magVar)
    const p = destinationPoint(cursor, course, climbNm)
    const wp: Waypoint = {
      ident: `(${Math.round(target)})`,
      lat: p.lat,
      lon: p.lon,
      type: 'PBD',
      magVar: ctx.airport.magVar,
    }
    return [makeLeg(ctx.ids, wp, segment, base)]
  }
  if (!pl.fix) return []
  const wp = resolveFix(ctx, pl.fix, cursor)
  if (pl.pathTerminator === 'HM' && pl.hold) {
    return [
      makeLeg(ctx.ids, wp, segment, {
        ...base,
        hold: {
          inboundCourse: pl.hold.inboundCourseMag,
          turn: pl.hold.turn,
          legTimeMin: pl.hold.legTimeMin,
          altitudeFt: pl.altitude?.altitudeFt,
          exitArmed: false,
          source: 'PROCEDURE',
        },
      }),
    ]
  }
  return [makeLeg(ctx.ids, wp, segment, base)]
}

/** Runways a procedure applies to (empty list in the database = all runways). */
export function procedureRunways(proc: Procedure, airport: Airport): string[] {
  return proc.runways.length ? proc.runways : airport.runways.map((r) => r.ident)
}
