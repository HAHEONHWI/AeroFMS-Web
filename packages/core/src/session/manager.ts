import { createId } from '@aerofms/shared'
import type { SqlDriver } from '@aerofms/shared'
import type { NavigationProvider } from '@aerofms/navigation'
import { FmsEngine } from '../engine/engine'
import type { EngineUpdate } from '../engine/engine'
import type { AircraftRegistry } from '../engine/registry'
import type { SimulationStepper } from '../engine/adapter'
import type { FmsAction, FmsEvent } from '../events/types'
import { ReplayController } from '../events/replay'
import { KeyValueRepository, SessionRepository } from '../persistence/repositories'
import type { SessionSummary } from '../persistence/repositories'
import type { FmsState } from '../state/types'

export interface SessionManagerOptions {
  db: SqlDriver
  nav: NavigationProvider
  registry: AircraftRegistry
  simulator?: SimulationStepper
  now?: () => number
  /** Debounce for state saves (ms). */
  saveDebounceMs?: number
  /** Persist a replay snapshot every N actions. */
  snapshotEvery?: number
}

export type OpenSessionResult =
  | { ok: true; engine: FmsEngine }
  | { ok: false; reason: 'NOT_FOUND' | 'CORRUPTED' | 'UNKNOWN_AIRCRAFT' }

export interface SessionExport {
  format: 'aerofms-session'
  version: 1
  state: FmsState
  actions: FmsAction[]
  baseline?: FmsState
}

const KEY_LAST_BY_AIRCRAFT = 'sessions.lastByAircraft'
const KEY_CURRENT = 'sessions.current'

/** Multi-session, per-aircraft session lifecycle with debounced persistence and checkpoints. */
export class SessionManager {
  readonly sessions: SessionRepository
  readonly kv: KeyValueRepository
  private readonly now: () => number
  private pendingActions: Array<{ index: number; action: FmsAction }> = []
  private pendingEvents: FmsEvent[] = []
  private pendingState?: FmsState
  private timer?: ReturnType<typeof setTimeout>
  private flushing: Promise<void> = Promise.resolve()
  private detachCurrent?: () => void
  /** When false, actions are not recorded for replay (state is still saved). */
  recording = true

  constructor(private readonly opts: SessionManagerOptions) {
    this.sessions = new SessionRepository(opts.db)
    this.kv = new KeyValueRepository(opts.db)
    this.now = opts.now ?? (() => Date.now())
  }

  list(aircraftId?: string): Promise<SessionSummary[]> {
    return this.sessions.list(aircraftId)
  }

  private engineFor(state: FmsState): FmsEngine | undefined {
    const adapter = this.opts.registry.get(state.aircraft.aircraftId)
    if (!adapter) return undefined
    return new FmsEngine({ nav: this.opts.nav, adapter, simulator: this.opts.simulator }, state)
  }

  async create(aircraftId: string, name?: string): Promise<FmsEngine> {
    const adapter = this.opts.registry.get(aircraftId)
    if (!adapter) throw new Error(`Unknown aircraft ${aircraftId}`)
    const now = this.now()
    const id = createId('s-')
    const count = (await this.sessions.list(aircraftId)).length
    const state = adapter.initialize({
      sessionId: id,
      name: name ?? `${adapter.definition.model} #${count + 1}`,
      now,
      nav: this.opts.nav,
    })
    await this.sessions.save(state)
    await this.sessions.saveSnapshot(id, 0, state)
    await this.rememberLast(aircraftId, id)
    const engine = this.engineFor(state)
    if (!engine) throw new Error('adapter missing')
    return engine
  }

  async open(sessionId: string): Promise<OpenSessionResult> {
    const loaded = await this.sessions.load(sessionId)
    if (loaded.corrupted) return { ok: false, reason: 'CORRUPTED' }
    if (!loaded.state) return { ok: false, reason: 'NOT_FOUND' }
    const engine = this.engineFor(loaded.state)
    if (!engine) return { ok: false, reason: 'UNKNOWN_AIRCRAFT' }
    await this.rememberLast(loaded.state.aircraft.aircraftId, sessionId)
    return { ok: true, engine }
  }

  /** Opens the most recent session of an aircraft, creating one if none exists. */
  async openOrCreateForAircraft(aircraftId: string): Promise<FmsEngine> {
    const last = await this.lastSessionId(aircraftId)
    if (last) {
      const r = await this.open(last)
      if (r.ok) return r.engine
    }
    const existing = await this.sessions.list(aircraftId)
    for (const s of existing) {
      const r = await this.open(s.id)
      if (r.ok) return r.engine
    }
    return this.create(aircraftId)
  }

