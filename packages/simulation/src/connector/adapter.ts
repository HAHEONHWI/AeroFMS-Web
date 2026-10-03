import type { ExternalAircraftState } from '@aerofms/core'
import type { FlightPlan } from '@aerofms/shared'

/** Abstraction over a flight simulator data source (implemented in the PC connector). */
export interface SimulatorAdapter {
  readonly id: string
  readonly name: string
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  getAircraftState(): Promise<ExternalAircraftState | null>
  getFlightPlan(): Promise<FlightPlan | null>
  setFlightPlan(plan: FlightPlan): Promise<void>
  onAircraftStateChanged(callback: (state: ExternalAircraftState) => void): () => void
  onFmsStateChanged(callback: (plan: FlightPlan) => void): () => void
}
