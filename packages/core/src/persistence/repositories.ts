import { isLeg } from '@aerofms/shared'
import type { FlightPlan, SqlDriver } from '@aerofms/shared'
import type { FmsAction, FmsEvent } from '../events/types'
import type { FmsState } from '../state/types'
import { upgradeFmsState } from './state-upgrade'

export interface SessionSummary {
  id: string
  aircraftId: string
  name: string
  origin?: string
  destination?: string
  createdAt: number
  updatedAt: number
  actionCount: number
}

type Row = Record<string, string | number | null>

const toSummary = (r: Row): SessionSummary => ({
  id: String(r.id),
  aircraftId: String(r.aircraft_id),
  name: String(r.name),
  origin: (r.origin as string | null) ?? undefined,
  destination: (r.destination as string | null) ?? undefined,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
  actionCount: Number(r.action_count),
})

export class SessionRepository {
  constructor(private readonly db: SqlDriver) {}

  async list(aircraftId?: string): Promise<SessionSummary[]> {
    const rows = aircraftId
      ? await this.db.all<Row>(
          'SELECT id,aircraft_id,name,origin,destination,created_at,updated_at,action_count FROM sessions WHERE aircraft_id=? ORDER BY updated_at DESC',
          [aircraftId],
        )
      : await this.db.all<Row>(
          'SELECT id,aircraft_id,name,origin,destination,created_at,updated_at,action_count FROM sessions ORDER BY updated_at DESC',
        )
    return rows.map(toSummary)
  }

  /** Loads a session state. Corrupted JSON returns `{ corrupted: true }` so the UI can offer recovery. */
  async load(id: string): Promise<{ state?: FmsState; corrupted: boolean }> {
    const rows = await this.db.all<{ state_json: string }>('SELECT state_json FROM sessions WHERE id=?', [id])
    const row = rows[0]
    if (!row) return { corrupted: false }
    try {
      return { state: upgradeFmsState(JSON.parse(row.state_json)), corrupted: false }
    } catch {
      return { corrupted: true }
    }
  }

  async save(state: FmsState): Promise<void> {
    const plan = state.activeFlightPlan
    await this.db.run(
      `INSERT INTO sessions (id,aircraft_id,name,origin,destination,state_json,created_at,updated_at,action_count)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, origin=excluded.origin, destination=excluded.destination,
         state_json=excluded.state_json, updated_at=excluded.updated_at, action_count=excluded.action_count`,
      [
        state.session.sessionId,
        state.aircraft.aircraftId,
        state.session.name,
        plan.origin ?? null,
        plan.destination ?? null,
        JSON.stringify(state),
        state.session.createdAt,
        state.session.updatedAt,
        state.session.actionCount,
      ],
    )
  }

  async rename(id: string, name: string): Promise<void> {
    const loaded = await this.load(id)
    if (!loaded.state) return
    await this.save({ ...loaded.state, session: { ...loaded.state.session, name } })
  }

