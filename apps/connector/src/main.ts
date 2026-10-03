import { hostname, networkInterfaces } from 'node:os'
import { parseArgs } from 'node:util'
import { CONNECTOR_DEFAULT_PORT } from '@aerofms/simulation'
import { DemoAdapter } from './adapters/demo'
import { MsfsAdapter } from './adapters/msfs'
import type { Logger, SimulatorAdapter } from './adapters/types'
import { XPlaneAdapter } from './adapters/xplane'
import { advertise } from './mdns'
import { ConnectorServer } from './server'

const VERSION = '1.0.0'

const HELP = `AeroFMS Connector ${VERSION}
Bridges Microsoft Flight Simulator (SimConnect) and X-Plane 11/12 (UDP) to AeroFMS Web/Android.

Usage: aerofms-connector [options]

  --port <n>             WebSocket/HTTP port (default ${CONNECTOR_DEFAULT_PORT})
  --bind <addr>          Interface to listen on (default 0.0.0.0)
  --xplane-host <addr>   X-Plane host (default 127.0.0.1)
  --xplane-port <n>      X-Plane UDP receive port (default 49000)
  --xplane-fms-dir <dir> Write AEROFMS.fms here when a flight plan is sent (X-Plane "Output/FMS plans")
  --msfs-host <addr>     Remote SimConnect host (default: local MSFS on this PC)
  --msfs-port <n>        Remote SimConnect port (default 500)
  --msfs-pln-dir <dir>   Write AEROFMS.PLN here when a flight plan is sent
  --no-xplane            Disable the X-Plane adapter
  --no-msfs              Disable the MSFS adapter
  --no-demo              Disable the built-in demo flight
  --demo-speed <n>       Demo flight time scale (default 1)
  --no-mdns              Do not advertise on the local network
  -h, --help             Show this help
`

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address)
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      bind: { type: 'string' },
      'xplane-host': { type: 'string' },
      'xplane-port': { type: 'string' },
      'xplane-fms-dir': { type: 'string' },
      'msfs-host': { type: 'string' },
      'msfs-port': { type: 'string' },
      'msfs-pln-dir': { type: 'string' },
      'no-xplane': { type: 'boolean' },
      'no-msfs': { type: 'boolean' },
      'no-demo': { type: 'boolean' },
      'demo-speed': { type: 'string' },
      'no-mdns': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    process.stdout.write(HELP)
    return
  }
  const int = (v: string | undefined, d: number) => {
    const n = v === undefined ? d : Number.parseInt(v, 10)
    if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`Invalid number: ${v}`)
    return n
  }
  const logger: Logger = {
    info: (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`),
    warn: (m) => console.warn(`[${new Date().toLocaleTimeString()}] ${m}`),
  }
  const adapters: SimulatorAdapter[] = []
  if (!values['no-msfs']) adapters.push(new MsfsAdapter({ host: values['msfs-host'], port: values['msfs-port'] ? int(values['msfs-port'], 500) : undefined, plnDir: values['msfs-pln-dir'], logger }))
  if (!values['no-xplane']) adapters.push(new XPlaneAdapter({ host: values['xplane-host'] ?? '127.0.0.1', port: int(values['xplane-port'], 49000), fmsDir: values['xplane-fms-dir'], logger }))
  if (!values['no-demo']) adapters.push(new DemoAdapter(Math.max(1, Math.min(16, Number(values['demo-speed'] ?? 1) || 1))))

  const host = hostname()
  const server = new ConnectorServer({ port: int(values.port, CONNECTOR_DEFAULT_PORT), bindHost: values.bind, hostName: host, version: VERSION, adapters, logger })
  const port = await server.start()
  const stopMdns = values['no-mdns'] ? undefined : advertise(port, host)
  logger.info(`AeroFMS Connector ${VERSION} listening on port ${port}`)
  for (const ip of lanAddresses()) logger.info(`  Enter in AeroFMS: ${ip}:${port}`)
  logger.info(`Simulators: ${adapters.map((a) => a.name).join(', ') || 'none'}`)

  let stopping = false
  const shutdown = async () => {
    if (stopping) return
    stopping = true
    logger.info('Stopping…')
    await stopMdns?.()
    await server.stop()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
