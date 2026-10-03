import type { FmsAction, FmsEvent } from '../events/types'
import type { FmsState } from '../state/types'
import { reduceFmsAction } from './reducer'
import type { EngineDeps } from './reducer'

export interface EngineUpdate {
  state: FmsState
  previous: FmsState
  action: FmsAction
  events: FmsEvent[]
}

export type EngineListener = (update: EngineUpdate) => void

/** Stateful wrapper around the pure reducer. Framework independent (used by web, Android, tests). */
export class FmsEngine {
  private current: FmsState
  private readonly listeners = new Set<EngineListener>()

  constructor(
    readonly deps: EngineDeps,
    initial: FmsState,
  ) {
    this.current = initial
  }

  get state(): FmsState {
    return this.current
  }

  get adapter(): EngineDeps['adapter'] {
    return this.deps.adapter
  }

  dispatch(action: FmsAction): FmsEvent[] {
    const previous = this.current
    const { state, events } = reduceFmsAction(previous, action, this.deps)
    this.current = state
    const update: EngineUpdate = { state, previous, action, events }
    for (const l of this.listeners) {
      try {
        l(update)
      } catch (e) {
        // Listener failures (persistence, analytics) must never break FMC input.
        console.error('[FmsEngine] listener error', e)
      }
    }
    return events
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Replaces the state (session restore, replay seek). Does not notify action listeners. */
  load(state: FmsState): void {
    this.current = state
  }
}