  async delete(id: string): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM sessions WHERE id=?', [id])
      await this.db.run('DELETE FROM session_actions WHERE session_id=?', [id])
      await this.db.run('DELETE FROM session_events WHERE session_id=?', [id])
      await this.db.run('DELETE FROM session_snapshots WHERE session_id=?', [id])
      await this.db.run('DELETE FROM replays WHERE session_id=?', [id])
    })
  }

  async clearHistory(id: string): Promise<void> {
    await this.db.run('DELETE FROM session_actions WHERE session_id=?', [id])
    await this.db.run('DELETE FROM session_events WHERE session_id=?', [id])
    await this.db.run('DELETE FROM session_snapshots WHERE session_id=?', [id])
  }

  /** Removes recorded actions/events/snapshots from `fromIndex` on (discard unsaved work). */
  async truncateActions(sessionId: string, fromIndex: number): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM session_actions WHERE session_id=? AND idx>=?', [sessionId, fromIndex])
      await this.db.run('DELETE FROM session_events WHERE session_id=? AND action_index>=?', [sessionId, fromIndex])
      await this.db.run('DELETE FROM session_snapshots WHERE session_id=? AND action_index>?', [sessionId, fromIndex])
    })
  }

  async appendActions(sessionId: string, entries: Array<{ index: number; action: FmsAction }>, events: FmsEvent[]): Promise<void> {
    if (!entries.length && !events.length) return
    await this.db.transaction(async () => {
      for (const e of entries) {
        await this.db.run('INSERT OR REPLACE INTO session_actions (session_id,idx,t,action_json) VALUES (?,?,?,?)', [
          sessionId,
          e.index,
          e.action.t,
          JSON.stringify(e.action),
        ])
      }
      const seqRow = await this.db.all<{ m: number | null }>('SELECT MAX(seq) AS m FROM session_events WHERE session_id=?', [sessionId])
      let seq = (seqRow[0]?.m ?? -1) + 1
      for (const ev of events) {
        await this.db.run(
          'INSERT INTO session_events (session_id,seq,action_index,t,type,detail,value) VALUES (?,?,?,?,?,?,?)',
          [sessionId, seq++, ev.actionIndex, ev.t, ev.type, ev.detail, ev.value === undefined || ev.value === null ? null : String(ev.value)],
        )
      }
    })
  }

  async loadActions(sessionId: string): Promise<Array<{ index: number; action: FmsAction }>> {
    const rows = await this.db.all<{ idx: number; action_json: string }>(
      'SELECT idx, action_json FROM session_actions WHERE session_id=? ORDER BY idx',
      [sessionId],
    )
    return rows.map((r) => ({ index: Number(r.idx), action: JSON.parse(r.action_json) as FmsAction }))
  }

  async loadEvents(sessionId: string): Promise<FmsEvent[]> {
    const rows = await this.db.all<Row>(
      'SELECT action_index,t,type,detail,value FROM session_events WHERE session_id=? ORDER BY seq',
      [sessionId],
    )
    return rows.map((r) => ({
      actionIndex: Number(r.action_index),
      t: Number(r.t),
      type: String(r.type) as FmsEvent['type'],
      detail: String(r.detail),
      value: r.value === null ? undefined : String(r.value),
    }))
  }

  async saveSnapshot(sessionId: string, actionIndex: number, state: FmsState): Promise<void> {
    await this.db.run('INSERT OR REPLACE INTO session_snapshots (session_id,action_index,state_json) VALUES (?,?,?)', [
      sessionId,
      actionIndex,
      JSON.stringify(state),
    ])
  }

  async loadSnapshots(sessionId: string): Promise<Array<{ actionIndex: number; state: FmsState }>> {
    const rows = await this.db.all<{ action_index: number; state_json: string }>(
      'SELECT action_index, state_json FROM session_snapshots WHERE session_id=? ORDER BY action_index',
      [sessionId],
    )
    const out: Array<{ actionIndex: number; state: FmsState }> = []
    for (const r of rows) {
      try {
        out.push({ actionIndex: Number(r.action_index), state: upgradeFmsState(JSON.parse(r.state_json)) })
      } catch {
        // Skip corrupted snapshots; replay falls back to an earlier one.
      }
    }
    return out
  }
}

export class KeyValueRepository {
  constructor(private readonly db: SqlDriver) {}

  async get<T>(key: string): Promise<T | undefined> {
    const rows = await this.db.all<{ value: string }>('SELECT value FROM kv WHERE key=?', [key])
    const v = rows[0]?.value
    if (v === undefined) return undefined
    try {
      return JSON.parse(v) as T
    } catch {
      return undefined
    }
  }

  async set<T>(key: string, value: T, now = Date.now()): Promise<void> {
    await this.db.run(
      'INSERT INTO kv (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
      [key, JSON.stringify(value), now],
    )
  }

  async delete(key: string): Promise<void> {
    await this.db.run('DELETE FROM kv WHERE key=?', [key])
  }
}

export interface StoredFlightPlan {
  id: string
  name: string
  aircraftId?: string
  plan: FlightPlan
  createdAt: number
  updatedAt: number
}

export class FlightPlanRepository {
  constructor(private readonly db: SqlDriver) {}

  async list(): Promise<StoredFlightPlan[]> {
    const rows = await this.db.all<Row>('SELECT * FROM flight_plans ORDER BY updated_at DESC')
    return rows.flatMap((r) => {
      try {
        return [
          {
            id: String(r.id),
            name: String(r.name),
            aircraftId: (r.aircraft_id as string | null) ?? undefined,
            plan: JSON.parse(String(r.json)) as FlightPlan,
            createdAt: Number(r.created_at),
            updatedAt: Number(r.updated_at),
          },
        ]
      } catch {
        return []
      }
    })
  }

