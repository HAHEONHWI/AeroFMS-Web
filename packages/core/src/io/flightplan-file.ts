import type { FlightPlan } from '@aerofms/shared'
import type { NavigationProvider } from '@aerofms/navigation'
import type { FmsCommand } from '../events/types'
import type { FmsState } from '../state/types'

/** AeroFMS flight plan exchange format (.areofms.json). */
export interface AeroFmsFlightPlanFile {
  format: 'aerofms-flightplan'
  version: 1
  app: 'AeroFMS'
  exportedAt: string
  aircraftId?: string
  navDbCycle?: string
  plan: FlightPlan
  performance?: {
    cruiseAltitudeFt?: number
    costIndex?: number
    zfwKg?: number
    fuelKg?: number
    reserveFuelKg?: number
  }
  scenario?: { id: string; title: string }
}

export const FLIGHTPLAN_FILE_EXTENSION = '.areofms.json'

export function exportFlightPlanFile(state: FmsState, scenario?: { id: string; title: string }, now = Date.now()): AeroFmsFlightPlanFile {
  const p = state.performance
  return {
    format: 'aerofms-flightplan',
    version: 1,
    app: 'AeroFMS',
    exportedAt: new Date(now).toISOString(),
    aircraftId: state.aircraft.aircraftId,
    navDbCycle: state.navigation.navDbCycle,
    plan: state.activeFlightPlan,
    performance: {
      cruiseAltitudeFt: p.cruiseAltitudeFt,
      costIndex: p.costIndex,
      zfwKg: p.zfwKg,
      fuelKg: p.fuelKg,
      reserveFuelKg: p.reserveFuelKg,
    },
    scenario,
  }
}

export type ImportErrorCode = 'INVALID_JSON' | 'UNSUPPORTED_FORMAT' | 'INVALID_PLAN' | 'UNKNOWN_AIRPORT' | 'EMPTY'

export type ImportResult =
  | { ok: true; commands: FmsCommand[]; source: string; warnings: string[] }
  | { ok: false; error: ImportErrorCode; detail?: string }

/** Import adapters convert external formats into FMS commands (validated by the engine). */
export interface FlightPlanImportAdapter {
  readonly id: string
  readonly label: string
  canImport(text: string): boolean
  import(text: string, nav: NavigationProvider): ImportResult
}

function isValidPlan(p: unknown): p is FlightPlan {
  if (typeof p !== 'object' || p === null) return false
  const plan = p as FlightPlan
  if (!Array.isArray(plan.elements) || typeof plan.activeLegIndex !== 'number') return false
  return plan.elements.every(
    (e) =>
      typeof e === 'object' &&
      e !== null &&
      typeof e.id === 'string' &&
      (e.kind === 'DISCONTINUITY' ||
        (e.kind === 'LEG' &&
          typeof e.waypoint?.ident === 'string' &&
          Number.isFinite(e.waypoint.lat) &&
          Number.isFinite(e.waypoint.lon) &&
          Math.abs(e.waypoint.lat) <= 90 &&
          Math.abs(e.waypoint.lon) <= 180)),
  )
}

export class AeroFmsJsonImportAdapter implements FlightPlanImportAdapter {
  readonly id = 'aerofms-json'
  readonly label = 'AeroFMS (.areofms.json)'

  canImport(text: string): boolean {
    return text.trimStart().startsWith('{') && text.includes('aerofms-flightplan')
  }

