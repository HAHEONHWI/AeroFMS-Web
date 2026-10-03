import { current, isDraft } from 'immer'
import type { Draft } from 'immer'
import type { FlightPlan } from '@aerofms/shared'
import type { FmsState, ModificationKind, PerformanceState } from '../state/types'
import type { PlanEditPolicy } from '../engine/adapter'
import { clonePlan } from '../flightplan/factory'

/** The plan shown on route pages: the MOD/TEMPORARY plan when one exists, else the active plan. */
export function displayedPlan(state: FmsState): FlightPlan {
  return state.modifiedFlightPlan ?? state.activeFlightPlan
}

export function displayedPerformance(state: FmsState): PerformanceState {
  return state.modifiedPerformance ?? state.performance
}

const plain = <T extends object>(v: T): T => (isDraft(v) ? (current(v as never) as T) : v)

/** Returns the plan to edit, creating the modified copy on first use when the policy requires it. */
export function planForEdit(draft: Draft<FmsState>, kind: ModificationKind, policy: PlanEditPolicy): Draft<FlightPlan> {
  if (policy === 'DIRECT' && !draft.modifiedFlightPlan) return draft.activeFlightPlan
  if (!draft.modifiedFlightPlan) {
    draft.modifiedFlightPlan = clonePlan(plain(draft.activeFlightPlan) as FlightPlan)
    draft.modificationKind = kind
  }
  return draft.modifiedFlightPlan
}

/** Returns performance data to edit (Boeing VNAV page changes become a modification). */
export function performanceForEdit(draft: Draft<FmsState>, policy: PlanEditPolicy): Draft<PerformanceState> {
  if (policy === 'DIRECT' && !draft.modifiedPerformance) return draft.performance
  if (!draft.modifiedPerformance) {
    draft.modifiedPerformance = JSON.parse(JSON.stringify(plain(draft.performance))) as PerformanceState
    draft.modificationKind ??= 'PERFORMANCE'
  }
  return draft.modifiedPerformance
}

export function hasModification(state: FmsState): boolean {
  return !!state.modifiedFlightPlan || !!state.modifiedPerformance
}

/** EXEC / INSERT: commits pending modifications. Returns false when nothing was pending. */
export function commitModification(draft: Draft<FmsState>): boolean {
  if (!draft.modifiedFlightPlan && !draft.modifiedPerformance) return false
  if (draft.modifiedFlightPlan) {
    draft.activeFlightPlan = draft.modifiedFlightPlan
    draft.activeFlightPlan.activated = true
  }
  if (draft.modifiedPerformance) draft.performance = draft.modifiedPerformance
  draft.modifiedFlightPlan = undefined
  draft.modifiedPerformance = undefined
  draft.modificationKind = undefined
  return true
}

/** ERASE: discards pending modifications. */
export function discardModification(draft: Draft<FmsState>): boolean {
  if (!draft.modifiedFlightPlan && !draft.modifiedPerformance) return false
  draft.modifiedFlightPlan = undefined
  draft.modifiedPerformance = undefined
  draft.modificationKind = undefined
  return true
}
