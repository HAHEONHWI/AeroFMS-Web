import type { NavigationProvider } from '@aerofms/navigation'
import { createEmptyFlightPlan } from '../flightplan/factory'
import type { AircraftState, FmsState, PerformanceState } from './types'
import { FMS_STATE_SCHEMA_VERSION } from './types'

export function defaultPerformance(): PerformanceState {
  return {
    takeoff: {},
    climb: { mode: 'ECON' },
    cruise: { mode: 'ECON', stepSizeFt: 0 },
    descent: { mode: 'ECON', speedRestrictionKt: 240, speedRestrictionAltFt: 10000 },
    approach: {},
  }
}

export interface CreateStateOptions {
  aircraft: AircraftState
  sessionId: string
  name: string
  now: number
  nav: NavigationProvider
  defaultPageId: string
}

export function createInitialFmsState(opts: CreateStateOptions): FmsState {
  return {
    schemaVersion: FMS_STATE_SCHEMA_VERSION,
    aircraft: opts.aircraft,
    position: {
      aircraft: null,
      altitudeFt: 0,
      headingTrue: 0,
      trackTrue: 0,
      groundSpeedKt: 0,
      onGround: true,
      initialized: false,
    },
    activeFlightPlan: createEmptyFlightPlan(`${opts.sessionId}-rte1`, opts.now),
    performance: defaultPerformance(),
    flightPhase: 'PREFLIGHT',
    currentPage: { pageId: opts.defaultPageId, subPage: 1, context: {} },
    scratchpad: { text: '', deleteMode: false },
    messages: [],
    navigation: {
      navDbCycle: opts.nav.meta.cycle,
      navDbName: opts.nav.meta.name,
      fixInfo: [],
      radios: {},
    },
    guidance: {
      lnav: 'OFF',
      vnav: 'OFF',
      crossTrackNm: 0,
      desiredTrackTrue: 0,
      distanceToGoNm: 0,
      distanceToDestinationNm: 0,
    },
    simulation: {
      status: 'IDLE',
      timeScale: 1,
      simTimeMs: opts.now,
      elapsedSec: 0,
      trueAirspeedKt: 0,
      indicatedAirspeedKt: 0,
      mach: 0,
      verticalSpeedFpm: 0,
      targetAltitudeFt: 0,
      targetSpeedKt: 0,
      fuelKg: 0,
      fuelUsedKg: 0,
      distanceFlownNm: 0,
      source: 'STANDALONE',
      windDir: 0,
      windKt: 0,
      phaseTimerSec: 0,
    },
    session: {
      sessionId: opts.sessionId,
      name: opts.name,
      createdAt: opts.now,
      updatedAt: opts.now,
      idCounter: 0,
      actionCount: 0,
    },
  }
}
