import type { KeypadLayout } from '@aerofms/core'
import { alphaSection, functionSection, numericSection } from '../common/keypad'

const p = (id: string, label: string) => ({ id, label, role: 'page' as const })
const nav = (id: string, label: string) => ({ id, label, role: 'navigation' as const })

const ALPHA_EXTRA = [
  { id: '/', label: '/', role: 'char' as const },
  { id: 'SP', label: 'SP', role: 'char' as const },
  { id: 'OVFY', label: 'OVFY', role: 'function' as const },
  { id: 'CLR', label: 'CLR', role: 'clear' as const },
]
const NUM_LAST = [
  { id: '.', label: '.', role: 'char' as const },
  { id: '0', label: '0', role: 'char' as const },
  { id: '+/-', label: '+/-', role: 'char' as const },
]

export const AIRBUS_MCDU_KEYPAD: KeypadLayout = {
  style: 'AIRBUS_MCDU',
  sections: [
    functionSection(
      [
        [p('DIR', 'DIR'), p('PROG', 'PROG'), p('PERF', 'PERF'), p('INIT', 'INIT'), p('DATA', 'DATA'), null],
        [p('F_PLN', 'F-PLN'), p('RAD_NAV', 'RAD NAV'), p('FUEL_PRED', 'FUEL PRED'), p('SEC_F_PLN', 'SEC F-PLN'), p('ATC_COMM', 'ATC COMM'), p('MCDU_MENU', 'MCDU MENU')],
        [p('AIRPORT', 'AIRPORT'), null, nav('PREV_PAGE', '←'), nav('UP', '↑'), null, null],
        [null, null, nav('NEXT_PAGE', '→'), nav('DOWN', '↓'), null, null],
      ],
      6,
    ),
    alphaSection(ALPHA_EXTRA),
    numericSection(NUM_LAST),
  ],
}

/** A350 KCCU-style keyboard (text-mode MFD approximation). */
export const AIRBUS_KCCU_KEYPAD: KeypadLayout = {
  style: 'AIRBUS_MFD_KCCU',
  sections: [
    functionSection(
      [
        [p('F_PLN', 'F-PLN'), p('DIR', 'DIR'), p('PERF', 'PERF'), p('INIT', 'INIT'), p('FUEL_PRED', 'FUEL&LOAD'), p('AIRPORT', 'DEST')],
        [p('RAD_NAV', 'NAVAID'), p('SEC_F_PLN', 'SEC INDEX'), p('PROG', 'POSITION'), p('DATA', 'DATA'), p('ATC_COMM', 'MAILBOX'), p('MCDU_MENU', 'MENU')],
        [nav('PREV_PAGE', '←'), nav('NEXT_PAGE', '→'), nav('UP', '↑'), nav('DOWN', '↓'), null, null],
      ],
      6,
    ),
    alphaSection(ALPHA_EXTRA),
    numericSection(NUM_LAST),
  ],
}
