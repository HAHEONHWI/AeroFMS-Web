import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConnectorClient } from '@aerofms/simulation'
import type { ConnectorStatus, ConnectorInfo } from '@aerofms/simulation'
import { Button } from '@/components/common/Button'
import { TextInput } from '@/components/common/Form'
import { useSettings } from '@/stores/settings'
import { useFms } from '@/stores/fms'
import { track } from '@/services/analytics'
import { create } from 'zustand'

interface ConnectorStore {
  client?: ConnectorClient
  status: ConnectorStatus
  info?: ConnectorInfo
  message?: string
}

export const useConnector = create<ConnectorStore>(() => ({ status: 'DISCONNECTED' }))

function ensureClient(): ConnectorClient {
  const existing = useConnector.getState().client
  if (existing) return existing
  const client = new ConnectorClient((url) => new WebSocket(url) as never, 'web')
  let lastSent = 0
  client.on('status', (status, message) => {
    useConnector.setState({ status, message })
    if (status === 'CONNECTED') track('simulator_connected', { simulator: useConnector.getState().info?.simulators[0]?.kind ?? 'unknown' })
  })
  client.on('info', (info) => useConnector.setState({ info }))
  client.on('aircraft', (aircraft) => {
    const now = Date.now()
    if (now - lastSent < 1000) return
    lastSent = now
    useFms.getState().dispatch({ type: 'EXTERNAL_STATE', aircraft })
  })
  useConnector.setState({ client })
  return client
}

/** Simulator Companion: connects to AeroFMS Connector over a local WebSocket. */
export function ConnectorPanel() {
  const { t } = useTranslation()
  const host = useSettings((s) => s.settings.connectorHost)
  const update = useSettings((s) => s.update)
  const { status, info, message } = useConnector()
  const plan = useFms((s) => s.state?.activeFlightPlan)
  const [draft, setDraft] = useState(host)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const connected = status === 'CONNECTED' || status === 'WAITING_FOR_SIM'
  return (
    <section className="flex flex-col gap-3" aria-label={t('connector.title')}>
      <h2 className="text-sm font-semibold">{t('connector.title')}</h2>
      <p className="text-xs text-fg-muted">{t('connector.description')}</p>
      <div className="grid gap-2 tablet:grid-cols-[1fr_auto] tablet:items-end">
        <TextInput label={t('connector.host')} placeholder={t('connector.hostPlaceholder')} value={draft} onChange={(e) => setDraft(e.target.value.trim())} />
        {status === 'DISCONNECTED' || status === 'ERROR' ? (
          <Button
            variant="primary"
            disabled={!/^[\w.-]+:\d{2,5}$/.test(draft)}
            onClick={() => {
              update({ connectorHost: draft })
              ensureClient().connect(draft)
            }}
          >
            {t('connector.connect')}
          </Button>
        ) : (
          <Button onClick={() => useConnector.getState().client?.disconnect()}>{t('connector.disconnect')}</Button>
        )}
      </div>
      <p className={`text-sm ${status === 'CONNECTED' ? 'text-ok' : status === 'ERROR' ? 'text-danger' : 'text-fg-muted'}`}>
        {t(`connector.status.${status}`)}
        {message ? ` – ${message}` : ''}
      </p>
      {info && (
        <ul className="text-xs text-fg-muted">
          {info.simulators.map((s) => (
            <li key={s.id}>
              {t('connector.simulator')}: {s.name} {s.available ? '✓' : '—'}
            </li>
          ))}
        </ul>
      )}
      {connected && plan && (
        <Button size="sm" onClick={() => useConnector.getState().client?.sendFlightPlan(plan)}>
          {t('connector.sendRoute')}
        </Button>
      )}
      <p className="text-xs text-fg-faint">{t('connector.webNote')}</p>
    </section>
  )
}