  /** Persists every action of `engine` (debounced state, immediate checkpoints on key events). */
  attach(engine: FmsEngine): () => void {
    this.detachCurrent?.()
    const snapshotEvery = this.opts.snapshotEvery ?? 100
    const unsubscribe = engine.subscribe((u: EngineUpdate) => {
      const index = u.previous.session.actionCount
      if (this.recording) {
        this.pendingActions.push({ index, action: u.action })
        this.pendingEvents.push(...u.events)
      }
      this.pendingState = u.state
      const critical = u.events.some((e) => e.type === 'EXEC' || e.type === 'INSERT' || e.type === 'ERASE')
      if ((index + 1) % snapshotEvery === 0) {
        const snap = u.state
        this.enqueue(() => this.sessions.saveSnapshot(snap.session.sessionId, index + 1, snap))
      }
      if (critical) void this.flush()
      else this.schedule()
    })
    void this.kv.set(KEY_CURRENT, engine.state.session.sessionId, this.now())
    this.detachCurrent = () => {
      unsubscribe()
      this.detachCurrent = undefined
    }
    return this.detachCurrent
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), this.opts.saveDebounceMs ?? 400)
  }

  private enqueue(fn: () => Promise<void>): void {
    this.flushing = this.flushing.then(fn).catch((e) => console.error('[SessionManager] persistence error', e))
  }

  /** Writes pending actions/events and the latest state. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    const actions = this.pendingActions
    const events = this.pendingEvents
    const state = this.pendingState
    this.pendingActions = []
    this.pendingEvents = []
    this.pendingState = undefined
    if (state) {
      this.enqueue(async () => {
        await this.sessions.appendActions(state.session.sessionId, actions, events)
        await this.sessions.save(state)
      })
    }
    return this.flushing
  }

  async saveNow(state: FmsState): Promise<void> {
    await this.flush()
    await this.sessions.save(state)
  }

  /**
   * "Switch without saving": restores the session to a checkpoint taken when it was opened
   * and drops every action recorded after it.
   */
  async discardSince(checkpoint: FmsState): Promise<void> {
    await this.flush()
    await this.sessions.save(checkpoint)
    await this.sessions.truncateActions(checkpoint.session.sessionId, checkpoint.session.actionCount)
  }

  async lastSessionId(aircraftId: string): Promise<string | undefined> {
    const map = (await this.kv.get<Record<string, string>>(KEY_LAST_BY_AIRCRAFT)) ?? {}
    return map[aircraftId]
  }

  async currentSessionId(): Promise<string | undefined> {
    return this.kv.get<string>(KEY_CURRENT)
  }

  private async rememberLast(aircraftId: string, sessionId: string): Promise<void> {
    const map = (await this.kv.get<Record<string, string>>(KEY_LAST_BY_AIRCRAFT)) ?? {}
    map[aircraftId] = sessionId
    await this.kv.set(KEY_LAST_BY_AIRCRAFT, map, this.now())
    await this.kv.set(KEY_CURRENT, sessionId, this.now())
  }

  async rename(sessionId: string, name: string): Promise<void> {
    await this.flush()
    await this.sessions.rename(sessionId, name.trim().slice(0, 60) || 'Session')
  }

  async duplicate(sessionId: string): Promise<string | undefined> {
    await this.flush()
    const loaded = await this.sessions.load(sessionId)
    if (!loaded.state) return undefined
    const id = createId('s-')
    const now = this.now()
    const copy: FmsState = {
      ...loaded.state,
      session: { ...loaded.state.session, sessionId: id, name: `${loaded.state.session.name} (copy)`, createdAt: now, updatedAt: now, actionCount: 0 },
    }
    await this.sessions.save(copy)
    await this.sessions.saveSnapshot(id, 0, copy)
    return id
  }

  /** Resets a session to a clean FMS (same id/name) and clears its history. */
  async reset(sessionId: string): Promise<FmsEngine | undefined> {
    await this.flush()
    const loaded = await this.sessions.load(sessionId)
    const prev = loaded.state
    if (!prev) return undefined
    const adapter = this.opts.registry.get(prev.aircraft.aircraftId)
    if (!adapter) return undefined
    const state = adapter.initialize({ sessionId, name: prev.session.name, now: this.now(), nav: this.opts.nav })
    await this.sessions.clearHistory(sessionId)
    await this.sessions.save(state)
    await this.sessions.saveSnapshot(sessionId, 0, state)
    return this.engineFor(state)
  }

  async delete(sessionId: string): Promise<void> {
    await this.flush()
    await this.sessions.delete(sessionId)
    const map = (await this.kv.get<Record<string, string>>(KEY_LAST_BY_AIRCRAFT)) ?? {}
    for (const [k, v] of Object.entries(map)) if (v === sessionId) delete map[k]
    await this.kv.set(KEY_LAST_BY_AIRCRAFT, map, this.now())
  }

  async export(sessionId: string): Promise<SessionExport | undefined> {
    await this.flush()
    const loaded = await this.sessions.load(sessionId)
    if (!loaded.state) return undefined
    const actions = (await this.sessions.loadActions(sessionId)).map((a) => a.action)
    const baseline = (await this.sessions.loadSnapshots(sessionId)).find((s) => s.actionIndex === 0)?.state
    return { format: 'aerofms-session', version: 1, state: loaded.state, actions, baseline }
  }

  /** Imports an exported session (new id) and returns its id. */
  async import(data: SessionExport): Promise<string> {
    if (data.format !== 'aerofms-session' || !this.opts.registry.get(data.state.aircraft.aircraftId)) {
      throw new Error('INVALID_SESSION_FILE')
    }
    const id = createId('s-')
    const remap = (s: FmsState): FmsState => ({ ...s, session: { ...s.session, sessionId: id } })
    const state = remap(data.state)
    await this.sessions.save(state)
    if (data.baseline) {
      await this.sessions.saveSnapshot(id, 0, remap(data.baseline))
      await this.sessions.appendActions(id, data.actions.map((action, index) => ({ index, action })), [])
    }
    return id
  }

  /** Builds a replay controller from the persisted baseline + action log. */
  async loadReplay(sessionId: string): Promise<ReplayController | undefined> {
    await this.flush()
    const snapshots = await this.sessions.loadSnapshots(sessionId)
    const baseline = snapshots.find((s) => s.actionIndex === 0)?.state
    if (!baseline) return undefined
    const adapter = this.opts.registry.get(baseline.aircraft.aircraftId)
    if (!adapter) return undefined
    const actions = (await this.sessions.loadActions(sessionId)).map((a) => a.action)
    return new ReplayController({ baseline, actions }, { nav: this.opts.nav, adapter, simulator: this.opts.simulator })
  }
}
