import { describe, expect, it } from 'vitest'
import { buildDemoDataset, InMemoryNavigationProvider } from '@aerofms/navigation'
import { FmsEngine } from '@aerofms/core'
import type { FmsActionInput, FmsCommand } from '@aerofms/core'
import { createAircraftRegistry } from '@aerofms/aircraft'
import { StandaloneSimulator } from '../src'

const nav = new InMemoryNavigationProvider(buildDemoDataset())
const registry = createAircraftRegistry()

function makeEngine(aircraftId: string) {
  const adapter = registry.get(aircraftId)
  if (!adapter) throw new Error('no adapter')
  let t = Date.UTC(2026, 9, 3, 0, 0, 0)
  const engine = new FmsEngine({ nav, adapter, simulator: new StandaloneSimulator() }, adapter.initialize({ sessionId: 'sim', name: 'sim', now: t, nav }))
  const dispatch = (a: FmsActionInput) => {
    t += 1000
    return engine.dispatch({ ...a, t } as never)
  }
  const cmd = (command: FmsCommand) => dispatch({ type: 'COMMAND', command })
  return { engine, dispatch, cmd }
}

function setupRksiRkpk(cmd: (c: FmsCommand) => unknown) {
  cmd({ kind: 'SET_ORIGIN', icao: 'RKSI' })
  cmd({ kind: 'SET_DESTINATION', icao: 'RKPK' })
  cmd({ kind: 'SET_DEPARTURE_RUNWAY', runway: '33L' })
  cmd({ kind: 'SET_SID', procedureId: 'RKSI-SID-BULTI1J' })
  cmd({ kind: 'APPEND_ROUTE', via: 'Y711', to: 'OSN' })
  cmd({ kind: 'APPEND_ROUTE', via: 'Y722', to: 'KALOD' })
  cmd({ kind: 'SET_STAR', procedureId: 'RKPK-STAR-KALOD1A' })
  cmd({ kind: 'SET_APPROACH', procedureId: 'RKPK-APP-ILS36L', transition: 'DOTOL' })
  cmd({ kind: 'SET_ZFW', value: '58.0' })
  cmd({ kind: 'SET_FUEL', value: '9.5' })
  cmd({ kind: 'SET_RESERVES', value: '2.5' })
  cmd({ kind: 'SET_COST_INDEX', value: '30' })
  cmd({ kind: 'SET_CRUISE_ALTITUDE', value: 'FL250' })
}

describe('standalone simulation', () => {
  it('flies a 737 from RKSI to RKPK through every phase and lands', () => {
    const { engine, dispatch, cmd } = makeEngine('B737-800')
    setupRksiRkpk(cmd)
    // Boeing: activate + EXEC
    dispatch({ type: 'KEY', key: 'RTE' })
    dispatch({ type: 'LSK', lsk: '6R' })
    dispatch({ type: 'KEY', key: 'EXEC' })
    expect(engine.state.activeFlightPlan.activated).toBe(true)
    expect(engine.state.activeFlightPlan.elements.some((e) => e.kind === 'DISCONTINUITY')).toBe(false)

    dispatch({ type: 'SIM_CONTROL', control: { kind: 'START' } })
    dispatch({ type: 'SIM_CONTROL', control: { kind: 'SET_SPEED', timeScale: 16 } })
    expect(engine.state.simulation.status).toBe('RUNNING')
    const phases = new Set<string>()
    let maxAlt = 0
    for (let i = 0; i < 4000 && engine.state.simulation.status === 'RUNNING'; i++) {
      dispatch({ type: 'SIM_TICK', dtSec: 2 })
      phases.add(engine.state.flightPhase)
      maxAlt = Math.max(maxAlt, engine.state.position.altitudeFt)
    }
    const s = engine.state
    expect([...phases]).toEqual(expect.arrayContaining(['TAKEOFF', 'CLIMB', 'CRUISE', 'DESCENT', 'APPROACH', 'LANDED']))
    expect(maxAlt).toBeGreaterThan(24500)
    expect(s.simulation.status).toBe('COMPLETED')
    expect(s.simulation.fuelUsedKg).toBeGreaterThan(1000)
    expect(s.simulation.fuelUsedKg).toBeLessThan(6000)
    const rkpk = nav.searchAirport('RKPK')
    expect(rkpk).toBeDefined()
    // Landed close to the runway threshold
    const rw = rkpk?.runways.find((r) => r.ident === '36L')
    expect(rw).toBeDefined()
    const d = Math.hypot((s.position.aircraft?.lat ?? 0) - (rw?.lat ?? 0), (s.position.aircraft?.lon ?? 0) - (rw?.lon ?? 0))
    expect(d).toBeLessThan(0.05)
  })

  it('A320 does not require EXEC and flies the route', () => {
    const { engine, dispatch, cmd } = makeEngine('A320-NEO')
    setupRksiRkpk(cmd)
    dispatch({ type: 'SIM_CONTROL', control: { kind: 'START' } })
    dispatch({ type: 'SIM_CONTROL', control: { kind: 'SET_SPEED', timeScale: 16 } })
    for (let i = 0; i < 600 && engine.state.simulation.status === 'RUNNING'; i++) dispatch({ type: 'SIM_TICK', dtSec: 2 })
    expect(['CLIMB', 'CRUISE', 'DESCENT', 'APPROACH', 'LANDED']).toContain(engine.state.flightPhase)
    expect(engine.state.activeFlightPlan.activeLegIndex).toBeGreaterThan(3)
  })

  it('pauses and resumes', () => {
    const { engine, dispatch, cmd } = makeEngine('A320-NEO')
    setupRksiRkpk(cmd)
    dispatch({ type: 'SIM_CONTROL', control: { kind: 'START' } })
    dispatch({ type: 'SIM_TICK', dtSec: 5 })
    dispatch({ type: 'SIM_CONTROL', control: { kind: 'PAUSE' } })
    const before = engine.state.position.aircraft
    dispatch({ type: 'SIM_TICK', dtSec: 5 })
    expect(engine.state.position.aircraft).toEqual(before)
    dispatch({ type: 'SIM_CONTROL', control: { kind: 'RESUME' } })
    dispatch({ type: 'SIM_TICK', dtSec: 5 })
    expect(engine.state.position.aircraft).not.toEqual(before)
  })
})
