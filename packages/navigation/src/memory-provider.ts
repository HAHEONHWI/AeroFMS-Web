import { distanceNm, editDistance } from '@aerofms/shared'
import type { Airport, Airway, LatLon, Navaid, NavDatabaseMeta, Procedure, Runway, Waypoint } from '@aerofms/shared'
import type {
  NavDataset,
  NavigationProvider,
  NavSearchKind,
  NavSearchOptions,
  NavSearchResult,
} from './provider'

const airportToWaypoint = (a: Airport): Waypoint => ({
  ident: a.icao,
  lat: a.lat,
  lon: a.lon,
  type: 'AIRPORT',
  name: a.name,
  magVar: a.magVar,
})

/** Indexed, immutable in-memory navigation database. */
export class InMemoryNavigationProvider implements NavigationProvider {
  readonly meta: NavDatabaseMeta
  private readonly airports = new Map<string, Airport>()
  private readonly iata = new Map<string, Airport>()
  private readonly waypointsByIdent = new Map<string, Waypoint[]>()
  private readonly navaidsByIdent = new Map<string, Navaid[]>()
  private readonly airways = new Map<string, Airway>()
  private readonly airwaysByFix = new Map<string, Set<string>>()
  private readonly procedures = new Map<string, Procedure>()
  private readonly proceduresByAirport = new Map<string, Procedure[]>()
  private readonly sortedIdents: string[]

  constructor(dataset: NavDataset) {
    this.meta = dataset.meta
    for (const a of dataset.airports) {
      this.airports.set(a.icao, a)
      if (a.iata) this.iata.set(a.iata, a)
    }
    const pushWp = (w: Waypoint): void => {
      const list = this.waypointsByIdent.get(w.ident)
      if (list) list.push(w)
      else this.waypointsByIdent.set(w.ident, [w])
    }
    for (const w of dataset.waypoints) pushWp(w)
    for (const n of dataset.navaids) {
      pushWp(n)
      const list = this.navaidsByIdent.get(n.ident)
      if (list) list.push(n)
      else this.navaidsByIdent.set(n.ident, [n])
    }
    for (const aw of dataset.airways) {
      this.airways.set(aw.name, aw)
      for (const f of aw.fixes) {
        const set = this.airwaysByFix.get(f.ident) ?? new Set<string>()
        set.add(aw.name)
        this.airwaysByFix.set(f.ident, set)
      }
    }
    for (const p of dataset.procedures) {
      this.procedures.set(p.id, p)
      const list = this.proceduresByAirport.get(p.airport) ?? []
      list.push(p)
      this.proceduresByAirport.set(p.airport, list)
    }
    this.sortedIdents = [
      ...new Set([...this.airports.keys(), ...this.waypointsByIdent.keys(), ...this.airways.keys()]),
    ].sort()
  }

  searchAirport(icao: string): Airport | undefined {
    const key = icao.trim().toUpperCase()
    return this.airports.get(key) ?? (key.length === 3 ? this.iata.get(key) : undefined)
  }

  getRunway(icao: string, runway: string): Runway | undefined {
    const id = runway.toUpperCase().replace(/^RW/, '')
    return this.searchAirport(icao)?.runways.find((r) => r.ident === id)
  }

  searchWaypoint(ident: string): Waypoint[] {
    const key = ident.trim().toUpperCase()
    const result = [...(this.waypointsByIdent.get(key) ?? [])]
    const ap = this.airports.get(key)
    if (ap) result.push(airportToWaypoint(ap))
    return result
  }

  findWaypoint(ident: string, near?: LatLon): Waypoint | undefined {
    const matches = this.searchWaypoint(ident)
    if (matches.length <= 1 || !near) return matches[0]
    return [...matches].sort((a, b) => distanceNm(near, a) - distanceNm(near, b))[0]
  }

  getNavaid(ident: string, near?: LatLon): Navaid | undefined {
    const list = this.navaidsByIdent.get(ident.trim().toUpperCase()) ?? []
    if (list.length <= 1 || !near) return list[0]
    return [...list].sort((a, b) => distanceNm(near, a) - distanceNm(near, b))[0]
  }

  getAirway(name: string): Airway | undefined {
    return this.airways.get(name.trim().toUpperCase())
  }

  airwaysThrough(ident: string): string[] {
    return [...(this.airwaysByFix.get(ident.toUpperCase()) ?? [])].sort()
  }

