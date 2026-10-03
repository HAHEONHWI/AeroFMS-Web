import type { FmsCommand, LskId } from '@aerofms/core'
import type { Condition } from './conditions'
import type { LocalizedText } from './text'

export type LessonCategory =
  | 'FMC_BASICS'
  | 'ROUTE_PROGRAMMING'
  | 'DEPARTURE'
  | 'ARRIVAL'
  | 'PERFORMANCE'
  | 'VNAV'
  | 'ROUTE_MODIFICATION'
  | 'HOLDS'
  | 'ADVANCED'
  | 'AIRBUS_FMGS'
  | 'BOEING_FMC'

export const LESSON_CATEGORIES: LessonCategory[] = [
  'FMC_BASICS',
  'ROUTE_PROGRAMMING',
  'DEPARTURE',
  'ARRIVAL',
  'PERFORMANCE',
  'VNAV',
  'ROUTE_MODIFICATION',
  'HOLDS',
  'ADVANCED',
  'AIRBUS_FMGS',
  'BOEING_FMC',
]

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'
export type UserLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'

export interface LessonStep {
  id: string
  instruction: LocalizedText
  /** Extra explanation shown to beginners. */
  detail?: LocalizedText
  hint?: LocalizedText
  /** Step completes when this condition becomes true. */
  expect: Condition
  /** Keys / LSKs highlighted on the emulator (training overlay). */
  highlightKeys?: string[]
  highlightLsk?: LskId[]
  /** Page the learner should be on for this step; pressing other page keys gives guidance. */
  expectedPage?: string
}

export interface Lesson {
  id: string
  category: LessonCategory
  aircraftId: string
  title: LocalizedText
  description: LocalizedText
  difficulty: Difficulty
  estimatedMinutes: number
  /** Commands applied to a fresh FMC before the lesson starts. */
  setup: FmsCommand[]
  steps: LessonStep[]
}

export type ScenarioVisibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC'

export interface ScenarioObjective {
  id: string
  text: LocalizedText
  condition: Condition
  points: number
}

export interface ScenarioBriefing {
  origin?: string
  destination?: string
  route?: string
  sid?: string
  star?: string
  approach?: string
  runway?: string
  cruiseAltitudeFt?: number
  fuelKg?: number
  zfwKg?: number
  reserveKg?: number
  costIndex?: number
}

export interface Scenario {
  id: string
  version: 1
  title: LocalizedText
  description: LocalizedText
  aircraftId: string
  difficulty: Difficulty
  language: 'ko' | 'en'
  visibility: ScenarioVisibility
  initialAirport?: string
  setup: FmsCommand[]
  briefing: ScenarioBriefing
  objectives: ScenarioObjective[]
  hints: LocalizedText[]
  builtIn: boolean
  authorUid?: string
  authorName?: string
  shareCode?: string
  createdAt: number
  updatedAt: number
}

export interface AttemptResult {
  score: number
  correctInputs: number
  incorrectInputs: number
  hintsUsed: number
  timeSec: number
  completionPct: number
  completedObjectives: string[]
}
