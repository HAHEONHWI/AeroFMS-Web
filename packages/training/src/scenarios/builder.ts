import { createId } from '@aerofms/shared'
import type { FmsCommand } from '@aerofms/core'
import type { Condition } from '../conditions'
import type { Difficulty, Scenario, ScenarioBriefing, ScenarioObjective, ScenarioVisibility } from '../model'

export interface ScenarioForm {
  title: string
  description: string
  aircraftId: string
  difficulty: Difficulty
  language: 'ko' | 'en'
  visibility: ScenarioVisibility
  initialAirport?: string
  origin?: string
  destination?: string
  route?: string
  runway?: string
  sid?: string
  star?: string
  approach?: string
  /** "FL350", "350" or "35000" */
  cruise?: string
  fuelKg?: number
  zfwKg?: number
}

/** "FL350" | "350" | "35000" → feet */
export function parseCruiseInput(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v.trim().toUpperCase().replace(/^FL/, ''))
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n < 1000 ? n * 100 : n
}

export function briefingFromForm(f: ScenarioForm): ScenarioBriefing {
  const u = (s?: string) => (s?.trim() ? s.trim().toUpperCase() : undefined)
  return {
    origin: u(f.origin),
    destination: u(f.destination),
    route: u(f.route),
    runway: u(f.runway)?.replace(/^RW/, ''),
    sid: u(f.sid),
    star: u(f.star),
    approach: u(f.approach),
    cruiseAltitudeFt: parseCruiseInput(f.cruise),
    fuelKg: f.fuelKg,
    zfwKg: f.zfwKg,
  }
}

/**
 * Generates scenario objectives from a briefing (route fixes exclude airway names).
 * Objective texts are literal in the scenario language.
 */
export function generateObjectives(b: ScenarioBriefing, language: 'ko' | 'en', isAirway: (token: string) => boolean): ScenarioObjective[] {
  const ko = language === 'ko'
  const objs: ScenarioObjective[] = []
  const add = (text: string, condition: Condition, points = 10) => objs.push({ id: createId('o-'), text: { text }, condition, points })
  if (b.origin && b.destination) {
    add(`${b.origin} → ${b.destination}`, { kind: 'ALL', conditions: [{ kind: 'ORIGIN', icao: b.origin }, { kind: 'DESTINATION', icao: b.destination }] })
  }
  if (b.runway) add(ko ? `출발 활주로 ${b.runway}` : `Departure runway ${b.runway}`, { kind: 'RUNWAY', ident: b.runway })
  if (b.sid) add(`SID ${b.sid}`, { kind: 'SID', name: b.sid })
  const fixes = (b.route ?? '').split(/\s+/).filter((x) => x && !isAirway(x) && x !== 'DCT' && x !== 'DIRECT')
  if (fixes.length) add(ko ? `경로 ${b.route}` : `Route ${b.route}`, { kind: 'ROUTE_CONTAINS', idents: fixes }, 20)
  if (b.star) add(`STAR ${b.star}`, { kind: 'STAR', name: b.star })
  if (b.approach) add(ko ? `접근 절차 ${b.approach}` : `Approach ${b.approach}`, { kind: 'APPROACH', name: b.approach })
  if (b.cruiseAltitudeFt) add(ko ? `순항 고도 FL${Math.round(b.cruiseAltitudeFt / 100)}` : `Cruise FL${Math.round(b.cruiseAltitudeFt / 100)}`, { kind: 'PERF', field: 'cruiseAltitudeFt', equals: b.cruiseAltitudeFt })
  add(ko ? '불연속 없는 경로 활성화' : 'Activated route without discontinuities', { kind: 'ALL', conditions: [{ kind: 'PLAN_ACTIVE' }, { kind: 'NO_DISCONTINUITY' }] })
  return objs
}

export function createUserScenario(f: ScenarioForm, objectives: ScenarioObjective[], hints: string[], author?: { uid: string; name: string }, now = Date.now()): Scenario {
  const setup: FmsCommand[] = f.initialAirport?.trim() ? [{ kind: 'SET_POSITION_FROM_AIRPORT', icao: f.initialAirport.trim().toUpperCase() }] : []
  return {
    id: createId('sc-'),
    version: 1,
    title: { text: f.title.trim() },
    description: { text: f.description.trim() },
    aircraftId: f.aircraftId,
    difficulty: f.difficulty,
    language: f.language,
    visibility: f.visibility,
    initialAirport: f.initialAirport?.trim().toUpperCase() || undefined,
    setup,
    briefing: briefingFromForm(f),
    objectives,
    hints: hints.filter((h) => h.trim()).map((h) => ({ text: h.trim() })),
    builtIn: false,
    authorUid: author?.uid,
    authorName: author?.name,
    createdAt: now,
    updatedAt: now,
  }
}

export const BUILDER_CONDITION_TYPES = ['ORIGIN', 'DESTINATION', 'RUNWAY', 'SID', 'STAR', 'APPROACH', 'ROUTE_CONTAINS', 'POS_INITIALIZED', 'PLAN_ACTIVE', 'NO_DISCONTINUITY', 'TAKEOFF_SPEEDS_SET', 'HOLD_AT', 'PERF_CRZ', 'PERF_CI', 'PERF_ZFW', 'PERF_FUEL'] as const
export type BuilderConditionType = (typeof BUILDER_CONDITION_TYPES)[number]

const NEEDS_VALUE: ReadonlySet<BuilderConditionType> = new Set(['ORIGIN', 'DESTINATION', 'RUNWAY', 'SID', 'STAR', 'APPROACH', 'ROUTE_CONTAINS', 'HOLD_AT', 'PERF_CRZ'])

export function conditionNeedsValue(type: BuilderConditionType): boolean {
  return NEEDS_VALUE.has(type)
}

/** Converts a builder (type, value) pair into a Condition. */
export function builderCondition(type: BuilderConditionType, value: string): Condition {
  const v = value.trim().toUpperCase()
  switch (type) {
    case 'ORIGIN':
      return { kind: 'ORIGIN', icao: v }
    case 'DESTINATION':
      return { kind: 'DESTINATION', icao: v }
    case 'RUNWAY':
      return { kind: 'RUNWAY', ident: v.replace(/^RW/, '') }
    case 'SID':
      return { kind: 'SID', name: v }
    case 'STAR':
      return { kind: 'STAR', name: v }
    case 'APPROACH':
      return { kind: 'APPROACH', name: v }
    case 'ROUTE_CONTAINS':
      return { kind: 'ROUTE_CONTAINS', idents: v.split(/\s+/).filter(Boolean) }
    case 'HOLD_AT':
      return { kind: 'HOLD_AT', ident: v }
    case 'PERF_CRZ':
      return { kind: 'PERF', field: 'cruiseAltitudeFt', equals: parseCruiseInput(v) }
    case 'PERF_CI':
      return { kind: 'PERF', field: 'costIndex' }
    case 'PERF_ZFW':
      return { kind: 'PERF', field: 'zfwKg' }
    case 'PERF_FUEL':
      return { kind: 'PERF', field: 'fuelKg' }
    case 'POS_INITIALIZED':
    case 'PLAN_ACTIVE':
    case 'NO_DISCONTINUITY':
    case 'TAKEOFF_SPEEDS_SET':
      return { kind: type }
  }
}

export function builderObjective(type: BuilderConditionType, value: string, text: string, points: number): ScenarioObjective {
  return { id: createId('o-'), text: { text: text.trim() }, condition: builderCondition(type, value), points: Math.max(0, Math.min(100, Math.round(points) || 10)) }
}
