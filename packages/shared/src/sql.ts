/** Minimal async SQLite abstraction implemented by sql.js (web, tests) and expo-sqlite (Android). */
export type SqlValue = string | number | null | Uint8Array

export interface SqlRunResult {
  changes: number
}

export interface SqlDriver {
  /** Executes one or more statements without parameters. */
  exec(sql: string): Promise<void>
  run(sql: string, params?: SqlValue[]): Promise<SqlRunResult>
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>
  /** Runs `fn` atomically. Nested calls join the outer transaction. */
  transaction<T>(fn: () => Promise<T>): Promise<T>
}

export async function sqlFirst<T>(db: SqlDriver, sql: string, params?: SqlValue[]): Promise<T | undefined> {
  const rows = await db.all<T>(sql, params)
  return rows[0]
}
