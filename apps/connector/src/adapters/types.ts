import type { ExternalAircraftState } from '@aerofms/core'
import type { FlightPlan } from '@aerofms/shared'
import type { SimulatorInfo, SimulatorKind } from '@aerofms/simulation'

export interface Logger {
  info(msg: string): void
  warn(msg: string): void
}

export const silentLogger: Logger = { info: () => undefined, warn: () => undefined }

export interface SimulatorAdapter {
  readonly id: string
  readonly kind: SimulatorKind
  readonly name: string
  info(): SimulatorInfo
  start(): Promise<void>
  stop(): Promise<void>
  onState(cb: (s: ExternalAircraftState) => void): () => void
  onAvailability(cb: (available: boolean) => void): () => void
  /** Hands a flight plan to the simulator. Resolves with a human readable result (e.g. exported file path). */
  setFlightPlan?(plan: FlightPlan): Promise<string | undefined>
}

/** Shared listener and availability bookkeeping for adapters. */
export abstract class BaseAdapter implements SimulatorAdapter {
  abstract readonly id: string
  abstract readonly kind: SimulatorKind
  abstract readonly name: string
  protected available = false
  protected detail?: string
  private readonly stateListeners = new Set<(s: ExternalAircraftState) => void>()
  private readonly availabilityListeners = new Set<(available: boolean) => void>()

  info(): SimulatorInfo {
    return { id: this.id, kind: this.kind, name: this.name, available: this.available, ...(this.detail ? { detail: this.detail } : {}) }
  }

  abstract start(): Promise<void>
  abstract stop(): Promise<void>

  onState(cb: (s: ExternalAircraftState) => void): () => void {
    this.stateListeners.add(cb)
    return () => this.stateListeners.delete(cb)
  }

  onAvailability(cb: (available: boolean) => void): () => void {
    this.availabilityListeners.add(cb)
    return () => this.availabilityListeners.delete(cb)
  }

  protected emitState(s: ExternalAircraftState): void {
    for (const cb of this.stateListeners) cb(s)
  }

  protected setAvailable(available: boolean, detail?: string): void {
    const changed = available !== this.available || detail !== this.detail
    this.available = available
    this.detail = detail
    if (changed) for (const cb of this.availabilityListeners) cb(available)
  }
}

export const M_TO_FT = 3.280839895
export const MPS_TO_KT = 1.943844492
export const LB_TO_KG = 0.45359237

export const normalizeDeg = (d: number): number => ((d % 360) + 360) % 360
