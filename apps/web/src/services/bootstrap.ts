import {
  FlightPlanRepository,
  JsonDocumentRepository,
  migrate,
  MigrationError,
  ReplayRepository,
  ScenarioAttemptRepository,
  SessionManager,
  SyncOutboxRepository,
  TrainingProgressRepository,
} from '@aerofms/core'
import type { AircraftRegistry, SqlJsDriver ,
  KeyValueRepository} from '@aerofms/core'
import { buildDemoDataset, importNavDataset, InMemoryNavigationProvider, loadNavDataset, readNavMeta } from '@aerofms/navigation'
import { createAircraftRegistry } from '@aerofms/aircraft'
import { StandaloneSimulator } from '@aerofms/simulation'
import type { Scenario } from '@aerofms/training'
import { openWebDatabase } from '@/platform/db'
import type { WebDatabase } from '@/platform/db'

export interface AppServices {
  database: WebDatabase
  db: SqlJsDriver
  nav: InMemoryNavigationProvider
  registry: AircraftRegistry
  simulator: StandaloneSimulator
  sessions: SessionManager
  kv: KeyValueRepository
  flightPlans: FlightPlanRepository
  progress: TrainingProgressRepository
  scenarios: JsonDocumentRepository<Scenario>
  attempts: ScenarioAttemptRepository
  replays: ReplayRepository
  outbox: SyncOutboxRepository
  migrationRecovered: boolean
}

/** Ensures the bundled navigation dataset is stored in SQLite and returns the indexed runtime provider. */
export async function ensureNavDatabase(db: SqlJsDriver, force = false): Promise<InMemoryNavigationProvider> {
  const bundled = buildDemoDataset()
  const meta = await readNavMeta(db).catch(() => null)
  if (force || !meta || meta.id !== bundled.meta.id || meta.cycle !== bundled.meta.cycle) {
    await importNavDataset(db, bundled)
  }
  try {
    const loaded = await loadNavDataset(db)
    if (loaded && loaded.airports.length) return new InMemoryNavigationProvider(loaded)
  } catch (e) {
    console.error('[nav] stored database unreadable, re-importing', e)
  }
  await importNavDataset(db, bundled)
  return new InMemoryNavigationProvider(bundled)
}

let bootPromise: Promise<AppServices> | undefined

/** Single application bootstrap (idempotent – safe under React StrictMode double effects). */
export function bootstrap(): Promise<AppServices> {
  bootPromise ??= doBootstrap()
  return bootPromise
}

async function doBootstrap(): Promise<AppServices> {
  const database = await openWebDatabase()
  const db = database.driver
  let migrationRecovered = false
  try {
    await migrate(db)
  } catch (e) {
    if (!(e instanceof MigrationError)) throw e
    // Keep a copy of the broken image and start a clean schema so the app stays usable.
    console.error('[db] migration failed – recreating schema', e)
    await database.persistNow()
    for (const t of (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name)) {
      await db.exec(`DROP TABLE IF EXISTS "${t}"`)
    }
    await migrate(db)
    migrationRecovered = true
  }
  const nav = await ensureNavDatabase(db)
  const registry = createAircraftRegistry()
  const simulator = new StandaloneSimulator()
  const sessions = new SessionManager({ db, nav, registry, simulator })
  return {
    database,
    db,
    nav,
    registry,
    simulator,
    sessions,
    kv: sessions.kv,
    flightPlans: new FlightPlanRepository(db),
    progress: new TrainingProgressRepository(db),
    scenarios: new JsonDocumentRepository<Scenario>(db, 'scenarios'),
    attempts: new ScenarioAttemptRepository(db),
    replays: new ReplayRepository(db),
    outbox: new SyncOutboxRepository(db),
    migrationRecovered,
  }
}
