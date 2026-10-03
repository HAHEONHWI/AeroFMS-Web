import type { FmsState } from '../state/types'
import { FMS_STATE_SCHEMA_VERSION } from '../state/types'
import { defaultPerformance } from '../state/initial'

export class CorruptedStateError extends Error {
  constructor(reason: string) {
    super(`Corrupted FMS state: ${reason}`)
    this.name = 'CorruptedStateError'
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Validates a persisted FMS state and upgrades it to the current schema version.
 * Missing optional sub-structures are filled with defaults; structurally broken
 * states throw CorruptedStateError so the caller can offer recovery.
 */
export function upgradeFmsState(raw: unknown): FmsState {
  if (!isObj(raw)) throw new CorruptedStateError('not an object')
  const s = raw as Partial<FmsState> & Record<string, unknown>
  if (!isObj(s.aircraft) || typeof s.aircraft.aircraftId !== 'string') throw new CorruptedStateError('aircraft')
  if (!isObj(s.activeFlightPlan) || !Array.isArray(s.activeFlightPlan.elements)) throw new CorruptedStateError('activeFlightPlan')
  if (!isObj(s.session) || typeof s.session.sessionId !== 'string') throw new CorruptedStateError('session')
  const version = typeof s.schemaVersion === 'number' ? s.schemaVersion : 0
  if (version > FMS_STATE_SCHEMA_VERSION) throw new CorruptedStateError(`unsupported schema ${version}`)
  const perfDefaults = defaultPerformance()
  const perf = isObj(s.performance) ? (s.performance as FmsState['performance']) : perfDefaults
  return {
    ...(s as FmsState),
    schemaVersion: FMS_STATE_SCHEMA_VERSION,
    performance: {
      ...perfDefaults,
      ...perf,
      takeoff: { ...perfDefaults.takeoff, ...(perf.takeoff ?? {}) },
      climb: { ...perfDefaults.climb, ...(perf.climb ?? {}) },
      cruise: { ...perfDefaults.cruise, ...(perf.cruise ?? {}) },
      descent: { ...perfDefaults.descent, ...(perf.descent ?? {}) },
      approach: { ...perfDefaults.approach, ...(perf.approach ?? {}) },
    },
    messages: Array.isArray(s.messages) ? s.messages : [],
    simulation: { ...(s.simulation as FmsState['simulation']), phaseTimerSec: Number((s.simulation as Partial<FmsState['simulation']> | undefined)?.phaseTimerSec ?? 0) },
    scratchpad: isObj(s.scratchpad) ? (s.scratchpad as FmsState['scratchpad']) : { text: '', deleteMode: false },
    navigation: {
      fixInfo: [],
      radios: {},
      navDbCycle: '',
      navDbName: '',
      ...(isObj(s.navigation) ? (s.navigation as FmsState['navigation']) : {}),
    },
    session: {
      ...(s.session as FmsState['session']),
      idCounter: Number((s.session as Partial<FmsState['session']>).idCounter ?? 0),
      actionCount: Number((s.session as Partial<FmsState['session']>).actionCount ?? 0),
    },
  }
}