  import(text: string, nav: NavigationProvider): ImportResult {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return { ok: false, error: 'INVALID_JSON' }
    }
    const f = data as Partial<AeroFmsFlightPlanFile>
    if (f.format !== 'aerofms-flightplan' || f.version !== 1) return { ok: false, error: 'UNSUPPORTED_FORMAT' }
    if (!isValidPlan(f.plan)) return { ok: false, error: 'INVALID_PLAN' }
    const warnings: string[] = []
    for (const icao of [f.plan.origin, f.plan.destination]) {
      if (icao && !nav.searchAirport(icao)) return { ok: false, error: 'UNKNOWN_AIRPORT', detail: icao }
    }
    if (f.navDbCycle && f.navDbCycle !== nav.meta.cycle) warnings.push(`NAV_DB_CYCLE:${f.navDbCycle}`)
    const commands: FmsCommand[] = [{ kind: 'LOAD_FLIGHT_PLAN', plan: { ...f.plan, activated: false } }]
    const perf = f.performance
    if (perf?.cruiseAltitudeFt) commands.push({ kind: 'SET_CRUISE_ALTITUDE', value: String(perf.cruiseAltitudeFt) })
    if (perf?.costIndex !== undefined) commands.push({ kind: 'SET_COST_INDEX', value: String(perf.costIndex) })
    return { ok: true, commands, source: this.id, warnings }
  }
}

/**
 * ICAO-style route string: "RKSI BULTI1J BULTI Y711 OSN Y722 KALOD KALOD1A RKPK".
 * Also the format exported by most dispatch tools, so it is the integration point for
 * services such as SimBrief (fetch the route string, then import it here).
 */
export class RouteStringImportAdapter implements FlightPlanImportAdapter {
  readonly id = 'route-string'
  readonly label = 'ICAO route string'

  canImport(text: string): boolean {
    return /^[A-Z]{4}(\s+[A-Z0-9/.]+)+\s*$/.test(text.trim().toUpperCase())
  }

  import(text: string, nav: NavigationProvider): ImportResult {
    const tokens = text.trim().toUpperCase().split(/\s+/).filter((t) => t && t !== 'DCT')
    if (tokens.length < 2) return { ok: false, error: 'EMPTY' }
    const origin = tokens[0] ?? ''
    const dest = tokens[tokens.length - 1] ?? ''
    if (!nav.searchAirport(origin)) return { ok: false, error: 'UNKNOWN_AIRPORT', detail: origin }
    if (!nav.searchAirport(dest)) return { ok: false, error: 'UNKNOWN_AIRPORT', detail: dest }
    const commands: FmsCommand[] = [
      { kind: 'SET_ORIGIN', icao: origin },
      { kind: 'SET_DESTINATION', icao: dest },
    ]
    const warnings: string[] = []
    const middle = tokens.slice(1, -1)
    const sids = nav.getDepartures(origin)
    const stars = nav.getArrivals(dest)
    let pendingAirway: string | undefined
    let starCmd: FmsCommand | undefined
    middle.forEach((tok, i) => {
      const sid = i === 0 ? sids.find((p) => p.name === tok.split('.')[0]) : undefined
      if (sid) {
        if (sid.runways[0]) commands.push({ kind: 'SET_DEPARTURE_RUNWAY', runway: sid.runways[0] })
        commands.push({ kind: 'SET_SID', procedureId: sid.id })
        return
      }
      const star = i === middle.length - 1 ? stars.find((p) => p.name === tok.split('.')[0]) : undefined
      if (star) {
        starCmd = { kind: 'SET_STAR', procedureId: star.id }
        return
      }
      if (nav.getAirway(tok)) {
        pendingAirway = tok
        return
      }
      if (nav.findWaypoint(tok) || /^[NS]\d/.test(tok)) {
        commands.push({ kind: 'APPEND_ROUTE', via: pendingAirway ?? 'DIRECT', to: tok })
        pendingAirway = undefined
        return
      }
      warnings.push(`UNKNOWN_TOKEN:${tok}`)
    })
    if (starCmd) commands.push(starCmd)
    return { ok: true, commands, source: this.id, warnings }
  }
}

export const DEFAULT_IMPORT_ADAPTERS: FlightPlanImportAdapter[] = [new AeroFmsJsonImportAdapter(), new RouteStringImportAdapter()]

export function importFlightPlan(text: string, nav: NavigationProvider, adapters = DEFAULT_IMPORT_ADAPTERS): ImportResult {
  const adapter = adapters.find((a) => a.canImport(text))
  if (!adapter) return { ok: false, error: 'UNSUPPORTED_FORMAT' }
  return adapter.import(text, nav)
}
