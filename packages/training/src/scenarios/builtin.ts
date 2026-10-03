import type { Scenario, ScenarioObjective } from '../model'
import type { Condition } from '../conditions'
import { k } from '../text'

const obj = (scenarioId: string, id: string, condition: Condition, points = 10): ScenarioObjective => ({
  id,
  text: k(`scenarios.${scenarioId}.objectives.${id}`),
  condition,
  points,
})

const builtIn = (s: Omit<Scenario, 'version' | 'builtIn' | 'createdAt' | 'updatedAt' | 'visibility' | 'title' | 'description' | 'hints'> & { hintCount: number }): Scenario => ({
  ...s,
  version: 1,
  builtIn: true,
  visibility: 'PUBLIC',
  title: k(`scenarios.${s.id}.title`),
  description: k(`scenarios.${s.id}.description`),
  hints: Array.from({ length: s.hintCount }, (_, i) => k(`scenarios.${s.id}.hints.h${i + 1}`)),
  createdAt: Date.UTC(2026, 0, 1),
  updatedAt: Date.UTC(2026, 0, 1),
})

export const BUILTIN_SCENARIOS: Scenario[] = [
  builtIn({
    id: 'seoulBusan737',
    aircraftId: 'B737-800',
    difficulty: 'EASY',
    language: 'ko',
    initialAirport: 'RKSI',
    setup: [],
    briefing: { origin: 'RKSI', destination: 'RKPK', route: 'BULTI Y711 OSN Y722 KALOD', sid: 'BULTI1J', star: 'KALOD1A', approach: 'ILS36L', runway: '33L', cruiseAltitudeFt: 25000, zfwKg: 58000, fuelKg: 9500, reserveKg: 2500, costIndex: 30 },
    objectives: [
      obj('seoulBusan737', 'posInit', { kind: 'POS_INITIALIZED' }),
      obj('seoulBusan737', 'originDest', { kind: 'ALL', conditions: [{ kind: 'ORIGIN', icao: 'RKSI' }, { kind: 'DESTINATION', icao: 'RKPK' }] }),
      obj('seoulBusan737', 'route', { kind: 'ROUTE_CONTAINS', idents: ['BULTI', 'OSN', 'KALOD'] }, 20),
      obj('seoulBusan737', 'sid', { kind: 'SID', name: 'BULTI1J' }),
      obj('seoulBusan737', 'star', { kind: 'ALL', conditions: [{ kind: 'STAR', name: 'KALOD1A' }, { kind: 'APPROACH', name: 'ILS36L' }] }),
      obj('seoulBusan737', 'perfInit', { kind: 'ALL', conditions: [{ kind: 'PERF', field: 'zfwKg' }, { kind: 'PERF', field: 'fuelKg' }, { kind: 'PERF', field: 'costIndex' }, { kind: 'PERF', field: 'cruiseAltitudeFt', equals: 25000 }] }, 20),
      obj('seoulBusan737', 'takeoffRef', { kind: 'ALL', conditions: [{ kind: 'TAKEOFF_FLAPS' }, { kind: 'TAKEOFF_SPEEDS_SET' }] }),
      obj('seoulBusan737', 'activated', { kind: 'ALL', conditions: [{ kind: 'PLAN_ACTIVE' }, { kind: 'NO_DISCONTINUITY' }] }),
    ],
    hintCount: 3,
  }),
  builtIn({
    id: 'gimpoHaneda320',
    aircraftId: 'A320-NEO',
    difficulty: 'MEDIUM',
    language: 'ko',
    initialAirport: 'RKSS',
    setup: [],
    briefing: { origin: 'RKSS', destination: 'RJTT', route: 'OSN Y722 TOPAX G597 MIHOU Y20 CREAM', sid: 'OSN1E', star: 'CREAM1A', approach: 'ILS34R', runway: '32R', cruiseAltitudeFt: 37000, zfwKg: 60000, fuelKg: 8800, costIndex: 25 },
    objectives: [
      obj('gimpoHaneda320', 'init', { kind: 'ALL', conditions: [{ kind: 'ORIGIN', icao: 'RKSS' }, { kind: 'DESTINATION', icao: 'RJTT' }, { kind: 'PERF', field: 'cruiseAltitudeFt', equals: 37000 }] }),
      obj('gimpoHaneda320', 'fuel', { kind: 'ALL', conditions: [{ kind: 'PERF', field: 'zfwKg' }, { kind: 'PERF', field: 'fuelKg' }] }),
      obj('gimpoHaneda320', 'departure', { kind: 'ALL', conditions: [{ kind: 'RUNWAY', ident: '32R' }, { kind: 'SID', name: 'OSN1E' }] }),
      obj('gimpoHaneda320', 'airways', { kind: 'ROUTE_CONTAINS', idents: ['OSN', 'TOPAX', 'MIHOU', 'CREAM'] }, 20),
      obj('gimpoHaneda320', 'arrival', { kind: 'ALL', conditions: [{ kind: 'APPROACH', name: 'ILS34R' }, { kind: 'STAR', name: 'CREAM1A' }] }),
      obj('gimpoHaneda320', 'noDisco', { kind: 'ALL', conditions: [{ kind: 'NO_DISCONTINUITY' }, { kind: 'NO_MODIFICATION' }] }),
    ],
    hintCount: 3,
  }),
  builtIn({
    id: 'busanJejuMax',
    aircraftId: 'B737-MAX8',
    difficulty: 'MEDIUM',
    language: 'ko',
    initialAirport: 'RKPK',
    setup: [],
    briefing: { origin: 'RKPK', destination: 'RKPC', route: 'DOSAN Y683 SAMDO', sid: 'DOSAN1E', star: 'SAMDO1A', approach: 'ILS25', runway: '18R', cruiseAltitudeFt: 23000, costIndex: 20 },
    objectives: [
      obj('busanJejuMax', 'originDest', { kind: 'ALL', conditions: [{ kind: 'ORIGIN', icao: 'RKPK' }, { kind: 'DESTINATION', icao: 'RKPC' }] }),
      obj('busanJejuMax', 'departure', { kind: 'ALL', conditions: [{ kind: 'RUNWAY', ident: '18R' }, { kind: 'SID', name: 'DOSAN1E' }] }),
      obj('busanJejuMax', 'route', { kind: 'ROUTE_CONTAINS', idents: ['DOSAN', 'SAMDO'] }),
      obj('busanJejuMax', 'arrival', { kind: 'ALL', conditions: [{ kind: 'STAR', name: 'SAMDO1A' }, { kind: 'APPROACH', name: 'ILS25' }] }),
      obj('busanJejuMax', 'perf', { kind: 'ALL', conditions: [{ kind: 'PERF', field: 'cruiseAltitudeFt', equals: 23000 }, { kind: 'PERF', field: 'costIndex' }] }),
      obj('busanJejuMax', 'activated', { kind: 'ALL', conditions: [{ kind: 'PLAN_ACTIVE' }, { kind: 'NO_DISCONTINUITY' }] }),
    ],
    hintCount: 2,
  }),
  builtIn({
    id: 'holdAtOsn737',
    aircraftId: 'B737-800',
    difficulty: 'HARD',
    language: 'ko',
    initialAirport: 'RKSI',
    setup: [
      { kind: 'SET_POSITION_FROM_AIRPORT', icao: 'RKSI' },
      { kind: 'SET_ORIGIN', icao: 'RKSI' },
      { kind: 'SET_DESTINATION', icao: 'RKPK' },
      { kind: 'SET_DEPARTURE_RUNWAY', runway: '33L' },
      { kind: 'SET_SID', procedureId: 'RKSI-SID-BULTI1J' },
      { kind: 'APPEND_ROUTE', via: 'Y711', to: 'OSN' },
      { kind: 'APPEND_ROUTE', via: 'Y722', to: 'KALOD' },
      { kind: 'SET_STAR', procedureId: 'RKPK-STAR-KALOD1A' },
      { kind: 'ACTIVATE_ROUTE' },
    ],
    briefing: { origin: 'RKSI', destination: 'RKPK' },
    objectives: [
      obj('holdAtOsn737', 'hold', { kind: 'HOLD_AT', ident: 'OSN' }, 20),
      obj('holdAtOsn737', 'constraint', { kind: 'CONSTRAINT_AT', ident: 'KALOD' }),
      obj('holdAtOsn737', 'fix', { kind: 'FIX_INFO', ident: 'OSN' }),
      obj('holdAtOsn737', 'clean', { kind: 'ALL', conditions: [{ kind: 'NO_MODIFICATION' }, { kind: 'NO_DISCONTINUITY' }] }),
    ],
    hintCount: 2,
  }),
]

export function scenarioById(id: string): Scenario | undefined {
  return BUILTIN_SCENARIOS.find((s) => s.id === id)
}
