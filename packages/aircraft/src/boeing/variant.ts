import type { AircraftDefinition, FmsPageDefinition, PerformanceModel } from '@aerofms/core'

/** Differences between Boeing FMC variants handled by the shared Boeing FMC module. */
export interface BoeingVariant {
  definition: AircraftDefinition
  performanceModel: PerformanceModel
  /**
   * 737: dedicated CLB/CRZ/DES/N1 LIMIT keys, N1 LIMIT page.
   * 777/787: VNAV key (CLB/CRZ/DES as VNAV 1-3), THRUST LIM page, ALTN, NAV RAD, FMC COMM keys.
   */
  cdu: '737' | '777'
  displayStyle: 'BOEING_CDU' | 'BOEING_MFD_CDU'
  /** Engine rating shown on IDENT, e.g. 26K */
  engineRatingLabel: string
  /** Operational program identifier shown on IDENT. */
  opProgram: string
  /** Climb thrust ratings shown on N1 LIMIT / THRUST LIM. */
  climbRatings: string[]
  /** Variant specific additional pages. */
  extraPages?: (v: BoeingVariant) => FmsPageDefinition[]
}
