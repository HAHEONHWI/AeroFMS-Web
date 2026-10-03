import type { AircraftDefinition, AircraftFmsAdapter } from './adapter'

/**
 * Registry of aircraft modules. New aircraft register an adapter factory here;
 * the core never needs to change to add an aircraft.
 */
export class AircraftRegistry {
  private readonly factories = new Map<string, () => AircraftFmsAdapter>()
  private readonly instances = new Map<string, AircraftFmsAdapter>()
  private readonly definitions = new Map<string, AircraftDefinition>()

  register(definition: AircraftDefinition, factory: () => AircraftFmsAdapter): void {
    if (this.factories.has(definition.id)) throw new Error(`Aircraft ${definition.id} already registered`)
    this.factories.set(definition.id, factory)
    this.definitions.set(definition.id, definition)
  }

  get(aircraftId: string): AircraftFmsAdapter | undefined {
    const cached = this.instances.get(aircraftId)
    if (cached) return cached
    const f = this.factories.get(aircraftId)
    if (!f) return undefined
    const adapter = f()
    this.instances.set(aircraftId, adapter)
    return adapter
  }

  list(): AircraftDefinition[] {
    return [...this.definitions.values()]
  }

  definition(aircraftId: string): AircraftDefinition | undefined {
    return this.definitions.get(aircraftId)
  }
}
