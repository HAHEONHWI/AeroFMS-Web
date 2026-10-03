import { buildDemoDataset, InMemoryNavigationProvider } from '@aerofms/navigation'
import { FmsEngine, composeDisplay } from '@aerofms/core'
import type { FmsAction, FmsActionInput, LskId, SimulationStepper } from '@aerofms/core'
import { createAircraftRegistry } from '../src'

export const nav = new InMemoryNavigationProvider(buildDemoDataset())
export const registry = createAircraftRegistry()

export class Pilot {
  readonly engine: FmsEngine
  t = Date.UTC(2026, 9, 3, 1, 0, 0)

  constructor(aircraftId: string, simulator?: SimulationStepper) {
    const adapter = registry.get(aircraftId)
    if (!adapter) throw new Error(aircraftId)
    const state = adapter.initialize({ sessionId: 'test-session', name: 'Test', now: this.t, nav })
    this.engine = new FmsEngine({ nav, adapter, simulator }, state)
  }

  get state() {
    return this.engine.state
  }

  dispatch(a: FmsActionInput) {
    this.t += 1000
    return this.engine.dispatch({ ...a, t: this.t } as FmsAction)
  }

  key(k: string) {
    return this.dispatch({ type: 'KEY', key: k })
  }

  type(text: string) {
    for (const ch of text) this.key(ch === ' ' ? 'SP' : ch)
  }

  lsk(l: LskId) {
    return this.dispatch({ type: 'LSK', lsk: l })
  }

  /** Types text then presses an LSK. */
  enter(text: string, l: LskId) {
    this.type(text)
    return this.lsk(l)
  }

  get scratchpad(): string {
    return this.engine.adapter.scratchpadDisplay(this.state).text
  }

  screen(): string[] {
    const page = this.engine.adapter.renderPage(this.state, nav)
    return composeDisplay(page, this.engine.adapter.scratchpadDisplay(this.state)).lines.map((l) => l.text)
  }

  legIdents(which: 'active' | 'mod' = 'active'): string[] {
    const plan = which === 'mod' ? this.state.modifiedFlightPlan : this.state.activeFlightPlan
    return (plan?.elements ?? []).map((e) => (e.kind === 'LEG' ? e.waypoint.ident : '--DISCO--'))
  }
}
