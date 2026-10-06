import { describe, expect, it } from 'vitest'
import { buildDemoDataset, InMemoryNavigationProvider } from '@aerofms/navigation'
import { FmsEngine } from '@aerofms/core'
import type { FmsActionInput, FmsCommand } from '@aerofms/core'
import { createAircraftRegistry } from '@aerofms/aircraft'
import { BUILTIN_LESSONS, BUILTIN_SCENARIOS, LessonRunner, ScenarioRunner, lessonById, scenarioById, validateScenario } from '../src'
import type { TrainingFeedback } from '../src'

const nav = new InMemoryNavigationProvider(buildDemoDataset())
const registry = createAircraftRegistry()

function session(aircraftId: string, setup: FmsCommand[] = []) {
  const adapter = registry.get(aircraftId)!
  let t = 1000
  const engine = new FmsEngine({ nav, adapter }, adapter.initialize({ sessionId: 'tr', name: 'tr', now: t, nav }))
  const feedback: TrainingFeedback[] = []
  let observer: ((u: Parameters<Parameters<FmsEngine['subscribe']>[0]>[0]) => void) | undefined
  engine.subscribe((u) => observer?.(u))
  const dispatch = (a: FmsActionInput) => engine.dispatch({ ...a, t: (t += 1000) } as never)
  for (const command of setup) dispatch({ type: 'COMMAND', command })
  return {
    engine,
    adapter,
    dispatch,
    feedback,
    observe: (fn: typeof observer) => (observer = fn),
    type: (s: string) => [...s].forEach((c) => dispatch({ type: 'KEY', key: c })),
  }
}

describe('Academy lessons', () => {
  it('every built-in lesson targets a registered aircraft and has steps', () => {
    for (const l of BUILTIN_LESSONS) {
      expect(registry.get(l.aircraftId)).toBeDefined()
      expect(l.steps.length).toBeGreaterThan(2)
    }
  })

  it('completes "FMC basics" with correct feedback, wrong-page guidance and mistake analysis', () => {
    const lesson = lessonById('fmcBasics737')!
    const s = session(lesson.aircraftId, lesson.setup)
    const runner = new LessonRunner(lesson, s.adapter, nav, 'BEGINNER', 0)
    s.observe((u) => s.feedback.push(...runner.observe(u, 60_000)))
    runner.sync(s.engine.state)
    s.dispatch({ type: 'KEY', key: 'LEGS' }) // wrong page
    expect(s.feedback.some((f) => f.kind === 'WRONG_PAGE')).toBe(true)
    s.dispatch({ type: 'KEY', key: 'INIT_REF' })
    expect(runner.stepIndex).toBe(1)
    // Mistake: unknown airport
    s.type('RKZZ')
    s.dispatch({ type: 'LSK', lsk: '2L' })
    const mistake = s.feedback.find((f) => f.kind === 'MISTAKE')
    expect(mistake?.kind === 'MISTAKE' && mistake.mistake.code).toBe('NOT_IN_DATABASE')
    expect(mistake?.kind === 'MISTAKE' && mistake.mistake.suggestions.length).toBeGreaterThan(0)
    s.dispatch({ type: 'KEY_LONG', key: 'CLR' })
    s.type('RKSI')
    s.dispatch({ type: 'LSK', lsk: '2L' })
    s.dispatch({ type: 'LSK', lsk: '2R' })
    s.dispatch({ type: 'LSK', lsk: '4R' })
    s.type('ABC')
    s.dispatch({ type: 'KEY', key: 'CLR' })
    s.dispatch({ type: 'KEY_LONG', key: 'CLR' })
    s.dispatch({ type: 'LSK', lsk: '6R' })
    expect(runner.completed).toBe(true)
    const done = s.feedback.find((f) => f.kind === 'COMPLETED')
    expect(done?.kind === 'COMPLETED' && done.result.completionPct).toBe(100)
    expect(done?.kind === 'COMPLETED' && done.result.incorrectInputs).toBe(2)
  })

  it('every lesson setup applies without errors', () => {
    for (const l of BUILTIN_LESSONS) {
      const s = session(l.aircraftId)
      const errors: string[] = []
      for (const command of l.setup) {
        const ev = s.dispatch({ type: 'COMMAND', command })
        errors.push(...ev.filter((e) => e.type === 'ERROR').map((e) => `${l.id}:${command.kind}:${e.detail}`))
      }
      expect(errors).toEqual([])
    }
  })
})

