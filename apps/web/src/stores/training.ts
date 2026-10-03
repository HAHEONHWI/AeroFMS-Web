import { create } from 'zustand'
import { LessonRunner, ScenarioRunner } from '@aerofms/training'
import type { AttemptResult, Lesson, Scenario, TrainingFeedback } from '@aerofms/training'
import { createId } from '@aerofms/shared'
import { getFirebase } from '@/platform/firebase'
import { ScenarioCloud } from '@aerofms/cloud'
import { services } from '@/services/runtime'
import { track } from '@/services/analytics'
import { onEngineUpdate, useFms } from './fms'
import { useSettings } from './settings'
import { useAuth } from './auth'

type Active =
  | { kind: 'LESSON'; lesson: Lesson; runner: LessonRunner }
  | { kind: 'SCENARIO'; scenario: Scenario; runner: ScenarioRunner; cloud: boolean }

interface TrainingStore {
  active?: Active
  feedback: TrainingFeedback[]
  latest?: TrainingFeedback
  result?: AttemptResult
  revision: number
  startLesson(lesson: Lesson): Promise<void>
  startScenario(scenario: Scenario, opts?: { cloud?: boolean }): Promise<void>
  /** Records a hint use. Returns the scenario hint index (scenarios) or -1. */
  requestHint(): number
  dismissFeedback(): void
  stop(): void
}

let unsub: (() => void) | undefined

export const useTraining = create<TrainingStore>((set, get) => {
  const observe = () => {
    unsub?.()
    unsub = onEngineUpdate((u) => {
      const a = get().active
      if (!a || u.state.session.sessionId !== useFms.getState().state?.session.sessionId) return
      const fb = a.runner.observe(u)
      if (!fb.length) return
      const done = fb.find((f) => f.kind === 'COMPLETED')
      set({ feedback: [...get().feedback, ...fb].slice(-50), latest: fb[fb.length - 1], revision: get().revision + 1 })
      if (done && done.kind === 'COMPLETED') void finish(done.result)
    })
  }

  const finish = async (result: AttemptResult): Promise<void> => {
    const a = get().active
    if (!a) return
    set({ result })
    const s = services()
    if (a.kind === 'LESSON') {
      const prev = (await s.progress.list()).find((r) => r.lessonId === a.lesson.id)
      await s.progress.save({
        lessonId: a.lesson.id,
        status: 'COMPLETED',
        bestScore: Math.max(prev?.bestScore ?? 0, result.score),
        lastScore: result.score,
        attempts: (prev?.attempts ?? 0) + 1,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      })
      await s.outbox.enqueue('trainingProgress', a.lesson.id, 'UPSERT')
      track('lesson_completed', { lesson_id: a.lesson.id, score: result.score })
    } else {
      await s.attempts.add({ id: createId('a-'), scenarioId: a.scenario.id, createdAt: Date.now(), ...result })
      track('scenario_completed', { scenario_type: a.scenario.builtIn ? 'builtin' : 'user', score: result.score })
      const fb = getFirebase()
      const user = useAuth.getState().user
      if (a.cloud && fb && user) {
        await new ScenarioCloud(fb.db, fb.functions).submitAttempt(a.scenario.id, user.uid, user.displayName, result).catch((e) => console.warn('attempt upload failed', e))
      }
    }
  }

  const prepareSession = async (aircraftId: string, name: string, setup: Lesson['setup']): Promise<void> => {
    await useFms.getState().newSession(aircraftId, { name })
    for (const command of setup) useFms.getState().dispatch({ type: 'COMMAND', command })
  }

  return {
    feedback: [],
    revision: 0,
    async startLesson(lesson) {
      const s = services()
      const adapter = s.registry.get(lesson.aircraftId)
      if (!adapter) return
      await prepareSession(lesson.aircraftId, `Lesson · ${lesson.id}`, lesson.setup)
      const runner = new LessonRunner(lesson, adapter, s.nav, useSettings.getState().settings.trainingLevel)
      const st = useFms.getState().state
      if (st) runner.sync(st)
      const prev = (await s.progress.list()).find((r) => r.lessonId === lesson.id)
      await s.progress.save({
        lessonId: lesson.id,
        status: prev?.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
        bestScore: prev?.bestScore ?? 0,
        lastScore: prev?.lastScore ?? 0,
        attempts: prev?.attempts ?? 0,
        completedAt: prev?.completedAt,
        updatedAt: Date.now(),
      })
      set({ active: { kind: 'LESSON', lesson, runner }, feedback: [], latest: undefined, result: undefined, revision: get().revision + 1 })
      observe()
      track('lesson_started', { lesson_id: lesson.id, aircraft_id: lesson.aircraftId })
    },
    async startScenario(scenario, opts = {}) {
      const s = services()
      const adapter = s.registry.get(scenario.aircraftId)
      if (!adapter) return
      await prepareSession(scenario.aircraftId, `Scenario · ${scenario.id}`, scenario.setup)
      const runner = new ScenarioRunner(scenario, adapter, s.nav)
      set({ active: { kind: 'SCENARIO', scenario, runner, cloud: !!opts.cloud }, feedback: [], latest: undefined, result: undefined, revision: get().revision + 1 })
      observe()
      track('scenario_started', { scenario_type: scenario.builtIn ? 'builtin' : 'user', aircraft_id: scenario.aircraftId })
    },
    requestHint() {
      const a = get().active
      if (!a) return -1
      const idx = a.kind === 'SCENARIO' ? a.runner.takeHint() : (a.runner.takeHint(), -1)
      set({ revision: get().revision + 1 })
      return idx
    },
    dismissFeedback() {
      set({ latest: undefined })
    },
    stop() {
      unsub?.()
      unsub = undefined
      set({ active: undefined, feedback: [], latest: undefined, result: undefined })
    },
  }
})
