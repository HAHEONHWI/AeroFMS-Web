import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { FlightMap } from '@/components/map/FlightMap'
import { Button } from '@/components/common/Button'
import { Toggle } from '@/components/common/Form'
import { services } from '@/services/runtime'
import { useFms } from '@/stores/fms'
import { useSettings } from '@/stores/settings'
import { useEffect } from 'react'
import { SimulationPanel, FlightDataPanel } from '@/components/emulator/SimulationPanel'

export function MapPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { state, engine, dispatch, status, openSession } = useFms()
  const { settings, update } = useSettings()
  useEffect(() => {
    if (!state && status === 'idle') void services().sessions.currentSessionId().then((id) => id && openSession(id))
  }, [state, status, openSession])
  if (!state || !engine) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-fg-muted">{t('map.noRoute')}</p>
        <Button className="mt-4" variant="primary" onClick={() => navigate('/emulator')}>
          {t('nav.emulator')}
        </Button>
      </div>
    )
  }
  return (
    <div className="mx-auto grid max-w-[1600px] gap-4 px-2 py-3 tablet:px-4 desktop:grid-cols-[1fr_340px]">
      <div className="h-[70vh] desktop:h-[calc(100vh-6rem)]">
        <FlightMap
          state={state}
          nav={services().nav}
          adapter={engine.adapter}
          showAirways={settings.mapAirways}
          basemap={settings.mapBasemap}
          onSelectLeg={(legId) => dispatch({ type: 'HIGHLIGHT_LEG', legId })}
        />
      </div>
      <aside className="flex flex-col gap-5">
        <div>
          <h1 className="text-lg font-semibold">{t('map.title')}</h1>
          <p className="text-sm text-fg-muted">
            {engine.adapter.definition.displayName} · {state.activeFlightPlan.origin ?? '----'} → {state.activeFlightPlan.destination ?? '----'}
          </p>
          <p className="mt-1 text-xs text-fg-faint">{t('map.selectHint')}</p>
        </div>
        <section>
          <h2 className="mb-1 text-sm font-semibold">{t('map.layers')}</h2>
          <Toggle label={t('map.airways')} checked={settings.mapAirways} onChange={(v) => update({ mapAirways: v })} />
          <Toggle label={t('map.basemap')} description={t('map.basemapHint')} checked={settings.mapBasemap} onChange={(v) => update({ mapBasemap: v })} />
        </section>
        <SimulationPanel />
        <FlightDataPanel state={state} />
        <Button onClick={() => navigate('/emulator')}>{t('map.openEmulator')}</Button>
      </aside>
    </div>
  )
}
