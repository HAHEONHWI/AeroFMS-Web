import { NAV_DB_SCHEMA_SQL } from '@aerofms/navigation'
import type { SqlDriver } from '@aerofms/shared'

export interface Migration {
  version: number
  description: string
  up(db: SqlDriver): Promise<void>
}

/**
 * Local SQLite schema history. Migrations are append-only: never edit a released
 * migration, add a new one instead (see docs/ARCHITECTURE.md → Persistence).
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Core tables: settings, sessions, actions, events, snapshots',
    async up(db) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          aircraft_id TEXT NOT NULL,
          name TEXT NOT NULL,
          origin TEXT,
          destination TEXT,
          state_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          action_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_aircraft ON sessions(aircraft_id, updated_at);
        CREATE TABLE IF NOT EXISTS session_actions (
          session_id TEXT NOT NULL,
          idx INTEGER NOT NULL,
          t INTEGER NOT NULL,
          action_json TEXT NOT NULL,
          PRIMARY KEY (session_id, idx)
        );
        CREATE TABLE IF NOT EXISTS session_events (
          session_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          action_index INTEGER NOT NULL,
          t INTEGER NOT NULL,
          type TEXT NOT NULL,
          detail TEXT NOT NULL,
          value TEXT,
          PRIMARY KEY (session_id, seq)
        );
        CREATE TABLE IF NOT EXISTS session_snapshots (
          session_id TEXT NOT NULL,
          action_index INTEGER NOT NULL,
          state_json TEXT NOT NULL,
          PRIMARY KEY (session_id, action_index)
        );
      `)
    },
  },
  {
    version: 2,
    description: 'Navigation database tables',
    async up(db) {
      await db.exec(NAV_DB_SCHEMA_SQL)
    },
  },
  {
    version: 3,
    description: 'Flight plans, training progress, scenarios, attempts, replays, sync outbox',
    async up(db) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS flight_plans (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          aircraft_id TEXT,
          origin TEXT,
          destination TEXT,
          json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS training_progress (
          lesson_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          best_score INTEGER NOT NULL DEFAULT 0,
          last_score INTEGER NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0,
          completed_at INTEGER,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS scenarios (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS scenario_attempts (
          id TEXT PRIMARY KEY,
          scenario_id TEXT NOT NULL,
          json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_attempts_scenario ON scenario_attempts(scenario_id, created_at);
        CREATE TABLE IF NOT EXISTS replays (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          title TEXT NOT NULL,
          aircraft_id TEXT NOT NULL,
          action_count INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          collection TEXT NOT NULL,
          doc_id TEXT NOT NULL,
          op TEXT NOT NULL,
          payload TEXT,
          created_at INTEGER NOT NULL
        );
      `)
    },
  },
]

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0

export class MigrationError extends Error {
  constructor(
    readonly version: number,
    cause: unknown,
  ) {
    super(`Migration ${version} failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'MigrationError'
  }
}

export async function currentSchemaVersion(db: SqlDriver): Promise<number> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
  const rows = await db.all<{ version: number }>('SELECT version FROM schema_version LIMIT 1')
  return rows[0]?.version ?? 0
}

/** Applies pending migrations, each in its own transaction. Returns the resulting version. */
export async function migrate(db: SqlDriver, migrations: Migration[] = MIGRATIONS): Promise<number> {
  let version = await currentSchemaVersion(db)
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= version) continue
    try {
      await db.transaction(async () => {
        await m.up(db)
        await db.run('DELETE FROM schema_version')
        await db.run('INSERT INTO schema_version (version) VALUES (?)', [m.version])
      })
      version = m.version
    } catch (e) {
      throw new MigrationError(m.version, e)
    }
  }
  return version
}
