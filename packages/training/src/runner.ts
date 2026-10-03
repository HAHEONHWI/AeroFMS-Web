import type { NavigationProvider } from '@aerofms/navigation'
import type { AircraftFmsAdapter, EngineUpdate, FmsState } from '@aerofms/core'
import { evaluateCondition } from './conditions'
import { analyzeMistake } from './mistakes'
import type { MistakeExplanation } from './mistakes'
import type { AttemptResult, Lesson, LessonStep, Scenario, UserLevel } from './model'
import { k } from './text'
import type { LocalizedText } from './text'

export type TrainingFeedback =
  | { kind: 'STEP_DONE'; stepIndex: number }
  | { kind: 'WRONG_PAGE'; message: LocalizedText }
  | { kind: 'MISTAKE'; mistake: MistakeExplanation }
  | { kind: 'OBJECTIVE_DONE'; objectiveId: string }
  | { kind: 'COMPLETED'; result: AttemptResult }

interface Counters {
  startedAt: number
  correctInputs: number
  incorrectInputs: number
  hintsUsed: number
  mistakes: MistakeExplanation[]
}

function scoreOf(completion: number, c: Counters): number {
  return Math.max(0, Math.min(100, Math.round(completion * 100 - c.incorrectInputs * 4 - c.hintsUsed * 3)))
}

const isInputAction = (u: EngineUpdate): boolean => u.action.type === 'KEY' || u.action.type === 'LSK' || u.action.type === 'TEXT' || u.action.type === 'COMMAND'

/**
 * Guided lesson runner. It only observes engine updates: the emulator keeps its normal
 * behaviour, while the runner tracks progress and produces learner feedback.
 */
export class LessonRunner {
  stepIndex = 0
  completed = false
  readonly counters: Counters
  lastFeedback?: TrainingFeedback

  constructor(
    readonly lesson: Lesson,
    private readonly adapter: AircraftFmsAdapter,
    private readonly nav: NavigationProvider,
    readonly level: UserLevel = 'BEGINNER',
    now = Date.now(),
  ) {
    this.counters = { startedAt: now, correctInputs: 0, incorrectInputs: 0, hintsUsed: 0, mistakes: [] }
  }

  get currentStep(): LessonStep | undefined {
    return this.lesson.steps[this.stepIndex]
  }

  /** Re-evaluates without an action (e.g. after setup) and auto-advances satisfied steps. */
  sync(state: FmsState): void {
    while (!this.completed && this.currentStep && evaluateCondition(this.currentStep.expect, state)) this.advance()
  }

  private advance(): void {
    this.stepIndex++
    if (this.stepIndex >= this.lesson.steps.length) this.completed = true
  }

  observe(update: EngineUpdate, now = Date.now()): TrainingFeedback[] {
    if (this.completed) return []
    const out: TrainingFeedback[] = []
    for (const e of update.events) {
      if (e.type !== 'ERROR' || e.detail === 'INTERNAL') continue
      const mistake = analyzeMistake(update, e, this.adapter, this.nav)
      this.counters.incorrectInputs++
      this.counters.mistakes.push(mistake)
      out.push({ kind: 'MISTAKE', mistake })
    }
    const step = this.currentStep
    let progressed = false
    while (this.currentStep && evaluateCondition(this.currentStep.expect, update.state)) {
      out.push({ kind: 'STEP_DONE', stepIndex: this.stepIndex })
      this.advance()
      progressed = true
      if (this.completed) break
    }
    if (progressed && isInputAction(update)) this.counters.correctInputs++
    if (!progressed && step && isInputAction(update) && !out.length) {
      const expectedPage = step.expectedPage ?? (step.expect.kind === 'PAGE' ? step.expect.pageId : undefined)
      if (expectedPage && update.state.currentPage.pageId !== expectedPage && update.previous.currentPage.pageId !== update.state.currentPage.pageId) {
        this.counters.incorrectInputs++
        out.push({ kind: 'WRONG_PAGE', message: k('training.wrongPage', { page: expectedPage.replace(/_/g, ' ') }) })
      }
    }
    if (this.completed) out.push({ kind: 'COMPLETED', result: this.result(now) })
    this.lastFeedback = out[out.length - 1] ?? this.lastFeedback
    return out
  }

  takeHint(): LocalizedText | undefined {
    const step = this.currentStep
    if (!step) return undefined
    this.counters.hintsUsed++
    return step.hint ?? step.detail ?? step.instruction
  }

  result(now = Date.now()): AttemptResult {
    const completion = this.lesson.steps.length ? Math.min(1, this.stepIndex / this.lesson.steps.length) : 1
    return {
      score: scoreOf(completion, this.counters),
      correctInputs: this.counters.correctInputs,
      incorrectInputs: this.counters.incorrectInputs,
      hintsUsed: this.counters.hintsUsed,
      timeSec: Math.round((now - this.counters.startedAt) / 1000),
      completionPct: Math.round(completion * 100),
      completedObjectives: this.lesson.steps.slice(0, this.stepIndex).map((s) => s.id),
    }
  }
}

/** Scenario runner: objectives can be completed in any order. */
export class ScenarioRunner {
  readonly done = new Set<string>()
  readonly counters: Counters
  completed = false

  constructor(
    readonly scenario: Scenario,
    private readonly adapter: AircraftFmsAdapter,
    private readonly nav: NavigationProvider,
    now = Date.now(),
  ) {
    this.counters = { startedAt: now, correctInputs: 0, incorrectInputs: 0, hintsUsed: 0, mistakes: [] }
  }

  observe(update: EngineUpdate, now = Date.now()): TrainingFeedback[] {
    if (this.completed) return []
    const out: TrainingFeedback[] = []
    for (const e of update.events) {
      if (e.type !== 'ERROR' || e.detail === 'INTERNAL') continue
      const mistake = analyzeMistake(update, e, this.adapter, this.nav)
      this.counters.incorrectInputs++
      this.counters.mistakes.push(mistake)
      out.push({ kind: 'MISTAKE', mistake })
    }
    let any = false
    for (const o of this.scenario.objectives) {
      if (this.done.has(o.id)) continue
      if (evaluateCondition(o.condition, update.state)) {
        this.done.add(o.id)
        any = true
        out.push({ kind: 'OBJECTIVE_DONE', objectiveId: o.id })
      }
    }
    if (any && isInputAction(update)) this.counters.correctInputs++
    if (this.done.size === this.scenario.objectives.length) {
      this.completed = true
      out.push({ kind: 'COMPLETED', result: this.result(now) })
    }
    return out
  }

  takeHint(): number {
    this.counters.hintsUsed++
    return Math.min(this.counters.hintsUsed, this.scenario.hints.length) - 1
  }

  result(now = Date.now()): AttemptResult {
    const total = this.scenario.objectives.reduce((s, o) => s + o.points, 0) || 1
    const earned = this.scenario.objectives.filter((o) => this.done.has(o.id)).reduce((s, o) => s + o.points, 0)
    const completion = earned / total
    return {
      score: scoreOf(completion, this.counters),
      correctInputs: this.counters.correctInputs,
      incorrectInputs: this.counters.incorrectInputs,
      hintsUsed: this.counters.hintsUsed,
      timeSec: Math.round((now - this.counters.startedAt) / 1000),
      completionPct: Math.round(completion * 100),
      completedObjectives: [...this.done],
    }
  }
}
