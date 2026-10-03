import { AircraftRegistry } from '@aerofms/core'
import { BoeingFmcAdapter } from './boeing/adapter'
import { BOEING_VARIANTS } from './boeing/variants'
import { AirbusFmgsAdapter } from './airbus/adapter'
import { AIRBUS_VARIANTS } from './airbus/variants'

/** Creates the registry with every built-in aircraft module. */
export function createAircraftRegistry(): AircraftRegistry {
  const registry = new AircraftRegistry()
  for (const v of BOEING_VARIANTS) registry.register(v.definition, () => new BoeingFmcAdapter(v))
  for (const v of AIRBUS_VARIANTS) registry.register(v.definition, () => new AirbusFmgsAdapter(v))
  return registry
}
