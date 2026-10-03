import { describe, expect, it } from 'vitest'
import { buildDemoDataset, importNavDataset, InMemoryNavigationProvider, loadNavDataset } from '@aerofms/navigation'
import { createAircraftRegistry } from '@aerofms/aircraft'
import { currentSchemaVersion, LATEST_SCHEMA_VERSION, migrate, MigrationError, SessionManager, TrainingProgressRepository, SyncOutboxRepository, upgradeFmsState } from '../src'
import type { Migration } from '../src'
import { memoryDb } from './helpers'

describe('SQLite migrations', () => {
  it('migrates an empty database to the latest schema and is idempotent', async () => {
    const db = await memoryDb()
    expect(await currentSchemaVersion(db)).toBe(0)
    expect(await migrate(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(await migrate(db)).toBe(LATEST_SCHEMA_VERSION)
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")).map((t) => t.name)
    for (const t of ['sessions', 'session_actions', 'airports', 'waypoints', 'airways', 'procedures', 'procedure_legs', 'training_progress', 'scenarios', 'sync_outbox']) {
      expect(tables).toContain(t)
    }
  })

  it('upgrades from version 1 without losing session data', async () => {
    const db = await memoryDb()
    const { MIGRATIONS } = await import('../src')
    await migrate(db, MIGRATIONS.filter((m) => m.version === 1))
    await db.run("INSERT INTO sessions (id,aircraft_id,name,state_json,created_at,updated_at) VALUES ('s1','B737-800','old','{}',1,1)")
    await migrate(db)
    const rows = await db.all<{ id: string }>('SELECT id FROM sessions')
    expect(rows.map((r) => r.id)).toEqual(['s1'])
  })

  it('rolls back a failing migration and reports MigrationError', async () => {
    const db = await memoryDb()
    await migrate(db)
    const bad: Migration = { version: LATEST_SCHEMA_VERSION + 1, description: 'bad', up: async (d) => d.exec('CREATE TABLE x(a); SELECT * FROM missing_table;') }
    await expect(migrate(db, [bad])).rejects.toBeInstanceOf(MigrationError)
    expect(await currentSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
  })
})

describe('navigation database storage', () => {
  it('round-trips the demo dataset through SQLite', async () => {
    const db = await memoryDb()
    await migrate(db)
    const ds = buildDemoDataset()
    await importNavDataset(db, ds)
    const loaded = await loadNavDataset(db)
    expect(loaded?.meta.cycle).toBe(ds.meta.cycle)
    expect(loaded?.airports.length).toBe(ds.airports.length)
    expect(loaded?.procedures.length).toBe(ds.procedures.length)
    const nav = new InMemoryNavigationProvider(loaded!)
    expect(nav.getProcedure('RKPK-APP-ILS36L')?.missedApproachLegs?.length).toBeGreaterThan(0)
    expect(nav.getAirway('Y722')?.fixes.map((f) => f.ident)).toEqual(['OSN', 'SOSDO', 'MAKET', 'TOPAX', 'KALOD'])
    expect(nav.search('RKS').map((r) => r.ident)).toEqual(expect.arrayContaining(['RKSI', 'RKSS']))
  })
})

describe('session manager', () => {
  async function setup() {
    const db = await memoryDb()
    await migrate(db)
    const nav = new InMemoryNavigationProvider(buildDemoDataset())
    let now = 1_700_000_000_000
    const mgr = new SessionManager({ db, nav, registry: createAircraftRegistry(), now: () => (now += 1000), saveDebounceMs: 1 })
    return { db, nav, mgr }
  }

  it('persists FMC input and restores it after "restart" (per-aircraft sessions)', async () => {
    const { db, nav, mgr } = await setup()
    const engine = await mgr.create('B737-800')
    mgr.attach(engine)
    let t = 1
    for (const k of ['R', 'K', 'S', 'I']) engine.dispatch({ type: 'KEY', key: k, t: t++ })
    engine.dispatch({ type: 'OPEN_PAGE', pageId: 'RTE', t: t++ })
    engine.dispatch({ type: 'LSK', lsk: '1L', t: t++ })
    await mgr.flush()
    expect(engine.state.activeFlightPlan.origin).toBe('RKSI')

    const a320 = await mgr.openOrCreateForAircraft('A320-NEO')
    expect(a320.state.aircraft.aircraftId).toBe('A320-NEO')

    // New manager = app restart
    const mgr2 = new SessionManager({ db, nav, registry: createAircraftRegistry() })
    const restored = await mgr2.openOrCreateForAircraft('B737-800')
    expect(restored.state.activeFlightPlan.origin).toBe('RKSI')
    expect(restored.state.session.sessionId).toBe(engine.state.session.sessionId)
    expect((await mgr2.list('B737-800')).length).toBe(1)

    // Replay rebuilds the same state from the action log
    const replay = await mgr2.loadReplay(engine.state.session.sessionId)
    expect(replay?.length).toBe(6)
    expect(replay?.stateAt(6).activeFlightPlan.origin).toBe('RKSI')
    expect(replay?.stateAt(0).activeFlightPlan.origin).toBeUndefined()
    expect(replay?.stateAt(4).scratchpad.text).toBe('RKSI')
  })

  it('duplicates, renames, exports/imports and deletes sessions', async () => {
    const { mgr } = await setup()
    const e = await mgr.create('A320-NEO', 'Original')
    mgr.attach(e)
    e.dispatch({ type: 'COMMAND', command: { kind: 'SET_ORIGIN', icao: 'RKSS' }, t: 1 })
    await mgr.flush()
    const copyId = await mgr.duplicate(e.state.session.sessionId)
    expect(copyId).toBeDefined()
    await mgr.rename(copyId!, 'Copy')
    const list = await mgr.list('A320-NEO')
    expect(list.map((s) => s.name).sort()).toEqual(['Copy', 'Original'])
    const exported = await mgr.export(e.state.session.sessionId)
    const importedId = await mgr.import(exported!)
    const opened = await mgr.open(importedId)
    expect(opened.ok && opened.engine.state.activeFlightPlan.origin).toBe('RKSS')
    await mgr.delete(copyId!)
    expect((await mgr.list('A320-NEO')).length).toBe(2)
  })

  it('reports corrupted state instead of crashing', async () => {
    const { db, mgr } = await setup()
    await db.run("INSERT INTO sessions (id,aircraft_id,name,state_json,created_at,updated_at) VALUES ('bad','B737-800','x','{not json',1,1)")
    const r = await mgr.open('bad')
    expect(r).toEqual({ ok: false, reason: 'CORRUPTED' })
    expect(() => upgradeFmsState({ aircraft: {} })).toThrow()
  })
})

describe('training progress and sync outbox', () => {
  it('merges progress with best-score semantics and coalesces outbox writes', async () => {
    const db = await memoryDb()
    await migrate(db)
    const repo = new TrainingProgressRepository(db)
    await repo.save({ lessonId: 'l1', status: 'IN_PROGRESS', bestScore: 60, lastScore: 60, attempts: 1, updatedAt: 10 })
    await repo.merge({ lessonId: 'l1', status: 'COMPLETED', bestScore: 80, lastScore: 80, attempts: 2, updatedAt: 20, completedAt: 20 })
    const [rec] = await repo.list()
    expect(rec).toMatchObject({ status: 'COMPLETED', bestScore: 80, attempts: 2 })
    const outbox = new SyncOutboxRepository(db)
    await outbox.enqueue('trainingProgress', 'l1', 'UPSERT', { a: 1 })
    await outbox.enqueue('trainingProgress', 'l1', 'UPSERT', { a: 2 })
    expect(await outbox.count()).toBe(1)
    expect((await outbox.peek())[0]?.payload).toEqual({ a: 2 })
  })
})
