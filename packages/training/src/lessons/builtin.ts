import type { FmsCommand } from '@aerofms/core'
import type { Condition } from '../conditions'
import type { Lesson, LessonCategory, LessonStep, Difficulty } from '../model'
import { k } from '../text'

/**
 * Built-in Academy lessons. All learner-facing text is referenced by i18n key:
 *  lessons.<lessonId>.title / .description / .steps.<stepId> / .steps.<stepId>Hint
 */

interface StepSpec {
  id: string
  expect: Condition
  keys?: string[]
  lsk?: LessonStep['highlightLsk']
  page?: string
  hint?: boolean
}

function lesson(
  id: string,
  category: LessonCategory,
  aircraftId: string,
  difficulty: Difficulty,
  minutes: number,
  setup: FmsCommand[],
  steps: StepSpec[],
): Lesson {
  return {
    id,
    category,
    aircraftId,
    difficulty,
    estimatedMinutes: minutes,
    title: k(`lessons.${id}.title`),
    description: k(`lessons.${id}.description`),
    setup,
    steps: steps.map((s) => ({
      id: s.id,
      instruction: k(`lessons.${id}.steps.${s.id}`),
      hint: s.hint ? k(`lessons.${id}.steps.${s.id}Hint`) : undefined,
      expect: s.expect,
      highlightKeys: s.keys,
      highlightLsk: s.lsk,
      expectedPage: s.page,
    })),
  }
}

const RKSI_RKPK_ROUTE: FmsCommand[] = [
  { kind: 'SET_POSITION_FROM_AIRPORT', icao: 'RKSI' },
  { kind: 'SET_ORIGIN', icao: 'RKSI' },
  { kind: 'SET_DESTINATION', icao: 'RKPK' },
  { kind: 'SET_DEPARTURE_RUNWAY', runway: '33L' },
  { kind: 'APPEND_ROUTE', via: 'DIRECT', to: 'BULTI' },
  { kind: 'APPEND_ROUTE', via: 'Y711', to: 'OSN' },
  { kind: 'APPEND_ROUTE', via: 'Y722', to: 'KALOD' },
]

const RKSI_RKPK_FULL: FmsCommand[] = [
  ...RKSI_RKPK_ROUTE,
  { kind: 'SET_SID', procedureId: 'RKSI-SID-BULTI1J' },
  { kind: 'SET_STAR', procedureId: 'RKPK-STAR-KALOD1A' },
  { kind: 'SET_APPROACH', procedureId: 'RKPK-APP-ILS36L', transition: 'DOTOL' },
  { kind: 'SET_ZFW', value: '58.0' },
  { kind: 'SET_FUEL', value: '9.5' },
  { kind: 'SET_RESERVES', value: '2.5' },
  { kind: 'SET_COST_INDEX', value: '30' },
  { kind: 'SET_CRUISE_ALTITUDE', value: 'FL250' },
  { kind: 'ACTIVATE_ROUTE' },
]

