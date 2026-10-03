import type { FmsAction, FmsEvent } from './types'
import type { FmsState } from '../state/types'
import { reduceFmsAction } from '../engine/reducer'
import type { EngineDeps } from '../engine/reducer'

export interface ReplayLog {
  /** State before the first logged action. */
  baseline: FmsState
  actions: FmsAction[]
}

export interface ReplayMarker {
  actionIndex: number
  t: number
  kind: 'ERROR' | 'EXEC' | 'PAGE' | 'ROUTE'
  detail: string
}

/**
 * Event-sourced replay. States are rebuilt by re-running the deterministic reducer from
 * the nearest in-memory checkpoint (periodic snapshots every `checkpointEvery` actions).
 */
export class ReplayController {
  private readonly checkpoints = new Map<number, FmsState>()
  private readonly allEvents: FmsEvent[] = []
  readonly markers: ReplayMarker[] = []

  constructor(
    private readonly log: ReplayLog,
    private readonly deps: EngineDeps,
    private readonly checkpointEvery = 25,
  ) {
    let state = log.baseline
    this.checkpoints.set(0, state)
    log.actions.forEach((action, i) => {
      const r = reduceFmsAction(state, action, deps)
      state = r.state
      for (const e of r.events) {
        const ev = { ...e, actionIndex: i }
        this.allEvents.push(ev)
        if (e.type === 'ERROR') this.markers.push({ actionIndex: i, t: e.t, kind: 'ERROR', detail: e.detail })
        else if (e.type === 'EXEC' || e.type === 'INSERT') this.markers.push({ actionIndex: i, t: e.t, kind: 'EXEC', detail: e.detail })
      }
      if ((i + 1) % checkpointEvery === 0) this.checkpoints.set(i + 1, state)
    })
    this.finalState = state
  }

  readonly finalState: FmsState

  get length(): number {
    return this.log.actions.length
  }

  get events(): FmsEvent[] {
    return this.allEvents
  }

  get startTime(): number {
    return this.log.actions[0]?.t ?? this.log.baseline.session.createdAt
  }

  get endTime(): number {
    return this.log.actions[this.log.actions.length - 1]?.t ?? this.startTime
  }

  /** Time of the action at `position` (number of applied actions). */
  timeAt(position: number): number {
    if (position <= 0) return this.startTime
    return this.log.actions[Math.min(position, this.length) - 1]?.t ?? this.endTime
  }

  /** State after applying the first `position` actions (0 = baseline). */
  stateAt(position: number): FmsState {
    const target = Math.max(0, Math.min(position, this.length))
    let base = 0
    for (const k of this.checkpoints.keys()) if (k <= target && k > base) base = k
    let state = this.checkpoints.get(base) ?? this.log.baseline
    for (let i = base; i < target; i++) {
      const a = this.log.actions[i]
      if (a) state = reduceFmsAction(state, a, this.deps).state
    }
    return state
  }

  /** Number of actions that happened at or before time `t`. */
  positionAtTime(t: number): number {
    let lo = 0
    let hi = this.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((this.log.actions[mid]?.t ?? Infinity) <= t) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  /** Real-time playback scheduling: delay (ms) before the next action at `speed`. */
  delayToNext(position: number, speed: number): number | undefined {
    const cur = this.log.actions[position - 1]
    const next = this.log.actions[position]
    if (!next) return undefined
    const dt = cur ? next.t - cur.t : 0
    return Math.min(3000, Math.max(16, dt / speed))
  }
}