  async save(fp: StoredFlightPlan): Promise<void> {
    await this.db.run(
      `INSERT INTO flight_plans (id,name,aircraft_id,origin,destination,json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, aircraft_id=excluded.aircraft_id, origin=excluded.origin,
       destination=excluded.destination, json=excluded.json, updated_at=excluded.updated_at`,
      [fp.id, fp.name, fp.aircraftId ?? null, fp.plan.origin ?? null, fp.plan.destination ?? null, JSON.stringify(fp.plan), fp.createdAt, fp.updatedAt],
    )
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM flight_plans WHERE id=?', [id])
  }
}

export type LessonStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'

export interface TrainingProgressRecord {
  lessonId: string
  status: LessonStatus
  bestScore: number
  lastScore: number
  attempts: number
  completedAt?: number
  updatedAt: number
}

export class TrainingProgressRepository {
  constructor(private readonly db: SqlDriver) {}

  async list(): Promise<TrainingProgressRecord[]> {
    const rows = await this.db.all<Row>('SELECT * FROM training_progress')
    return rows.map((r) => ({
      lessonId: String(r.lesson_id),
      status: String(r.status) as LessonStatus,
      bestScore: Number(r.best_score),
      lastScore: Number(r.last_score),
      attempts: Number(r.attempts),
      completedAt: r.completed_at === null ? undefined : Number(r.completed_at),
      updatedAt: Number(r.updated_at),
    }))
  }

  async save(rec: TrainingProgressRecord): Promise<void> {
    await this.db.run(
      `INSERT INTO training_progress (lesson_id,status,best_score,last_score,attempts,completed_at,updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(lesson_id) DO UPDATE SET status=excluded.status, best_score=excluded.best_score, last_score=excluded.last_score,
       attempts=excluded.attempts, completed_at=excluded.completed_at, updated_at=excluded.updated_at`,
      [rec.lessonId, rec.status, rec.bestScore, rec.lastScore, rec.attempts, rec.completedAt ?? null, rec.updatedAt],
    )
  }

  /** Merges a remote record using best-score/latest-update semantics (cloud sync). */
  async merge(remote: TrainingProgressRecord): Promise<void> {
    const local = (await this.list()).find((r) => r.lessonId === remote.lessonId)
    if (!local) return this.save(remote)
    const statusRank = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2 } as const
    await this.save({
      lessonId: local.lessonId,
      status: statusRank[remote.status] > statusRank[local.status] ? remote.status : local.status,
      bestScore: Math.max(local.bestScore, remote.bestScore),
      lastScore: remote.updatedAt > local.updatedAt ? remote.lastScore : local.lastScore,
      attempts: Math.max(local.attempts, remote.attempts),
      completedAt: local.completedAt ?? remote.completedAt,
      updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    })
  }
}

export class JsonDocumentRepository<T extends { id: string }> {
  constructor(
    private readonly db: SqlDriver,
    private readonly table: 'scenarios',
  ) {}

  async list(source?: string): Promise<Array<{ source: string; doc: T; updatedAt: number }>> {
    const rows = source
      ? await this.db.all<Row>(`SELECT * FROM ${this.table} WHERE source=? ORDER BY updated_at DESC`, [source])
      : await this.db.all<Row>(`SELECT * FROM ${this.table} ORDER BY updated_at DESC`)
    return rows.flatMap((r) => {
      try {
        return [{ source: String(r.source), doc: JSON.parse(String(r.json)) as T, updatedAt: Number(r.updated_at) }]
      } catch {
        return []
      }
    })
  }

  async get(id: string): Promise<{ source: string; doc: T } | undefined> {
    const rows = await this.db.all<Row>(`SELECT * FROM ${this.table} WHERE id=?`, [id])
    const r = rows[0]
    if (!r) return undefined
    return { source: String(r.source), doc: JSON.parse(String(r.json)) as T }
  }

  async save(doc: T, source: string, now = Date.now()): Promise<void> {
    await this.db.run(
      `INSERT INTO ${this.table} (id,source,json,updated_at) VALUES (?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET source=excluded.source, json=excluded.json, updated_at=excluded.updated_at`,
      [doc.id, source, JSON.stringify(doc), now],
    )
  }

