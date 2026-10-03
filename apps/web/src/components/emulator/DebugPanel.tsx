import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { displayedPlan } from '@aerofms/core'
import type { FmsCommand } from '@aerofms/core'
import { Button } from '@/components/common/Button'
import { Segmented, TextInput } from '@/components/common/Form'
import { toast } from '@/components/common/Toast'
import { services } from '@/services/runtime'
import { useFms } from '@/stores/fms'

const SEED: FmsCommand[] = [
  { kind: 'SET_POSITION_FROM_AIRPORT', icao: 'RKSI' },
  { kind: 'SET_ORIGIN', icao: 'RKSI' },
  { kind: 'SET_DESTINATION', icao: 'RKPK' },
  { kind: 'SET_DEPARTURE_RUNWAY', runway: '33L' },
  { kind: 'SET_SID', procedureId: 'RKSI-SID-BULTI1J' },
  { kind: 'APPEND_ROUTE', via: 'Y711', to: 'OSN' },
  { kind: 'APPEND_ROUTE', via: 'Y722', to: 'KALOD' },
  { kind: 'SET_STAR', procedureId: 'RKPK-STAR-KALOD1A' },
  { kind: 'SET_APPROACH', procedureId: 'RKPK-APP-ILS36L', transition: 'DOTOL' },
  { kind: 'SET_ZFW', value: '58.0' },
  { kind: 'SET_FUEL', value: '9.5' },
  { kind: 'SET_RESERVES', value: '2.5' },
  { kind: 'SET_COST_INDEX', value: '30' },
  { kind: 'SET_CRUISE_ALTITUDE', value: 'FL250' },
  { kind: 'ACTIVATE_ROUTE' },
]

type Tab = 'state' | 'page' | 'plan' | 'events' | 'nav' | 'adapter' | 'sim'

/** Developer tools (hidden in production builds unless VITE_ENABLE_DEBUG_TOOLS=true). */
export function DebugPanel() {
  const { t } = useTranslation()
  const { state, engine, eventLog, dispatch } = useFms()
  const [tab, setTab] = useState<Tab>('page')
  const [q, setQ] = useState('')
  if (!state || !engine) return null
  const nav = services().nav
  const body = (() => {
    switch (tab) {
      case 'state':
        return state
      case 'page':
        return { currentPage: state.currentPage, scratchpad: state.scratchpad, rendered: engine.adapter.renderPage(state, nav) }
      case 'plan':
        return displayedPlan(state)
      case 'events':
        return eventLog.slice(-60)
      case 'nav':
        return q ? { search: nav.search(q), airport: nav.searchAirport(q), waypoints: nav.searchWaypoint(q), airway: nav.getAirway(q) } : nav.meta
      case 'adapter':
        return { definition: engine.adapter.definition, capabilities: engine.adapter.getCapabilities(), pages: engine.adapter.getPages().map((p) => p.id), performance: engine.adapter.performanceModel }
      case 'sim':
        return { simulation: state.simulation, position: state.position, guidance: state.guidance, phase: state.flightPhase }
    }
  })()
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t('debug.title')}</h2>
      <Segmented<Tab>
        label={t('debug.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'page', label: t('debug.page') },
          { value: 'plan', label: t('debug.flightPlan') },
          { value: 'events', label: t('debug.events') },
          { value: 'nav', label: t('debug.navQuery') },
          { value: 'adapter', label: t('debug.adapter') },
          { value: 'sim', label: t('debug.simulation') },
          { value: 'state', label: t('debug.state') },
        ]}
      />
      {tab === 'nav' && <TextInput label={t('debug.navQuery')} value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} />}
      <pre className="max-h-96 overflow-auto rounded-md bg-cdu-screen p-3 text-[11px] text-cdu-green">{JSON.stringify(body, null, 2)}</pre>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            for (const command of SEED) dispatch({ type: 'COMMAND', command })
            toast(t('debug.seeded'), 'success')
          }}
        >
          {t('debug.seedScenario')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={async () => {
            if (!window.confirm(t('settings.resetLocalConfirm'))) return
            await services().database.destroy()
            window.location.reload()
          }}
        >
          {t('debug.resetDb')}
        </Button>
      </div>
    </section>
  )
}
