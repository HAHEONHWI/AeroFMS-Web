import type { SqlDriver, SqlRunResult, SqlValue } from '@aerofms/shared'

/** Minimal subset of the sql.js Database API (keeps core free of a sql.js dependency). */
export interface SqlJsDatabaseLike {
  run(sql: string, params?: SqlValue[]): unknown
  exec(sql: string): unknown
  prepare(sql: string): {
    bind(params?: SqlValue[]): boolean
    step(): boolean
    getAsObject(): Record<string, SqlValue>
    free(): boolean
  }
  getRowsModified(): number
}

/** SqlDriver backed by sql.js (WebAssembly SQLite). Used by the web app and the test-suite. */
export class SqlJsDriver implements SqlDriver {
  private depth = 0
  /** Called after each committed write transaction (web: schedule IndexedDB persistence). */
  onCommit?: () => void

  constructor(readonly db: SqlJsDatabaseLike) {}

  async exec(sql: string): Promise<void> {
    this.db.exec(sql)
    if (this.depth === 0) this.onCommit?.()
  }

  async run(sql: string, params: SqlValue[] = []): Promise<SqlRunResult> {
    this.db.run(sql, params)
    const changes = this.db.getRowsModified()
    if (this.depth === 0) this.onCommit?.()
    return { changes }
  }

  async all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params)
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as T)
      return rows
    } finally {
      stmt.free()
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.depth > 0) {
      this.depth++
      try {
        return await fn()
      } finally {
        this.depth--
      }
    }
    this.depth = 1
    this.db.exec('BEGIN')
    try {
      const r = await fn()
      this.db.exec('COMMIT')
      this.depth = 0
      this.onCommit?.()
      return r
    } catch (e) {
      this.db.exec('ROLLBACK')
      this.depth = 0
      throw e
    }
  }
}