  async delete(id: string): Promise<void> {
    await this.db.run(`DELETE FROM ${this.table} WHERE id=?`, [id])
  }
}

export interface ScenarioAttemptRecord {
  id: string
  scenarioId: string
  createdAt: number
  [key: string]: unknown
}

export class ScenarioAttemptRepository {
  constructor(private readonly db: SqlDriver) {}

  async add(rec: ScenarioAttemptRecord): Promise<void> {
    await this.db.run('INSERT OR REPLACE INTO scenario_attempts (id,scenario_id,json,created_at) VALUES (?,?,?,?)', [
      rec.id,
      rec.scenarioId,
      JSON.stringify(rec),
      rec.createdAt,
    ])
  }

  async list(scenarioId?: string): Promise<ScenarioAttemptRecord[]> {
    const rows = scenarioId
      ? await this.db.all<{ json: string }>('SELECT json FROM scenario_attempts WHERE scenario_id=? ORDER BY created_at DESC', [scenarioId])
      : await this.db.all<{ json: string }>('SELECT json FROM scenario_attempts ORDER BY created_at DESC')
    return rows.map((r) => JSON.parse(r.json) as ScenarioAttemptRecord)
  }
}

export interface ReplayRecord {
  id: string
  sessionId: string
  title: string
  aircraftId: string
  actionCount: number
  createdAt: number
}

export class ReplayRepository {
  constructor(private readonly db: SqlDriver) {}

  async list(): Promise<ReplayRecord[]> {
    const rows = await this.db.all<Row>('SELECT * FROM replays ORDER BY created_at DESC')
    return rows.map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      title: String(r.title),
      aircraftId: String(r.aircraft_id),
      actionCount: Number(r.action_count),
      createdAt: Number(r.created_at),
    }))
  }

  async save(r: ReplayRecord): Promise<void> {
    await this.db.run('INSERT OR REPLACE INTO replays (id,session_id,title,aircraft_id,action_count,created_at) VALUES (?,?,?,?,?,?)', [
      r.id,
      r.sessionId,
      r.title,
      r.aircraftId,
      r.actionCount,
      r.createdAt,
    ])
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM replays WHERE id=?', [id])
  }
}

export interface OutboxEntry {
  id: number
  collection: string
  docId: string
  op: 'UPSERT' | 'DELETE'
  payload?: unknown
  createdAt: number
}

/** Durable queue of pending cloud writes (offline-first sync). */
export class SyncOutboxRepository {
  constructor(private readonly db: SqlDriver) {}

  async enqueue(collection: string, docId: string, op: 'UPSERT' | 'DELETE', payload?: unknown, now = Date.now()): Promise<void> {
    await this.db.transaction(async () => {
      // Coalesce: only the latest operation per document matters.
      await this.db.run('DELETE FROM sync_outbox WHERE collection=? AND doc_id=?', [collection, docId])
      await this.db.run('INSERT INTO sync_outbox (collection,doc_id,op,payload,created_at) VALUES (?,?,?,?,?)', [
        collection,
        docId,
        op,
        payload === undefined ? null : JSON.stringify(payload),
        now,
      ])
    })
  }

  async peek(limit = 50): Promise<OutboxEntry[]> {
    const rows = await this.db.all<Row>('SELECT * FROM sync_outbox ORDER BY id LIMIT ?', [limit])
    return rows.map((r) => ({
      id: Number(r.id),
      collection: String(r.collection),
      docId: String(r.doc_id),
      op: String(r.op) as OutboxEntry['op'],
      payload: r.payload === null ? undefined : JSON.parse(String(r.payload)),
      createdAt: Number(r.created_at),
    }))
  }

  async remove(id: number): Promise<void> {
    await this.db.run('DELETE FROM sync_outbox WHERE id=?', [id])
  }

  async count(): Promise<number> {
    const rows = await this.db.all<{ c: number }>('SELECT COUNT(*) AS c FROM sync_outbox')
    return Number(rows[0]?.c ?? 0)
  }
}

/** Short route description for lists, e.g. "RKSI → RKPK". */
export function routeSummary(plan: FlightPlan): string {
  const legs = plan.elements.filter(isLeg)
  if (!plan.origin && !plan.destination) return legs.length ? `${legs.length} WPT` : ''
  return `${plan.origin ?? '----'} → ${plan.destination ?? '----'}`
}