export const BUILTIN_LESSONS: Lesson[] = [
  lesson('fmcBasics737', 'FMC_BASICS', 'B737-800', 'EASY', 5, [], [
    { id: 'openInitRef', expect: { kind: 'PAGE', pageId: 'POS_INIT' }, keys: ['INIT_REF'], page: 'POS_INIT' },
    { id: 'typeIcao', expect: { kind: 'SCRATCHPAD', equals: 'RKSI' }, keys: ['R', 'K', 'S', 'I'], hint: true },
    { id: 'enterRefAirport', expect: { kind: 'REF_AIRPORT', icao: 'RKSI' }, lsk: ['2L'] },
    { id: 'copyPosition', expect: { kind: 'SCRATCHPAD_PREFIX', prefix: 'N37' }, lsk: ['2R'], hint: true },
    { id: 'setIrsPos', expect: { kind: 'POS_INITIALIZED' }, lsk: ['4R'] },
    { id: 'typeAbc', expect: { kind: 'SCRATCHPAD', equals: 'ABC' }, keys: ['A', 'B', 'C'] },
    { id: 'clearOne', expect: { kind: 'SCRATCHPAD', equals: 'AB' }, keys: ['CLR'], hint: true },
    { id: 'clearAll', expect: { kind: 'SCRATCHPAD', equals: '' }, keys: ['CLR'], hint: true },
    { id: 'routePage', expect: { kind: 'PAGE', pageId: 'RTE' }, lsk: ['6R'], page: 'RTE' },
  ]),

  lesson('routeProgramming737', 'ROUTE_PROGRAMMING', 'B737-800', 'EASY', 10, [{ kind: 'SET_POSITION_FROM_AIRPORT', icao: 'RKSI' }], [
    { id: 'openRte', expect: { kind: 'PAGE', pageId: 'RTE' }, keys: ['RTE'], page: 'RTE' },
    { id: 'origin', expect: { kind: 'ORIGIN', icao: 'RKSI' }, lsk: ['1L'], hint: true },
    { id: 'destination', expect: { kind: 'DESTINATION', icao: 'RKPK' }, lsk: ['1R'] },
    { id: 'flightNumber', expect: { kind: 'FLIGHT_NUMBER' }, lsk: ['2R'] },
    { id: 'runway', expect: { kind: 'RUNWAY', ident: '33L' }, lsk: ['3L'], hint: true },
    { id: 'nextPage', expect: { kind: 'PAGE', pageId: 'RTE', subPage: 2 }, keys: ['NEXT_PAGE'] },
    { id: 'direct', expect: { kind: 'ROUTE_CONTAINS', idents: ['RKSI', 'BULTI'] }, lsk: ['1R'], hint: true },
    { id: 'airway1', expect: { kind: 'ROUTE_CONTAINS', idents: ['BULTI', 'NODLI', 'OSN'] }, lsk: ['2L', '2R'], hint: true },
    { id: 'airway2', expect: { kind: 'ROUTE_CONTAINS', idents: ['OSN', 'SOSDO', 'MAKET', 'TOPAX', 'KALOD'] }, lsk: ['3L', '3R'] },
    { id: 'activate', expect: { kind: 'MODIFICATION_PENDING' }, lsk: ['6R'], hint: true },
    { id: 'exec', expect: { kind: 'PLAN_ACTIVE' }, keys: ['EXEC'] },
    { id: 'legs', expect: { kind: 'PAGE', pageId: 'LEGS' }, keys: ['LEGS'], page: 'LEGS' },
  ]),

  lesson('departure737', 'DEPARTURE', 'B737-800', 'MEDIUM', 8, RKSI_RKPK_ROUTE.filter((c) => c.kind !== 'SET_DEPARTURE_RUNWAY'), [
    { id: 'depArr', expect: { kind: 'PAGE', pageId: 'DEP_ARR_INDEX' }, keys: ['DEP_ARR'], page: 'DEP_ARR_INDEX' },
    { id: 'departures', expect: { kind: 'PAGE', pageId: 'DEPARTURES' }, lsk: ['1L'], page: 'DEPARTURES' },
    { id: 'runway', expect: { kind: 'RUNWAY', ident: '33L' }, hint: true },
    { id: 'sid', expect: { kind: 'SID', name: 'BULTI1J' }, hint: true },
    { id: 'legs', expect: { kind: 'PAGE', pageId: 'LEGS' }, keys: ['LEGS'], page: 'LEGS' },
    { id: 'activate', expect: { kind: 'MODIFICATION_PENDING' }, keys: ['RTE'], hint: true },
    { id: 'exec', expect: { kind: 'ALL', conditions: [{ kind: 'PLAN_ACTIVE' }, { kind: 'SID', name: 'BULTI1J' }] }, keys: ['EXEC'] },
  ]),

  lesson('arrival737', 'ARRIVAL', 'B737-800', 'MEDIUM', 8, [...RKSI_RKPK_ROUTE, { kind: 'SET_SID', procedureId: 'RKSI-SID-BULTI1J' }], [
    { id: 'depArr', expect: { kind: 'PAGE', pageId: 'DEP_ARR_INDEX' }, keys: ['DEP_ARR'], page: 'DEP_ARR_INDEX' },
    { id: 'arrivals', expect: { kind: 'PAGE', pageId: 'ARRIVALS' }, lsk: ['2R'], page: 'ARRIVALS' },
    { id: 'star', expect: { kind: 'STAR', name: 'KALOD1A' }, hint: true },
    { id: 'approach', expect: { kind: 'APPROACH', name: 'ILS36L' }, hint: true },
    { id: 'transition', expect: { kind: 'APPROACH', name: 'ILS36L', transition: 'DOTOL' }, hint: true },
    { id: 'legs', expect: { kind: 'ALL', conditions: [{ kind: 'PAGE', pageId: 'LEGS' }, { kind: 'NO_DISCONTINUITY' }] }, keys: ['LEGS'], hint: true },
  ]),

  lesson('performance737', 'PERFORMANCE', 'B737-800', 'MEDIUM', 10, RKSI_RKPK_ROUTE, [
    { id: 'perfInit', expect: { kind: 'PAGE', pageId: 'PERF_INIT' }, keys: ['INIT_REF'], page: 'PERF_INIT', hint: true },
    { id: 'zfw', expect: { kind: 'PERF', field: 'zfwKg', min: 41400, max: 62700 }, lsk: ['3L'], hint: true },
    { id: 'fuel', expect: { kind: 'PERF', field: 'fuelKg', min: 4000 }, lsk: ['2L'], hint: true },
    { id: 'reserves', expect: { kind: 'PERF', field: 'reserveFuelKg', min: 1000 }, lsk: ['4L'] },
    { id: 'costIndex', expect: { kind: 'PERF', field: 'costIndex' }, lsk: ['5L'], hint: true },
    { id: 'cruise', expect: { kind: 'PERF', field: 'cruiseAltitudeFt', equals: 25000 }, lsk: ['1R'], hint: true },
    { id: 'n1Limit', expect: { kind: 'PAGE', pageId: 'N1_LIMIT' }, lsk: ['6R'], page: 'N1_LIMIT' },
    { id: 'takeoffRef', expect: { kind: 'PAGE', pageId: 'TAKEOFF_REF' }, lsk: ['6R'], page: 'TAKEOFF_REF' },
    { id: 'flaps', expect: { kind: 'TAKEOFF_FLAPS', value: 5 }, lsk: ['1L'] },
    { id: 'vspeeds', expect: { kind: 'TAKEOFF_SPEEDS_SET' }, lsk: ['1R', '2R', '3R'], hint: true },
  ]),

  lesson('vnav737', 'VNAV', 'B737-800', 'MEDIUM', 8, RKSI_RKPK_FULL, [
    { id: 'climb', expect: { kind: 'PAGE', pageId: 'CLB' }, keys: ['CLB'], page: 'CLB' },
    { id: 'selectSpeed', expect: { kind: 'MODIFICATION_PENDING' }, lsk: ['2L'], hint: true },
    { id: 'exec', expect: { kind: 'NO_MODIFICATION' }, keys: ['EXEC'] },
    { id: 'cruise', expect: { kind: 'PAGE', pageId: 'CRZ' }, keys: ['CRZ'], page: 'CRZ' },
    { id: 'descent', expect: { kind: 'PAGE', pageId: 'DES' }, keys: ['DES'], page: 'DES', hint: true },
  ]),

  lesson('routeModification737', 'ROUTE_MODIFICATION', 'B737-800', 'MEDIUM', 10, [...RKSI_RKPK_ROUTE.slice(0, 6), { kind: 'ACTIVATE_ROUTE' }], [
    { id: 'legs', expect: { kind: 'PAGE', pageId: 'LEGS' }, keys: ['LEGS'], page: 'LEGS' },
    { id: 'closeDisco', expect: { kind: 'ALL', conditions: [{ kind: 'MODIFICATION_PENDING' }] }, hint: true },
    { id: 'exec', expect: { kind: 'ALL', conditions: [{ kind: 'PLAN_ACTIVE' }, { kind: 'NO_DISCONTINUITY' }] }, keys: ['EXEC'], hint: true },
    { id: 'deleteWaypoint', expect: { kind: 'MODIFICATION_PENDING' }, keys: ['DEL'], hint: true },
    { id: 'erase', expect: { kind: 'ALL', conditions: [{ kind: 'NO_MODIFICATION' }, { kind: 'ROUTE_CONTAINS', idents: ['NODLI'] }] }, lsk: ['6L'], hint: true },
  ]),

  lesson('holds737', 'HOLDS', 'B737-800', 'MEDIUM', 6, RKSI_RKPK_FULL, [
    { id: 'hold', expect: { kind: 'PAGE', pageId: 'HOLD' }, keys: ['HOLD'], page: 'HOLD' },
    { id: 'holdAt', expect: { kind: 'MODIFICATION_PENDING' }, lsk: ['6L'], hint: true },
    { id: 'exec', expect: { kind: 'HOLD_AT', ident: 'OSN' }, keys: ['EXEC'] },
    { id: 'legs', expect: { kind: 'PAGE', pageId: 'LEGS' }, keys: ['LEGS'] },
  ]),

  lesson('boeingExec', 'BOEING_FMC', 'B737-800', 'EASY', 5, [...RKSI_RKPK_ROUTE, { kind: 'ACTIVATE_ROUTE' }], [
    { id: 'legs', expect: { kind: 'PAGE', pageId: 'LEGS' }, keys: ['LEGS'], page: 'LEGS' },
    { id: 'constraint', expect: { kind: 'MODIFICATION_PENDING' }, hint: true },
    { id: 'exec', expect: { kind: 'ALL', conditions: [{ kind: 'NO_MODIFICATION' }, { kind: 'CONSTRAINT_AT', ident: 'OSN' }] }, keys: ['EXEC'], hint: true },
  ]),

  lesson('airbusInit', 'AIRBUS_FMGS', 'A320-NEO', 'EASY', 8, [], [
    { id: 'init', expect: { kind: 'PAGE', pageId: 'INIT' }, keys: ['INIT'], page: 'INIT' },
    { id: 'fromTo', expect: { kind: 'ALL', conditions: [{ kind: 'ORIGIN', icao: 'RKSS' }, { kind: 'DESTINATION', icao: 'RJTT' }] }, lsk: ['1R'], hint: true },
    { id: 'flightNumber', expect: { kind: 'FLIGHT_NUMBER' }, lsk: ['3L'] },
    { id: 'align', expect: { kind: 'POS_INITIALIZED' }, lsk: ['2R'], hint: true },
    { id: 'costIndex', expect: { kind: 'PERF', field: 'costIndex' }, lsk: ['5L'] },
    { id: 'cruise', expect: { kind: 'PERF', field: 'cruiseAltitudeFt', equals: 37000 }, lsk: ['6L'], hint: true },
    { id: 'initB', expect: { kind: 'PAGE', pageId: 'INIT', subPage: 2 }, keys: ['NEXT_PAGE'] },
    { id: 'zfw', expect: { kind: 'PERF', field: 'zfwKg', min: 44300 }, lsk: ['1R'], hint: true },
    { id: 'block', expect: { kind: 'PERF', field: 'fuelKg', min: 3000 }, lsk: ['2R'] },
    { id: 'fpln', expect: { kind: 'PAGE', pageId: 'F_PLN' }, keys: ['F_PLN'], page: 'F_PLN' },
  ]),

  lesson('airbusTemporary', 'AIRBUS_FMGS', 'A320-NEO', 'MEDIUM', 10, [
    { kind: 'SET_ORIGIN', icao: 'RKSS' },
    { kind: 'SET_DESTINATION', icao: 'RJTT' },
    { kind: 'SET_POSITION_FROM_AIRPORT', icao: 'RKSS' },
  ], [
    { id: 'fpln', expect: { kind: 'PAGE', pageId: 'F_PLN' }, keys: ['F_PLN'], page: 'F_PLN' },
    { id: 'latRev', expect: { kind: 'PAGE', pageId: 'LAT_REV' }, lsk: ['1L'], hint: true },
    { id: 'departure', expect: { kind: 'PAGE', pageId: 'AB_DEPARTURES' }, lsk: ['1L'] },
    { id: 'runway', expect: { kind: 'MODIFICATION_PENDING' }, hint: true },
    { id: 'sid', expect: { kind: 'ALL', conditions: [{ kind: 'MODIFICATION_PENDING' }] }, hint: true },
    { id: 'insert', expect: { kind: 'ALL', conditions: [{ kind: 'NO_MODIFICATION' }, { kind: 'RUNWAY', ident: '32R' }] }, lsk: ['6R'], hint: true },
    { id: 'airways', expect: { kind: 'ROUTE_CONTAINS', idents: ['OSN', 'TOPAX'] }, hint: true },
  ]),

  lesson('advancedDirectTo', 'ADVANCED', 'A320-NEO', 'HARD', 8, [
    { kind: 'SET_ORIGIN', icao: 'RKSS' },
    { kind: 'SET_DESTINATION', icao: 'RKPK' },
    { kind: 'SET_POSITION_FROM_AIRPORT', icao: 'RKSS' },
    { kind: 'APPEND_ROUTE', via: 'DIRECT', to: 'OSN' },
    { kind: 'APPEND_ROUTE', via: 'Y722', to: 'KALOD' },
  ], [
    { id: 'dir', expect: { kind: 'PAGE', pageId: 'DIR_TO' }, keys: ['DIR'], page: 'DIR_TO' },
    { id: 'select', expect: { kind: 'MODIFICATION_PENDING' }, hint: true },
    { id: 'insert', expect: { kind: 'ACTIVE_LEG', ident: 'TOPAX' }, lsk: ['6R'], hint: true },
    { id: 'fixInfo', expect: { kind: 'FIX_INFO', ident: 'KALOD' }, hint: true },
  ]),
]

export function lessonById(id: string): Lesson | undefined {
  return BUILTIN_LESSONS.find((l) => l.id === id)
}
