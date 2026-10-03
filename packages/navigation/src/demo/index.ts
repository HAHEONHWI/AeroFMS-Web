import type { NavDataset } from '../provider'
import { DEMO_AIRPORTS } from './airports'
import { DEMO_ENROUTE_FIXES, DEMO_NAVAIDS, resolveAirways } from './enroute'
import { buildDemoProcedures } from './procedures'

export const DEMO_DATASET_ID = 'aerofms-demo'
export const DEMO_DATASET_CYCLE = 'DEMO-2026-01'

let cached: NavDataset | undefined

/** Builds the bundled demo navigation dataset (deterministic, offline). */
export function buildDemoDataset(): NavDataset {
  if (cached) return cached
  const proc = buildDemoProcedures(DEMO_AIRPORTS)
  const waypoints = [...DEMO_ENROUTE_FIXES, ...proc.fixes]
  cached = {
    meta: {
      id: DEMO_DATASET_ID,
      name: 'AeroFMS Demo Navigation Dataset',
      cycle: DEMO_DATASET_CYCLE,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2099-12-31',
      source:
        'Synthetic training dataset created for AeroFMS. Airport reference points are approximate public coordinates; procedures and airways are simplified fictional examples.',
      isDemo: true,
    },
    airports: DEMO_AIRPORTS,
    waypoints,
    navaids: DEMO_NAVAIDS,
    airways: resolveAirways([...waypoints, ...DEMO_NAVAIDS]),
    procedures: proc.procedures,
  }
  return cached
}
