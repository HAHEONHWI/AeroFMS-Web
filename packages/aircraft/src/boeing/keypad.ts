import type { KeypadLayout } from '@aerofms/core'
import { alphaSection, functionSection, numericSection } from '../common/keypad'

const p = (id: string, label: string) => ({ id, label, role: 'page' as const })
const nav = (id: string, label: string) => ({ id, label, role: 'navigation' as const })

const ALPHA_EXTRA = [
  { id: 'SP', label: 'SP', role: 'char' as const },
  { id: 'DEL', label: 'DEL', role: 'delete' as const },
  { id: '/', label: '/', role: 'char' as const },
  { id: 'CLR', label: 'CLR', role: 'clear' as const },
]
const NUM_LAST = [
  { id: '.', label: '.', role: 'char' as const },
  { id: '0', label: '0', role: 'char' as const },
  { id: '+/-', label: '+/-', role: 'char' as const },
]

export const BOEING_737_KEYPAD: KeypadLayout = {
  style: 'BOEING_CDU',
  sections: [
    functionSection(
      [
        [p('INIT_REF', 'INIT REF'), p('RTE', 'RTE'), p('CLB', 'CLB'), p('CRZ', 'CRZ'), p('DES', 'DES'), null],
        [p('MENU', 'MENU'), p('LEGS', 'LEGS'), p('DEP_ARR', 'DEP ARR'), p('HOLD', 'HOLD'), p('PROG', 'PROG'), { id: 'EXEC', label: 'EXEC', role: 'exec', light: true }],
        [p('N1_LIMIT', 'N1 LIMIT'), p('FIX', 'FIX'), null, nav('PREV_PAGE', 'PREV PAGE'), nav('NEXT_PAGE', 'NEXT PAGE'), null],
      ],
      6,
    ),
    alphaSection(ALPHA_EXTRA),
    numericSection(NUM_LAST),
  ],
}

export const BOEING_777_KEYPAD: KeypadLayout = {
  style: 'BOEING_CDU',
  sections: [
    functionSection(
      [
        [p('INIT_REF', 'INIT REF'), p('RTE', 'RTE'), p('DEP_ARR', 'DEP ARR'), p('ALTN', 'ALTN'), p('VNAV', 'VNAV'), null],
        [p('FIX', 'FIX'), p('LEGS', 'LEGS'), p('HOLD', 'HOLD'), p('FMC_COMM', 'FMC COMM'), p('PROG', 'PROG'), { id: 'EXEC', label: 'EXEC', role: 'exec', light: true }],
        [p('MENU', 'MENU'), p('NAV_RAD', 'NAV RAD'), null, nav('PREV_PAGE', 'PREV PAGE'), nav('NEXT_PAGE', 'NEXT PAGE'), null],
      ],
      6,
    ),
    alphaSection(ALPHA_EXTRA),
    numericSection(NUM_LAST),
  ],
}
