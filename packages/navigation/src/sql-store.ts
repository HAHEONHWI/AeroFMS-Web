import type { Airport, Airway, NavDatabaseMeta, Navaid, Procedure, SqlDriver, Waypoint } from '@aerofms/shared'
import type { NavDataset } from './provider'

/**
 * SQLite storage for the navigation database. Tables follow the documented schema
 * (airports, runways, waypoints, navaids, airways, airway_legs, procedures, procedure_legs).
 * Created by core persistence migrations (see NAV_DB_SCHEMA_SQL).
 */
export const NAV_DB_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nav_meta (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cycle TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT NOT NULL,
  source TEXT NOT NULL,
  is_demo INTEGER NOT NULL,
  imported_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS airports (
  icao TEXT PRIMARY KEY,
  iata TEXT,
  name TEXT NOT NULL,
  name_ko TEXT,
  city TEXT,
  country TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  elevation_ft REAL NOT NULL,
  mag_var REAL NOT NULL,
  transition_altitude_ft REAL NOT NULL,
  transition_level_ft REAL,
  speed_limit_kt REAL,
  speed_limit_altitude_ft REAL
);
CREATE INDEX IF NOT EXISTS idx_airports_iata ON airports(iata);
CREATE TABLE IF NOT EXISTS runways (
  airport_icao TEXT NOT NULL,
  ident TEXT NOT NULL,
  heading_mag REAL NOT NULL,
  heading_true REAL NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  length_ft REAL NOT NULL,
  width_ft REAL,
  elevation_ft REAL NOT NULL,
  ils_frequency REAL,
  ils_course REAL,
  glideslope_deg REAL,
  PRIMARY KEY (airport_icao, ident)
);
CREATE TABLE IF NOT EXISTS waypoints (
  rowid_key INTEGER PRIMARY KEY AUTOINCREMENT,
  ident TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  region TEXT,
  mag_var REAL
);
CREATE INDEX IF NOT EXISTS idx_waypoints_ident ON waypoints(ident);
CREATE TABLE IF NOT EXISTS navaids (
  rowid_key INTEGER PRIMARY KEY AUTOINCREMENT,
  ident TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  region TEXT,
  frequency REAL NOT NULL,
  range_nm REAL,
  mag_var REAL
);
CREATE INDEX IF NOT EXISTS idx_navaids_ident ON navaids(ident);
CREATE TABLE IF NOT EXISTS airways (
  name TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS airway_legs (
  airway_name TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ident TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  type TEXT NOT NULL,
  min_altitude_ft REAL,
  PRIMARY KEY (airway_name, seq)
);
CREATE INDEX IF NOT EXISTS idx_airway_legs_ident ON airway_legs(ident);
CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY,
  airport_icao TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  runways TEXT NOT NULL,
  approach_type TEXT
);
CREATE INDEX IF NOT EXISTS idx_procedures_airport ON procedures(airport_icao, type);
CREATE TABLE IF NOT EXISTS procedure_legs (
  procedure_id TEXT NOT NULL,
  section TEXT NOT NULL,
  transition TEXT NOT NULL DEFAULT '',
  seq INTEGER NOT NULL,
  fix TEXT NOT NULL,
  path_terminator TEXT NOT NULL,
  course_mag REAL,
  altitude_json TEXT,
  speed_json TEXT,
  hold_json TEXT,
  overfly INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (procedure_id, section, transition, seq)
);
`

const NAV_TABLES = ['procedure_legs', 'procedures', 'airway_legs', 'airways', 'navaids', 'waypoints', 'runways', 'airports', 'nav_meta']

export async function readNavMeta(db: SqlDriver): Promise<NavDatabaseMeta | null> {
  const rows = await db.all<{
    id: string
    name: string
    cycle: string
    effective_from: string
    effective_to: string
    source: string
    is_demo: number
  }>('SELECT * FROM nav_meta LIMIT 1')
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    cycle: r.cycle,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    source: r.source,
    isDemo: r.is_demo === 1,
  }
}

/** Replaces the stored navigation database with `dataset` in a single transaction. */
export async function importNavDataset(db: SqlDriver, dataset: NavDataset, now = Date.now()): Promise<void> {
  await db.transaction(async () => {
    for (const t of NAV_TABLES) await db.run(`DELETE FROM ${t}`)
    const m = dataset.meta
    await db.run('INSERT INTO nav_meta VALUES (?,?,?,?,?,?,?,?)', [
      m.id, m.name, m.cycle, m.effectiveFrom, m.effectiveTo, m.source, m.isDemo ? 1 : 0, now,
    ])
    for (const a of dataset.airports) {
      await db.run('INSERT INTO airports VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        a.icao, a.iata ?? null, a.name, a.nameKo ?? null, a.city ?? null, a.country, a.lat, a.lon, a.elevationFt,
        a.magVar, a.transitionAltitudeFt, a.transitionLevelFt ?? null, a.speedLimitKt ?? null, a.speedLimitAltitudeFt ?? null,
      ])
      for (const r of a.runways) {
        await db.run('INSERT INTO runways VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
          a.icao, r.ident, r.headingMag, r.headingTrue, r.lat, r.lon, r.lengthFt, r.widthFt ?? null, r.elevationFt,
          r.ilsFrequency ?? null, r.ilsCourse ?? null, r.glideslopeDeg ?? null,
        ])
      }
    }
    for (const w of dataset.waypoints) {
      await db.run('INSERT INTO waypoints (ident,lat,lon,type,name,region,mag_var) VALUES (?,?,?,?,?,?,?)', [
        w.ident, w.lat, w.lon, w.type, w.name ?? null, w.region ?? null, w.magVar ?? null,
      ])
    }
    for (const n of dataset.navaids) {
      await db.run(
        'INSERT INTO navaids (ident,lat,lon,type,name,region,frequency,range_nm,mag_var) VALUES (?,?,?,?,?,?,?,?,?)',
        [n.ident, n.lat, n.lon, n.type, n.name ?? null, n.region ?? null, n.frequency, n.rangeNm ?? null, n.magVar ?? null],
      )
    }
    for (const aw of dataset.airways) {
      await db.run('INSERT INTO airways VALUES (?)', [aw.name])
      let seq = 0
      for (const f of aw.fixes) {
        await db.run('INSERT INTO airway_legs VALUES (?,?,?,?,?,?,?)', [
          aw.name, seq++, f.ident, f.lat, f.lon, f.type, f.minAltitudeFt ?? null,
        ])
      }
    }
    for (const p of dataset.procedures) {
      await db.run('INSERT INTO procedures VALUES (?,?,?,?,?,?)', [
        p.id, p.airport, p.type, p.name, JSON.stringify(p.runways), p.approachType ?? null,
      ])
      const insertLegs = async (section: string, transition: string, legs: Procedure['commonLegs']): Promise<void> => {
        let seq = 0
        for (const l of legs) {
          await db.run('INSERT INTO procedure_legs VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
            p.id, section, transition, seq++, l.fix, l.pathTerminator, l.courseMag ?? null,
            l.altitude ? JSON.stringify(l.altitude) : null, l.speed ? JSON.stringify(l.speed) : null,
            l.hold ? JSON.stringify(l.hold) : null, l.overfly ? 1 : 0,
          ])
        }
      }
      await insertLegs('COMMON', '', p.commonLegs)
      for (const t of p.transitions) await insertLegs('TRANSITION', t.name, t.legs)
      if (p.missedApproachLegs) await insertLegs('MISSED', '', p.missedApproachLegs)
    }
  })
}

const nn = <T>(v: T | null): T | undefined => (v === null ? undefined : v)

/** Loads the full dataset from SQLite (used to build the in-memory runtime index). */
export async function loadNavDataset(db: SqlDriver): Promise<NavDataset | null> {
  const meta = await readNavMeta(db)
  if (!meta) return null
  type Row = Record<string, string | number | null>
  const airportsRows = await db.all<Row>('SELECT * FROM airports ORDER BY icao')
  const runwayRows = await db.all<Row>('SELECT * FROM runways ORDER BY airport_icao, ident')
  const runwaysByAirport = new Map<string, Airport['runways']>()
  for (const r of runwayRows) {
    const list = runwaysByAirport.get(String(r.airport_icao)) ?? []
    list.push({
      ident: String(r.ident),
      headingMag: Number(r.heading_mag),
      headingTrue: Number(r.heading_true),
      lat: Number(r.lat),
      lon: Number(r.lon),
      lengthFt: Number(r.length_ft),
      widthFt: nn(r.width_ft as number | null),
      elevationFt: Number(r.elevation_ft),
      ilsFrequency: nn(r.ils_frequency as number | null),
      ilsCourse: nn(r.ils_course as number | null),
      glideslopeDeg: nn(r.glideslope_deg as number | null),
    })
    runwaysByAirport.set(String(r.airport_icao), list)
  }
  const airports: Airport[] = airportsRows.map((r) => ({
    icao: String(r.icao),
    iata: nn(r.iata as string | null),
    name: String(r.name),
    nameKo: nn(r.name_ko as string | null),
    city: nn(r.city as string | null),
    country: String(r.country),
    lat: Number(r.lat),
    lon: Number(r.lon),
    elevationFt: Number(r.elevation_ft),
    magVar: Number(r.mag_var),
    transitionAltitudeFt: Number(r.transition_altitude_ft),
    transitionLevelFt: nn(r.transition_level_ft as number | null),
    speedLimitKt: nn(r.speed_limit_kt as number | null),
    speedLimitAltitudeFt: nn(r.speed_limit_altitude_ft as number | null),
    runways: runwaysByAirport.get(String(r.icao)) ?? [],
  }))
  const waypoints: Waypoint[] = (await db.all<Row>('SELECT * FROM waypoints ORDER BY rowid_key')).map((r) => ({
    ident: String(r.ident),
    lat: Number(r.lat),
    lon: Number(r.lon),
    type: String(r.type) as Waypoint['type'],
    name: nn(r.name as string | null),
    region: nn(r.region as string | null),
    magVar: nn(r.mag_var as number | null),
  }))
  const navaids: Navaid[] = (await db.all<Row>('SELECT * FROM navaids ORDER BY rowid_key')).map((r) => ({
    ident: String(r.ident),
    lat: Number(r.lat),
    lon: Number(r.lon),
    type: String(r.type) as Navaid['type'],
    name: nn(r.name as string | null),
    region: nn(r.region as string | null),
    frequency: Number(r.frequency),
    rangeNm: nn(r.range_nm as number | null),
    magVar: nn(r.mag_var as number | null),
  }))
  const airwayMap = new Map<string, Airway>()
  for (const r of await db.all<Row>('SELECT * FROM airway_legs ORDER BY airway_name, seq')) {
    const name = String(r.airway_name)
    const aw = airwayMap.get(name) ?? { name, fixes: [] }
    aw.fixes.push({
      ident: String(r.ident),
      lat: Number(r.lat),
      lon: Number(r.lon),
      type: String(r.type) as Waypoint['type'],
      minAltitudeFt: nn(r.min_altitude_ft as number | null),
    })
    airwayMap.set(name, aw)
  }
  const procMap = new Map<string, Procedure>()
  for (const r of await db.all<Row>('SELECT * FROM procedures ORDER BY id')) {
    procMap.set(String(r.id), {
      id: String(r.id),
      airport: String(r.airport_icao),
      type: String(r.type) as Procedure['type'],
      name: String(r.name),
      runways: JSON.parse(String(r.runways)) as string[],
      approachType: nn(r.approach_type as Procedure['approachType'] | null),
      commonLegs: [],
      transitions: [],
    })
  }
  for (const r of await db.all<Row>('SELECT * FROM procedure_legs ORDER BY procedure_id, section, transition, seq')) {
    const p = procMap.get(String(r.procedure_id))
    if (!p) continue
    const leg = {
      fix: String(r.fix),
      pathTerminator: String(r.path_terminator) as Procedure['commonLegs'][number]['pathTerminator'],
      courseMag: nn(r.course_mag as number | null),
      altitude: r.altitude_json ? JSON.parse(String(r.altitude_json)) : undefined,
      speed: r.speed_json ? JSON.parse(String(r.speed_json)) : undefined,
      hold: r.hold_json ? JSON.parse(String(r.hold_json)) : undefined,
      overfly: r.overfly === 1 ? true : undefined,
    }
    if (r.section === 'COMMON') p.commonLegs.push(leg)
    else if (r.section === 'MISSED') (p.missedApproachLegs ??= []).push(leg)
    else {
      const name = String(r.transition)
      let t = p.transitions.find((x) => x.name === name)
      if (!t) {
        t = { name, legs: [] }
        p.transitions.push(t)
      }
      t.legs.push(leg)
    }
  }
  return { meta, airports, waypoints, navaids, airways: [...airwayMap.values()], procedures: [...procMap.values()] }
}
