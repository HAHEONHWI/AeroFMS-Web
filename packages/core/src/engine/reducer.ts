import { produce } from 'immer'
import { deterministicId } from '@aerofms/shared'
import type { NavigationProvider } from '@aerofms/navigation'
import type { FmsAction, FmsEvent, FmsEventInput } from '../events/types'
import type { FmsState } from '../state/types'
import { finalizePlan } from '../flightplan/edit'
import { keyToChar } from '../scratchpad/scratchpad'
import type { AdapterContext, AircraftFmsAdapter, SimulationStepper } from './adapter'
import { applyExternalAircraftState } from './external'

export interface EngineDeps {
  nav: NavigationProvider
  adapter: AircraftFmsAdapter
  simulator?: SimulationStepper
}

export interface ReduceResult {
  state: FmsState
  events: FmsEvent[]
}

/**
 * Pure, deterministic reducer: (state, action) → state. Used live by the engine and
 * by Replay to rebuild any historical state from the persisted action log.
 */
export function reduceFmsAction(state: FmsState, action: FmsAction, deps: EngineDeps): ReduceResult {
  const events: FmsEventInput[] = []
  let counter = state.session.idCounter
  const actx: AdapterContext = {
    nav: deps.nav,
    now: action.t,
    emit: (e) => events.push(e),
    nextId: () => deterministicId(state.session.sessionId, ++counter),
  }
  const { adapter } = deps
  if (deps.simulator) {
    const sim = deps.simulator
    actx.simulationControl = (d, control) => sim.control(d, control, { ...actx, adapter })
  }
  let next = state
  switch (action.type) {
    case 'KEY':
      events.push({ type: 'KEY_PRESS', detail: action.key })
      next = adapter.onKeyPress(action.key, state, actx)
      break
    case 'KEY_LONG':
      events.push({ type: 'KEY_PRESS', detail: `${action.key}:LONG` })
      next = adapter.onKeyLongPress(action.key, state, actx)
      break
    case 'LSK':
      events.push({ type: 'LSK_PRESS', detail: action.lsk })
      next = adapter.onLskPress(action.lsk, state, actx)
      break
    case 'TEXT':
      events.push({ type: 'KEY_PRESS', detail: 'TEXT', value: action.text })
      for (const ch of action.text.toUpperCase()) {
        const key = ch === ' ' ? 'SP' : ch
        if (keyToChar(key) !== undefined) next = adapter.onKeyPress(key, next, actx)
      }
      break
    case 'OPEN_PAGE':
      next = adapter.openPage(action.pageId, state, actx, action.subPage)
      break
    case 'HIGHLIGHT_LEG':
      next = produce(state, (d) => {
        d.navigation.highlightedLegId = action.legId ?? undefined
      })
      break
    case 'COMMAND':
      next = adapter.onCommand(action.command, state, actx)
      break
    case 'SIM_TICK':
      if (deps.simulator) {
        const sim = deps.simulator
        next = produce(state, (d) => sim.step(d, action.dtSec, { ...actx, adapter }))
      }
      break
    case 'SIM_CONTROL':
      if (deps.simulator) {
        const sim = deps.simulator
        events.push({ type: 'SIMULATION_EVENT', detail: action.control.kind })
        next = produce(state, (d) => sim.control(d, action.control, { ...actx, adapter }))
      }
      break
    case 'EXTERNAL_STATE':
      next = produce(state, (d) => applyExternalAircraftState(d, action.aircraft, actx))
      break
  }

  // Post processing: geometry, condition messages, bookkeeping.
  next = produce(next, (d) => {
    if (next.activeFlightPlan !== state.activeFlightPlan) finalizePlan(d.activeFlightPlan, action.t)
    if (d.modifiedFlightPlan && next.modifiedFlightPlan !== state.modifiedFlightPlan) finalizePlan(d.modifiedFlightPlan, action.t)
    if (d.secondaryFlightPlan && next.secondaryFlightPlan !== state.secondaryFlightPlan) {
      finalizePlan(d.secondaryFlightPlan, action.t)
    }
    adapter.postProcess(d, actx, action)
    d.session.idCounter = counter
    d.session.actionCount = state.session.actionCount + 1
    d.session.updatedAt = action.t
  })

  // Derived events.
  if (next.currentPage.pageId !== state.currentPage.pageId || next.currentPage.subPage !== state.currentPage.subPage) {
    events.push({ type: 'PAGE_OPEN', detail: next.currentPage.pageId, value: next.currentPage.subPage })
  }
  const isCharKey = action.type === 'KEY' && keyToChar(action.key) !== undefined
  if (!isCharKey && action.type !== 'TEXT' && next.scratchpad.text !== state.scratchpad.text) {
    events.push({ type: 'SCRATCHPAD_CHANGED', detail: 'TEXT', value: next.scratchpad.text })
  }
  if (next.scratchpad.message && next.scratchpad.message !== state.scratchpad.message) {
    events.push({ type: 'MESSAGE', detail: next.scratchpad.message.code, value: next.scratchpad.message.text })
  }
  if (next.activeFlightPlan.elements !== state.activeFlightPlan.elements) {
    events.push({ type: 'ROUTE_CHANGED', detail: 'ACTIVE' })
  }
  if (next.modifiedFlightPlan?.elements !== state.modifiedFlightPlan?.elements && next.modifiedFlightPlan) {
    events.push({ type: 'ROUTE_CHANGED', detail: 'MODIFIED' })
  }
  for (const m of next.messages) {
    if (!state.messages.some((x) => x.id === m.id)) events.push({ type: 'MESSAGE', detail: m.code, value: m.text })
  }
  const index = state.session.actionCount
  return { state: next, events: events.map((e) => ({ ...e, t: action.t, actionIndex: index })) }
}