  private proceduresOf(icao: string, type: Procedure['type']): Procedure[] {
    return (this.proceduresByAirport.get(icao.toUpperCase()) ?? [])
      .filter((p) => p.type === type)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  getDepartures(icao: string): Procedure[] {
    return this.proceduresOf(icao, 'SID')
  }

  getArrivals(icao: string): Procedure[] {
    return this.proceduresOf(icao, 'STAR')
  }

  getApproaches(icao: string): Procedure[] {
    return this.proceduresOf(icao, 'APPROACH')
  }

  getProcedure(id: string): Procedure | undefined {
    return this.procedures.get(id)
  }

  allAirports(): Airport[] {
    return [...this.airports.values()]
  }

  allAirways(): Airway[] {
    return [...this.airways.values()]
  }

  search(query: string, options: NavSearchOptions = {}): NavSearchResult[] {
    const q = query.trim().toUpperCase()
    if (!q) return []
    const kinds = new Set<NavSearchKind>(options.kinds ?? ['AIRPORT', 'WAYPOINT', 'NAVAID', 'AIRWAY'])
    const limit = options.limit ?? 20
    const results: NavSearchResult[] = []
    const seen = new Set<string>()
    const add = (r: NavSearchResult): void => {
      const key = `${r.kind}:${r.ident}:${r.lat?.toFixed(3)}:${r.lon?.toFixed(3)}`
      if (seen.has(key)) return
      seen.add(key)
      results.push(r)
    }
    const nearPenalty = (p: LatLon): number => (options.near ? Math.min(0.9, distanceNm(options.near, p) / 5000) : 0)

    // Identifier prefix matches via binary search over the sorted identifier index.
    let lo = 0
    let hi = this.sortedIdents.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((this.sortedIdents[mid] ?? '') < q) lo = mid + 1
      else hi = mid
    }
    for (let i = lo; i < this.sortedIdents.length; i++) {
      const ident = this.sortedIdents[i] ?? ''
      if (!ident.startsWith(q)) break
      const base = ident === q ? 0 : 1 + (ident.length - q.length) * 0.1
      const ap = this.airports.get(ident)
      if (ap && kinds.has('AIRPORT')) {
        add({ kind: 'AIRPORT', ident, name: ap.name, lat: ap.lat, lon: ap.lon, type: 'AIRPORT', score: base + nearPenalty(ap) })
      }
      for (const w of this.waypointsByIdent.get(ident) ?? []) {
        const isNavaid = w.type === 'VOR' || w.type === 'VORDME' || w.type === 'NDB' || w.type === 'DME'
        const kind: NavSearchKind = isNavaid ? 'NAVAID' : 'WAYPOINT'
        if (kinds.has(kind)) {
          add({ kind, ident, name: w.name, lat: w.lat, lon: w.lon, type: w.type, score: base + 0.05 + nearPenalty(w) })
        }
      }
      if (this.airways.has(ident) && kinds.has('AIRWAY')) {
        add({ kind: 'AIRWAY', ident, score: base + 0.1 })
      }
    }

    // Name / IATA / city matches for airports.
    if (kinds.has('AIRPORT') && q.length >= 2) {
      for (const ap of this.airports.values()) {
        const hay = `${ap.name} ${ap.nameKo ?? ''} ${ap.city ?? ''} ${ap.iata ?? ''}`.toUpperCase()
        if (ap.iata === q) {
          add({ kind: 'AIRPORT', ident: ap.icao, name: ap.name, lat: ap.lat, lon: ap.lon, type: 'AIRPORT', score: 0.5 })
        } else if (hay.includes(q)) {
          add({ kind: 'AIRPORT', ident: ap.icao, name: ap.name, lat: ap.lat, lon: ap.lon, type: 'AIRPORT', score: 3 })
        }
      }
    }
    return results.sort((a, b) => a.score - b.score || a.ident.localeCompare(b.ident)).slice(0, limit)
  }

  /** Closest identifiers by edit distance; used by the Mistake Analyzer for "did you mean". */
  suggest(ident: string, max = 3): string[] {
    const q = ident.toUpperCase()
    return this.sortedIdents
      .filter((s) => Math.abs(s.length - q.length) <= 1)
      .map((s) => ({ s, d: editDistance(q, s) }))
      .filter((x) => x.d <= 2)
      .sort((a, b) => a.d - b.d || a.s.localeCompare(b.s))
      .slice(0, max)
      .map((x) => x.s)
  }

  nearby(center: LatLon, radiusNm: number, kinds: NavSearchKind[] = ['AIRPORT', 'WAYPOINT', 'NAVAID']): Waypoint[] {
    const out: Waypoint[] = []
    if (kinds.includes('AIRPORT')) {
      for (const a of this.airports.values()) if (distanceNm(center, a) <= radiusNm) out.push(airportToWaypoint(a))
    }
    for (const list of this.waypointsByIdent.values()) {
      for (const w of list) {
        const isNavaid = w.type === 'VOR' || w.type === 'VORDME' || w.type === 'NDB' || w.type === 'DME'
        if (!kinds.includes(isNavaid ? 'NAVAID' : 'WAYPOINT')) continue
        if (distanceNm(center, w) <= radiusNm) out.push(w)
      }
    }
    return out
  }
}
