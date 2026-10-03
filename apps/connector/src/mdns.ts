import { Bonjour } from 'bonjour-service'
import { CONNECTOR_MDNS_TYPE, CONNECTOR_PROTOCOL_VERSION, CONNECTOR_WS_PATH } from '@aerofms/simulation'

/** Advertises the connector as _aerofms._tcp so LAN clients can discover it. */
export function advertise(port: number, hostName: string): () => Promise<void> {
  const bonjour = new Bonjour()
  bonjour.publish({ name: `AeroFMS Connector (${hostName})`, type: CONNECTOR_MDNS_TYPE, port, txt: { protocol: String(CONNECTOR_PROTOCOL_VERSION), path: CONNECTOR_WS_PATH } })
  return () =>
    new Promise<void>((resolve) => {
      bonjour.unpublishAll(() => {
        bonjour.destroy()
        resolve()
      })
    })
}
