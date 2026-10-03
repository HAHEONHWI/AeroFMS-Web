import { isDiscontinuity, isLeg } from '@aerofms/shared'
import type { Draft } from 'immer'
import type { FmsState } from '../state/types'
import { computeLnavGuidance } from './guidance'
import { distanceToDestinationNm } from '../flightplan/geometry'

export type SequenceResult = 'NONE' | 'SEQUENCED' | 'DISCONTINUITY' | 'END_OF_ROUTE'

/**
 * Updates guidance values and sequences the active leg when the aircraft reaches the TO fix.
 * Sequencing stops at a discontinuity (LNAV drops to heading hold, as on the real systems).
 */
export function updateGuidanceAndSequence(draft: Draft<FmsState>): SequenceResult {
  const pos = draft.position.aircraft
  const plan = draft.activeFlightPlan
  if (!pos || (!plan.activated && draft.aircraft.manufacturer === 'BOEING')) return 'NONE'
  const g = computeLnavGuidance(plan, pos, Math.max(120, draft.position.groundSpeedKt))
  draft.guidance.crossTrackNm = Math.round(g.crossTrackNm * 100) / 100
  draft.guidance.desiredTrackTrue = Math.round(g.desiredTrackTrue * 10) / 10
  draft.guidance.distanceToGoNm = Math.round(g.distanceToGoNm * 10) / 10
  draft.guidance.distanceToDestinationNm = Math.round(distanceToDestinationNm(plan, pos) * 10) / 10
  if (draft.guidance.lnav !== 'ACTIVE' || !g.shouldSequence) return 'NONE'
  const nextIdx = plan.activeLegIndex + 1
  const next = plan.elements[nextIdx]
  if (!next || (isLeg(next) && next.missed)) return 'END_OF_ROUTE'
  if (isDiscontinuity(next)) {
    draft.guidance.lnav = 'OFF'
    return 'DISCONTINUITY'
  }
  plan.activeLegIndex = nextIdx
  plan.progressed = true
  // Keep a MOD/temporary plan aligned with the sequencing of the active plan.
  const mod = draft.modifiedFlightPlan
  if (mod) {
    const id = plan.elements[nextIdx]?.id
    const idx = mod.elements.findIndex((e) => e.id === id)
    if (idx >= 0) mod.activeLegIndex = idx
    mod.progressed = true
  }
  return 'SEQUENCED'
}