describe('Scenario training', () => {
  it('scores the Seoul → Busan scenario', () => {
    const sc = scenarioById('seoulBusan737')!
    const s = session(sc.aircraftId, sc.setup)
    const runner = new ScenarioRunner(sc, s.adapter, nav, 0)
    s.observe((u) => s.feedback.push(...runner.observe(u, 600_000)))
    const cmds: FmsCommand[] = [
      { kind: 'SET_POSITION_FROM_AIRPORT', icao: 'RKSI' },
      { kind: 'SET_ORIGIN', icao: 'RKSI' },
      { kind: 'SET_DESTINATION', icao: 'RKPK' },
      { kind: 'SET_DEPARTURE_RUNWAY', runway: '33L' },
      { kind: 'SET_SID', procedureId: 'RKSI-SID-BULTI1J' },
      { kind: 'APPEND_ROUTE', via: 'Y711', to: 'OSN' },
      { kind: 'APPEND_ROUTE', via: 'Y722', to: 'KALOD' },
      { kind: 'SET_STAR', procedureId: 'RKPK-STAR-KALOD1A' },
      { kind: 'SET_APPROACH', procedureId: 'RKPK-APP-ILS36L', transition: 'DOTOL' },
      { kind: 'SET_ZFW', value: '58' },
      { kind: 'SET_FUEL', value: '9.5' },
      { kind: 'SET_COST_INDEX', value: '30' },
      { kind: 'SET_CRUISE_ALTITUDE', value: 'FL250' },
    ]
    for (const command of cmds) s.dispatch({ type: 'COMMAND', command })
    s.dispatch({ type: 'OPEN_PAGE', pageId: 'TAKEOFF_REF' })
    s.type('5')
    s.dispatch({ type: 'LSK', lsk: '1L' })
    s.dispatch({ type: 'LSK', lsk: '1R' })
    s.dispatch({ type: 'LSK', lsk: '2R' })
    s.dispatch({ type: 'LSK', lsk: '3R' })
    s.dispatch({ type: 'KEY', key: 'RTE' })
    s.dispatch({ type: 'LSK', lsk: '6R' })
    s.dispatch({ type: 'KEY', key: 'EXEC' })
    expect(runner.completed).toBe(true)
    const r = runner.result(600_000)
    expect(r.completionPct).toBe(100)
    expect(r.score).toBe(100)
    expect(r.timeSec).toBe(600)
  })

  it('validates user scenarios', () => {
    const ok = validateScenario({
      id: 'u1',
      title: { text: '나만의 시나리오' },
      description: { text: 'desc' },
      aircraftId: 'A320-NEO',
      difficulty: 'EASY',
      language: 'ko',
      visibility: 'PRIVATE',
      setup: [{ kind: 'SET_ORIGIN', icao: 'RKSS' }],
      briefing: {},
      objectives: [{ id: 'o1', text: { text: 'Set destination' }, condition: { kind: 'DESTINATION', icao: 'RKPC' }, points: 10 }],
      hints: [],
    })
    expect(ok.ok).toBe(true)
    expect(validateScenario({ id: 'x', title: { key: 'injected' } }).ok).toBe(false)
    expect(validateScenario({ ...(ok.ok ? ok.scenario : {}), setup: [{ kind: 'LOAD_FLIGHT_PLAN' }] }).ok).toBe(false)
    expect(BUILTIN_SCENARIOS.length).toBeGreaterThanOrEqual(4)
  })
})

describe('runner snapshots', () => {
  it('restores lesson progress and counters after a restart', () => {
    const lesson = BUILTIN_LESSONS[0]!
    const s = session(lesson.aircraftId, lesson.setup)
    const runner = new LessonRunner(lesson, s.adapter, nav)
    s.observe((u) => runner.observe(u))
    s.dispatch({ type: 'KEY', key: 'INIT_REF' })
    s.dispatch({ type: 'LSK', lsk: '1L' }) // likely an unexpected input → counted
    runner.takeHint()
    const snap = JSON.parse(JSON.stringify(runner.snapshot()))

    const restored = new LessonRunner(lesson, s.adapter, nav)
    restored.restore(snap)
    expect(restored.stepIndex).toBe(runner.stepIndex)
    expect(restored.stepIndex).toBeGreaterThan(0)
    expect(restored.counters.hintsUsed).toBe(1)
    expect(restored.result().score).toBe(runner.result().score)
  })

  it('restores completed scenario objectives', () => {
    const scenario = BUILTIN_SCENARIOS[0]!
    const s = session(scenario.aircraftId, scenario.setup)
    const runner = new ScenarioRunner(scenario, s.adapter, nav)
    const first = scenario.objectives[0]!
    runner.restore({ done: [first.id, 'unknown'], completed: false, counters: { startedAt: 0, correctInputs: 2, incorrectInputs: 1, hintsUsed: 0, mistakes: [] } })
    expect([...runner.done]).toEqual([first.id])
    expect(runner.snapshot().counters.correctInputs).toBe(2)
  })
})
