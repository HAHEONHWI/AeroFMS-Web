import type { AircraftDefinition, PerformanceModel } from '@aerofms/core'

export interface AirbusVariant {
  definition: AircraftDefinition
  performanceModel: PerformanceModel
  /** A320/A330: MCDU. A350: MFD operated with the KCCU (text-mode approximation). */
  display: 'AIRBUS_MCDU' | 'AIRBUS_MFD'
  /** Shown on A/C STATUS. */
  engineLabel: string
  /** Default ZFWCG (%MAC). */
  defaultZfwCg: number
}
