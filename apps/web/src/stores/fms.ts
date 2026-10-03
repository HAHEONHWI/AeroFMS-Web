import { create } from 'zustand'
import type { FmsActionInput, FmsEngine, FmsEvent, FmsState } from '@aerofms/core'
import { services } from '@/services/runtime'
import { track } from '@/services/analytics'

export type OpenResult = 'ok' | 'corrupted' | 'notfound' | 'unknown'

interface FmsStore {
  engine?: FmsEngine
  state?: FmsState
  /** Session state when it was opened (used for "switch without saving"). */
  checkpoint?: FmsState
  lastEvents: FmsEvent[]
  eventLog: FmsEvent[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  openAircraft(aircraftId: string): Promise<void>
  openSession(id: string): Promise<OpenResult>
  newSession(aircraftId: string, opts?: { name?: string; airport?: string }): Promise<void>
  switchAircraft(target: string, mode: 'save' | 'discard'): Promise<void>
  dispatch(action: FmsActionInput): FmsEvent[]
  resetSession(): Promise<void>
  deleteSession(id: string): Promise<void>
  restoreFromLatest(): Promise<void>
}

let unsubscribe: (() => void) | undefined
let detachPersistence: (() => void) | undefined
let simTimer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<(u: Parameters<Parameters<FmsEngine['subscribe']>[0]>[0]) => void>()

/** Subscribe to every engine update of whichever session is open (training, sync, analytics). */
export function onEngineUpdate(fn: (u: Parameters<Parameters<FmsEngine['subscribe']>[0]>[0]) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const SIM_TICK_MS = 500

function updateSimTicker(state: FmsState | undefined): void {
  const running = state?.simulation.status === 'RUNNING' && state.simulation.source === 'STANDALONE'
  if (running && !simTimer) {
    simTimer = setInterval(() => useFms.getState().dispatch({ type: 'SIM_TICK', dtSec: SIM_TICK_MS / 1000 }), SIM_TICK_MS)
  } else if (!running && simTimer) {
    clearInterval(simTimer)
    simTimer = undefined
  }
}

export const useFms = create<FmsStore>((set, get) => {
  const attach = (engine: FmsEngine): void => {
    unsubscribe?.()
    detachPersistence?.()
    const svc = services()
    detachPersistence = svc.sessions.attach(engine)
    unsubscribe = engine.subscribe((u) => {
      const log = get().eventLog
      const nextLog = u.events.length ? [...log.slice(-499), ...u.events] : log
      set({ state: u.state, lastEvents: u.events, eventLog: nextLog })
      updateSimTicker(u.state)
      for (const l of listeners) l(u)
    })
    set({ engine, state: engine.state, checkpoint: engine.state, status: 'ready', error: undefined, lastEvents: [], eventLog: [] })
    updateSimTicker(engine.state)
    track('emulator_started', { aircraft_id: engine.state.aircraft.aircraftId, platform: 'web' })
  }

  return {
    lastEvents: [],
    eventLog: [],
    status: 'idle',
    async openAircraft(aircraftId) {
      set({ status: 'loading' })
      try {
        const engine = await services().sessions.openOrCreateForAircraft(aircraftId)
        attach(engine)
        track('aircraft_selected', { aircraft_id: aircraftId })
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    },
    async openSession(id) {
      set({ status: 'loading' })
      const r = await services().sessions.open(id)
      if (r.ok) {
        attach(r.engine)
        return 'ok'
      }
      set({ status: get().engine ? 'ready' : 'idle' })
      return r.reason === 'CORRUPTED' ? 'corrupted' : r.reason === 'NOT_FOUND' ? 'notfound' : 'unknown'
    },
    async newSession(aircraftId, opts = {}) {
      set({ status: 'loading' })
      await services().sessions.flush()
      const engine = await services().sessions.create(aircraftId, opts.name)
      attach(engine)
      if (opts.airport) {
        const icao = opts.airport.trim().toUpperCase()
        get().dispatch({ type: 'COMMAND', command: { kind: 'SET_POSITION_FROM_AIRPORT', icao } })
        get().dispatch({ type: 'COMMAND', command: { kind: 'SET_ORIGIN', icao } })
      }
    },
    async switchAircraft(target, mode) {
      const { checkpoint, state } = get()
      if (mode === 'discard' && checkpoint && state) await services().sessions.discardSince(checkpoint)
      else await services().sessions.flush()
      await get().openAircraft(target)
    },
    dispatch(action) {
      const engine = get().engine
      if (!engine) return []
      return engine.dispatch({ ...action, t: Date.now() } as never)
    },
    async resetSession() {
      const st = get().state
      if (!st) return
      const engine = await services().sessions.reset(st.session.sessionId)
      if (engine) attach(engine)
    },
    async deleteSession(id) {
      const current = get().state
      await services().sessions.delete(id)
      if (current?.session.sessionId === id) {
        await get().openAircraft(current.aircraft.aircraftId)
      }
    },
    async restoreFromLatest() {
      const st = get().state
      if (!st) return
      await get().openSession(st.session.sessionId)
    },
  }
})
