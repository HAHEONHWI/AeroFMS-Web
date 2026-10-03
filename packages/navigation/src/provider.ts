import type {
  Airport,
  Airway,
  LatLon,
  NavDatabaseMeta,
  Navaid,
  Procedure,
  Runway,
  Waypoint,
  WaypointType,
} from '@aerofms/shared'

export interface NavDataset {
  meta: NavDatabaseMeta
  airports: Airport[]
  waypoints: Waypoint[]
  navaids: Navaid[]
  airways: Airway[]
  procedures: Procedure[]
}

export type NavSearchKind = 'AIRPORT' | 'WAYPOINT' | 'NAVAID' | 'AIRWAY'

export interface NavSearchResult {
  kind: NavSearchKind
  ident: string
  name?: string
  lat?: number
  lon?: number
  type?: WaypointType
  /** Ranking score, lower is better. */
  score: number
}

export interface NavSearchOptions {
  kinds?: NavSearchKind[]
  limit?: number
  near?: LatLon
}

/**
 * Synchronous navigation lookup used by the FMS engine. The persistent store is SQLite;
 * at startup the dataset is loaded into an indexed in-memory provider so that every key
 * press can be validated instantly without I/O.
 */
export interface NavigationProvider {
  readonly meta: NavDatabaseMeta
  searchAirport(icao: string): Airport | undefined
  getRunway(icao: string, runway: string): Runway | undefined
  /** All fixes/navaids/airports matching the identifier. */
  searchWaypoint(ident: string): Waypoint[]
  /** Best match for an identifier, closest to `near` when several exist. */
  findWaypoint(ident: string, near?: LatLon): Waypoint | undefined
  getNavaid(ident: string, near?: LatLon): Navaid | undefined
  getAirway(name: string): Airway | undefined
  airwaysThrough(ident: string): string[]
  getDepartures(icao: string): Procedure[]
  getArrivals(icao: string): Procedure[]
  getApproaches(icao: string): Procedure[]
  getProcedure(id: string): Procedure | undefined
  search(query: string, options?: NavSearchOptions): NavSearchResult[]
  nearby(center: LatLon, radiusNm: number, kinds?: NavSearchKind[]): Waypoint[]
  allAirports(): Airport[]
  allAirways(): Airway[]
}

/** Asynchronous provider contract for future licensed data providers (remote or large local DBs). */
export interface AsyncNavigationDataSource {
  readonly id: string
  readonly displayName: string
  loadMeta(): Promise<NavDatabaseMeta | null>
  loadDataset(): Promise<NavDataset>
}
