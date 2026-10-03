import { entryError, navigationHandler, row, small, span } from '@aerofms/core'
import type { FmsPageDefinition, FmsState } from '@aerofms/core'
import { fmtAlt } from './format'

const RATES = [1, 2, 4, 8, 16] as const

/**
 * AeroFMS simulation-control subsystem page (reached via MENU / MCDU MENU).
 * This is an AeroFMS feature, not a reproduction of an avionics page.
 */
export function simControlPage(returnPage: string, returnLabel: string): FmsPageDefinition {
  return {
    id: 'SIM',
    title: 'SIM CTL',
    render: (state: FmsState) => {
      const s = state.simulation
      const running = s.status === 'RUNNING'
      const paused = s.status === 'PAUSED'
      const canStart = s.status === 'IDLE' || s.status === 'COMPLETED'
      return {
        title: { center: [span('AEROFMS SIM CTL')] },
        rows: [
          row(
            { left: [small('STATUS')], right: [small('RATE')] },
            { left: [span(s.status, running ? 'green' : paused ? 'amber' : 'white')], right: [span(`${s.timeScale}X`, 'cyan')] },
          ),
          row(
            { left: [small('PHASE')], right: [small('ALT/GS')] },
            {
              left: [span(state.flightPhase)],
              right: [span(`${fmtAlt(state.position.altitudeFt, 18000)}/${Math.round(state.position.groundSpeedKt)}`, 'green')],
            },
          ),
          row({ left: [small('FUEL')], right: [small('DIST TO DEST')] }, {
            left: [span(`${(s.fuelKg / 1000).toFixed(1)}T`, 'green')],
            right: [span(`${Math.round(state.guidance.distanceToDestinationNm)}NM`, 'green')],
          }),
          row({}, { left: [span(canStart ? '<START' : running ? '<PAUSE' : '<RESUME')], right: [span('RATE>')] }),
          row({}, { left: [span(canStart ? '' : '<STOP')], right: [span(state.flightPhase === 'APPROACH' ? 'GO AROUND>' : '')] }),
          row({ left: [small('------------------------')] }, { left: [span(returnLabel)], right: [span(canStart && s.elapsedSec > 0 ? 'RESET>' : '')] }),
        ],
      }
    },
    leftLskHandlers: [
      undefined,
      undefined,
      undefined,
      (draft, ctx) => {
        const st = draft.simulation.status
        if (st === 'IDLE' || st === 'COMPLETED') ctx.simControl({ kind: 'START' })
        else if (st === 'RUNNING') ctx.simControl({ kind: 'PAUSE' })
        else ctx.simControl({ kind: 'RESUME' })
      },
      (draft, ctx) => {
        if (draft.simulation.status === 'IDLE') entryError('NOT_ALLOWED')
        ctx.simControl({ kind: 'STOP' })
      },
      navigationHandler((_d, ctx) => ctx.openPage(returnPage)),
    ],
    rightLskHandlers: [
      undefined,
      undefined,
      undefined,
      (draft, ctx) => {
        const idx = RATES.indexOf(draft.simulation.timeScale)
        ctx.simControl({ kind: 'SET_SPEED', timeScale: RATES[(idx + 1) % RATES.length] ?? 1 })
      },
      (draft, ctx) => {
        if (draft.flightPhase !== 'APPROACH') entryError('NOT_ALLOWED')
        ctx.simControl({ kind: 'GO_AROUND' })
      },
      (draft, ctx) => {
        if (draft.simulation.status === 'RUNNING' || draft.simulation.status === 'PAUSED') entryError('NOT_ALLOWED')
        ctx.simControl({ kind: 'RESET' })
      },
    ],
  }
}
