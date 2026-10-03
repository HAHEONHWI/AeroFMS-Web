import type { Draft } from 'immer'
import type { ExternalAircraftState } from '../events/types'
import type { FmsState } from '../state/types'
import type { AdapterContext } from './adapter'
import { updateGuidanceAndSequence } from '../lnav/sequence'

/** Applies aircraft state received from an external flight simulator (connector mode). */
export function applyExternalAircraftState(draft: Draft<FmsState>, ext: ExternalAircraftState, actx: AdapterContext): void {
  draft.simulation.source = 'CONNECTOR'
  draft.position.aircraft = { lat: ext.lat, lon: ext.lon }
  draft.position.altitudeFt = ext.altitudeFt
  draft.position.headingTrue = ext.headingTrue
  draft.position.trackTrue = ext.trackTrue
  draft.position.groundSpeedKt = ext.groundSpeedKt
  draft.position.onGround = ext.onGround
  draft.simulation.trueAirspeedKt = ext.trueAirspeedKt
  draft.simulation.indicatedAirspeedKt = ext.indicatedAirspeedKt
  draft.simulation.verticalSpeedFpm = ext.verticalSpeedFpm
  if (ext.fuelKg !== undefined) draft.simulation.fuelKg = ext.fuelKg
  draft.simulation.simTimeMs = actx.now
  if (!ext.onGround && draft.activeFlightPlan.activated && draft.guidance.lnav === 'OFF') draft.guidance.lnav = 'ACTIVE'
  updateGuidanceAndSequence(draft)
  // Coarse phase detection from the external state.
  const crz = draft.performance.cruiseAltitudeFt
  if (ext.onGround) {
    draft.flightPhase = draft.flightPhase === 'PREFLIGHT' || draft.flightPhase === 'LANDED' ? draft.flightPhase : 'LANDED'
  } else if (crz && ext.altitudeFt >= crz - 300) draft.flightPhase = 'CRUISE'
  else if (ext.verticalSpeedFpm > 300) draft.flightPhase = 'CLIMB'
  else if (ext.verticalSpeedFpm < -300) draft.flightPhase = draft.guidance.distanceToDestinationNm < 20 ? 'APPROACH' : 'DESCENT'
}
