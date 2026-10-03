import { A320_CEO_PERF, A320_NEO_PERF, A339_PERF, A359_PERF } from '../models/performance-models'
import type { AirbusVariant } from './variant'

const NOTES = ['fidelity.performanceTraining', 'fidelity.demoNavData', 'fidelity.noDatalink']

export const A320_CEO: AirbusVariant = {
  definition: {
    id: 'A320-CEO',
    manufacturer: 'AIRBUS',
    family: 'A320',
    model: 'A320ceo',
    displayName: 'Airbus A320ceo',
    fmsType: 'FMGS / MCDU',
    systemLabel: 'FMGS / MCDU',
    engine: 'CFM56-5B4',
    icaoType: 'A320',
    fidelityNotes: NOTES,
    quickStart: false,
  },
  performanceModel: A320_CEO_PERF,
  display: 'AIRBUS_MCDU',
  engineLabel: 'CFM56-5B4',
  defaultZfwCg: 27.0,
}

export const A320_NEO: AirbusVariant = {
  definition: {
    id: 'A320-NEO',
    manufacturer: 'AIRBUS',
    family: 'A320',
    model: 'A320neo',
    displayName: 'Airbus A320neo',
    fmsType: 'FMGS / MCDU',
    systemLabel: 'FMGS / MCDU',
    engine: 'LEAP-1A26',
    icaoType: 'A20N',
    fidelityNotes: NOTES,
    quickStart: true,
  },
  performanceModel: A320_NEO_PERF,
  display: 'AIRBUS_MCDU',
  engineLabel: 'LEAP-1A26',
  defaultZfwCg: 27.5,
}

export const A330_900: AirbusVariant = {
  definition: {
    id: 'A330-900',
    manufacturer: 'AIRBUS',
    family: 'A330',
    model: 'A330-900',
    displayName: 'Airbus A330-900',
    fmsType: 'FMGS / MCDU',
    systemLabel: 'FMGS / MCDU',
    engine: 'Trent 7000-72',
    icaoType: 'A339',
    fidelityNotes: NOTES,
    quickStart: false,
  },
  performanceModel: A339_PERF,
  display: 'AIRBUS_MCDU',
  engineLabel: 'TRENT 7000',
  defaultZfwCg: 28.0,
}

export const A350_900: AirbusVariant = {
  definition: {
    id: 'A350-900',
    manufacturer: 'AIRBUS',
    family: 'A350',
    model: 'A350-900',
    displayName: 'Airbus A350-900',
    fmsType: 'FMS / MFD (KCCU)',
    systemLabel: 'FMS / MFD',
    engine: 'Trent XWB-84',
    icaoType: 'A359',
    fidelityNotes: [...NOTES, 'fidelity.a350MfdTextMode'],
    quickStart: false,
  },
  performanceModel: A359_PERF,
  display: 'AIRBUS_MFD',
  engineLabel: 'TRENT XWB-84',
  defaultZfwCg: 30.0,
}

export const AIRBUS_VARIANTS: AirbusVariant[] = [A320_CEO, A320_NEO, A330_900, A350_900]
