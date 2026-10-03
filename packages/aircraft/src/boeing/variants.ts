import { B38M_PERF, B738_PERF, B77W_PERF, B789_PERF } from '../models/performance-models'
import type { BoeingVariant } from './variant'

const COMMON_NOTES = [
  'fidelity.performanceTraining',
  'fidelity.demoNavData',
  'fidelity.noDatalink',
]

export const B737_800: BoeingVariant = {
  definition: {
    id: 'B737-800',
    manufacturer: 'BOEING',
    family: 'B737NG',
    model: '737-800',
    displayName: 'Boeing 737-800',
    fmsType: '737 NG FMC',
    systemLabel: 'FMC / CDU',
    engine: 'CFM56-7B26',
    icaoType: 'B738',
    fidelityNotes: [...COMMON_NOTES, 'fidelity.noRte2'],
    quickStart: true,
  },
  performanceModel: B738_PERF,
  cdu: '737',
  displayStyle: 'BOEING_CDU',
  engineRatingLabel: '26K',
  opProgram: 'AEROFMS-NG-SIM',
  climbRatings: ['CLB', 'CLB-1', 'CLB-2'],
}

export const B737_MAX_8: BoeingVariant = {
  definition: {
    id: 'B737-MAX8',
    manufacturer: 'BOEING',
    family: 'B737MAX',
    model: '737-8',
    displayName: 'Boeing 737 MAX 8',
    fmsType: '737 MAX FMC',
    systemLabel: 'FMC / CDU',
    engine: 'LEAP-1B28',
    icaoType: 'B38M',
    fidelityNotes: [...COMMON_NOTES, 'fidelity.noRte2'],
    quickStart: false,
  },
  performanceModel: B38M_PERF,
  cdu: '737',
  displayStyle: 'BOEING_CDU',
  engineRatingLabel: '28K',
  opProgram: 'AEROFMS-MAX-SIM',
  climbRatings: ['CLB', 'CLB-1', 'CLB-2'],
}

export const B777_300ER: BoeingVariant = {
  definition: {
    id: 'B777-300ER',
    manufacturer: 'BOEING',
    family: 'B777',
    model: '777-300ER',
    displayName: 'Boeing 777-300ER',
    fmsType: '777 FMC',
    systemLabel: 'FMC / CDU',
    engine: 'GE90-115BL',
    icaoType: 'B77W',
    fidelityNotes: [...COMMON_NOTES, 'fidelity.noRte2'],
    quickStart: true,
  },
  performanceModel: B77W_PERF,
  cdu: '777',
  displayStyle: 'BOEING_CDU',
  engineRatingLabel: '115B',
  opProgram: 'AEROFMS-777-SIM',
  climbRatings: ['CLB', 'CLB 1', 'CLB 2'],
}

export const B787_9: BoeingVariant = {
  definition: {
    id: 'B787-9',
    manufacturer: 'BOEING',
    family: 'B787',
    model: '787-9',
    displayName: 'Boeing 787-9',
    fmsType: '787 FMC',
    systemLabel: 'FMC / CDU (MFD)',
    engine: 'GEnx-1B74/75',
    icaoType: 'B789',
    fidelityNotes: [...COMMON_NOTES, 'fidelity.mfdCduGeneric', 'fidelity.noRte2'],
    quickStart: true,
  },
  performanceModel: B789_PERF,
  cdu: '777',
  displayStyle: 'BOEING_MFD_CDU',
  engineRatingLabel: '74/75',
  opProgram: 'AEROFMS-787-SIM',
  climbRatings: ['CLB', 'CLB 1', 'CLB 2'],
}

export const BOEING_VARIANTS: BoeingVariant[] = [B737_800, B737_MAX_8, B777_300ER, B787_9]
