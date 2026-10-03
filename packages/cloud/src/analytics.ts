/**
 * Privacy-preserving analytics. Only whitelisted events and parameters are sent;
 * flight plans, FMC entries and free text are never included.
 */
export type AnalyticsEvent =
  | 'aircraft_selected'
  | 'emulator_started'
  | 'lesson_started'
  | 'lesson_completed'
  | 'scenario_started'
  | 'scenario_completed'
  | 'simulator_connected'
  | 'language_changed'
  | 'view_mode_changed'
  | 'simulation_started'
  | 'replay_opened'

const ALLOWED_PARAMS: Record<AnalyticsEvent, string[]> = {
  aircraft_selected: ['aircraft_id'],
  emulator_started: ['aircraft_id', 'platform'],
  lesson_started: ['lesson_id', 'aircraft_id'],
  lesson_completed: ['lesson_id', 'score'],
  scenario_started: ['scenario_type', 'aircraft_id'],
  scenario_completed: ['scenario_type', 'score'],
  simulator_connected: ['simulator'],
  language_changed: ['language'],
  view_mode_changed: ['mode'],
  simulation_started: ['aircraft_id'],
  replay_opened: [],
}

export type AnalyticsParams = Record<string, string | number | boolean>

export interface AnalyticsSink {
  log(event: string, params: AnalyticsParams): void
  setEnabled(enabled: boolean): void
}

export function sanitizeAnalyticsParams(event: AnalyticsEvent, params: AnalyticsParams = {}): AnalyticsParams {
  const allowed = new Set(ALLOWED_PARAMS[event])
  const out: AnalyticsParams = {}
  for (const [k, v] of Object.entries(params)) {
    if (!allowed.has(k)) continue
    if (typeof v === 'string') out[k] = v.slice(0, 40)
    else out[k] = v
  }
  return out
}

export class Analytics {
  private enabled = false
  constructor(private readonly sinks: AnalyticsSink[]) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    for (const s of this.sinks) s.setEnabled(enabled)
  }

  track(event: AnalyticsEvent, params?: AnalyticsParams): void {
    if (!this.enabled) return
    const clean = sanitizeAnalyticsParams(event, params)
    for (const s of this.sinks) {
      try {
        s.log(event, clean)
      } catch {
        // analytics must never affect the app
      }
    }
  }
}
