import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { FieldBinding } from '@aerofms/core'
import { lessonById, scenarioById } from '@aerofms/training'
import { CduFrame } from '@/components/cdu/CduFrame'
import { ExplainPanel } from '@/components/cdu/ExplainPanel'
import { FlightMap } from '@/components/map/FlightMap'
import { ModernView } from '@/components/emulator/ModernView'
import { AircraftSelector } from '@/components/emulator/AircraftSelector'
import { SwitchAircraftDialog } from '@/components/emulator/SwitchAircraftDialog'
import { SessionMenu } from '@/components/emulator/SessionMenu'
import { FlightDataPanel, SimulationPanel } from '@/components/emulator/SimulationPanel'
import { TimelinePanel } from '@/components/emulator/TimelinePanel'
import { FlightPlanDialog } from '@/components/emulator/FlightPlanDialog'
import { ConnectorPanel } from '@/components/emulator/ConnectorPanel'
import { DebugPanel } from '@/components/emulator/DebugPanel'
import { TrainingOverlay } from '@/components/training/TrainingOverlay'
import { Button } from '@/components/common/Button'
import { Dialog } from '@/components/common/Dialog'
import { Segmented } from '@/components/common/Form'
import { services, isDebugBuild } from '@/services/runtime'
import { useFms } from '@/stores/fms'
import { useSettings } from '@/stores/settings'
import { useTraining } from '@/stores/training'
import type { EmulatorLayout, ViewMode } from '@/stores/settings'
import { track } from '@/services/analytics'

type SideTab = 'map' | 'data' | 'timeline' | 'connector' | 'debug'

export function EmulatorPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { state, engine, status, dispatch, openAircraft, openSession } = useFms()
  const { settings, update } = useSettings()
  const training = useTraining()
  const [explainMode, setExplainMode] = useState(false)
  const [explainKey, setExplainKey] = useState<string | null>(null)
  const [switchTarget, setSwitchTarget] = useState<string | null>(null)
  const [showSessions, setShowSessions] = useState(false)
  const [showIo, setShowIo] = useState(false)
  const [showSelector, setShowSelector] = useState(false)
  const [side, setSide] = useState<SideTab>('map')

  // Bring back a lesson/scenario that was running in this session before the page was closed.
  const sessionId = state?.session.sessionId
  useEffect(() => {
    if (sessionId) void useTraining.getState().resume(sessionId)
  }, [sessionId])

  const aircraftParam = params.get('aircraft')
  const paramSwitch = aircraftParam && state && state.aircraft.aircraftId !== aircraftParam ? aircraftParam : null

  // Deep links: ?aircraft= ?session= ?lesson= ?scenario=
  useEffect(() => {
    const lesson = params.get('lesson')
    const scenario = params.get('scenario')
    const session = params.get('session')
    const aircraft = params.get('aircraft')
    if (lesson) {
      const l = lessonById(lesson)
      if (l) void training.startLesson(l)
      setParams({}, { replace: true })
    } else if (scenario) {
      const s = scenarioById(scenario)
      if (s) void training.startScenario(s)
      else
        void services()
          .scenarios.get(scenario)
          .then((r) => r && training.startScenario(r.doc, { cloud: r.source === 'CLOUD' }))
      setParams({}, { replace: true })
    } else if (session) {
      void openSession(session)
      setParams({}, { replace: true })
    } else if (aircraft) {
      // A different aircraft than the open session is confirmed through the switch dialog (paramSwitch below).
      if (!state) {
        void openAircraft(aircraft)
        setParams({}, { replace: true })
      } else if (state.aircraft.aircraftId === aircraft) setParams({}, { replace: true })
    } else if (!state && status === 'idle') {
      void services()
        .sessions.currentSessionId()
        .then(async (id) => {
          if (id && (await openSession(id)) === 'ok') return
          setShowSelector(true)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const adapter = engine?.adapter
  const nav = services().nav
  const step = training.active?.kind === 'LESSON' ? training.active.runner.currentStep : undefined
  useTraining((s) => s.revision)
  const onExplain = (b: FieldBinding) => b.explainKey && setExplainKey(b.explainKey)
  const layout = settings.layout
  const tabs = useMemo(() => {
    const list: Array<{ value: SideTab; label: string }> = [
      { value: 'map', label: t('nav.map') },
      { value: 'data', label: t('emulator.flightData') },
      { value: 'timeline', label: t('emulator.timeline') },
      { value: 'connector', label: t('connector.title') },
    ]
    if (isDebugBuild) list.push({ value: 'debug', label: t('emulator.debug') })
    return list
  }, [t])

  if (!state || !adapter) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold">{t('aircraft.select')}</h1>
        {status === 'loading' ? <p className="text-fg-muted">{t('app.loading')}</p> : <AircraftSelector onStart={(id) => void openAircraft(id)} />}
      </div>
    )
  }

  const def = adapter.definition
  const panel = (
    <div className="flex flex-col gap-4">
      {training.active && <TrainingOverlay />}
      <div className="flex flex-col gap-3">
        <Segmented<SideTab> label={t('emulator.panel')} value={side} onChange={setSide} options={tabs} />
        {side === 'map' && (
          <div className="h-[46vh] min-h-72 tablet:h-[56vh]">
            <FlightMap state={state} nav={nav} adapter={adapter} showAirways={settings.mapAirways} basemap={settings.mapBasemap} onSelectLeg={(legId) => dispatch({ type: 'HIGHLIGHT_LEG', legId })} />
          </div>
        )}
        {side === 'data' && (
          <div className="flex flex-col gap-5">
            <SimulationPanel />
            <FlightDataPanel state={state} />
          </div>
        )}
        {side === 'timeline' && <TimelinePanel />}
        {side === 'connector' && <ConnectorPanel />}
        {side === 'debug' && isDebugBuild && <DebugPanel />}
      </div>
      {side === 'map' && <SimulationPanel />}
    </div>
  )

  const cdu = (
    <CduFrame
      state={state}
      adapter={adapter}
      nav={nav}
      dispatch={dispatch}
      explainMode={explainMode}
      onExplain={onExplain}
      highlightKeys={step?.highlightKeys}
      highlightLsk={step?.highlightLsk}
    />
  )

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-2 py-3 tablet:px-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowSelector(true)}
          className="flex h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 text-left hover:border-line-strong"
          aria-label={t('aircraft.switchTitle')}
        >
          <span className="text-sm font-semibold">{def.displayName}</span>
          <span className="hidden text-xs text-fg-muted tablet:inline">{def.fmsType}</span>
        </button>
        <Button size="md" variant="ghost" onClick={() => setShowSessions(true)}>
          {state.session.name}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented<ViewMode>
            label={t('emulator.viewMode')}
            value={settings.viewMode}
            onChange={(v) => {
              update({ viewMode: v })
              track('view_mode_changed', { mode: v })
            }}
            options={[
              { value: 'CLASSIC', label: t('emulator.classic') },
              { value: 'MODERN', label: t('emulator.modern') },
            ]}
          />
          <div className="hidden tablet:block">
            <Segmented<EmulatorLayout>
              label={t('emulator.viewMode')}
              value={layout}
              onChange={(v) => update({ layout: v })}
              options={[
                { value: 'CDU', label: t('emulator.layoutCduOnly') },
                { value: 'SPLIT', label: t('emulator.layoutSplit') },
                { value: 'MAP', label: t('emulator.layoutMap') },
              ]}
            />
          </div>
          <Button size="md" variant={explainMode ? 'primary' : 'secondary'} aria-pressed={explainMode} onClick={() => setExplainMode(!explainMode)} title={t('emulator.explainOn')}>
            ⓘ {t('emulator.explain')}
          </Button>
          <Button size="md" onClick={() => setShowIo(true)}>
            {t('common.import')} / {t('common.export')}
          </Button>
        </div>
      </div>
      {explainMode && <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">{t('emulator.explainOn')}</p>}

      {/* Workspace */}
      {layout === 'MAP' ? (
        <div className="grid gap-4 desktop:grid-cols-[minmax(320px,400px)_1fr]">
          <div className="order-2 desktop:order-1">{settings.viewMode === 'MODERN' ? <ModernView state={state} /> : cdu}</div>
          <div className="order-1 h-[60vh] desktop:order-2 desktop:h-[calc(100vh-9rem)]">
            <FlightMap state={state} nav={nav} adapter={adapter} showAirways={settings.mapAirways} basemap={settings.mapBasemap} onSelectLeg={(legId) => dispatch({ type: 'HIGHLIGHT_LEG', legId })} />
          </div>
        </div>
      ) : layout === 'CDU' ? (
        <div className="mx-auto w-full max-w-[540px]">
          {training.active && <div className="mb-3"><TrainingOverlay /></div>}
          {settings.viewMode === 'MODERN' ? <ModernView state={state} /> : cdu}
        </div>
      ) : (
        <div className="grid gap-4 tablet:grid-cols-[minmax(340px,520px)_1fr]">
          <div className="w-full">{settings.viewMode === 'MODERN' ? <ModernView state={state} /> : cdu}</div>
          <div className="min-w-0">{panel}</div>
        </div>
      )}
      <p className="text-center text-[11px] text-fg-faint">{t('app.disclaimerShort')}</p>

      <ExplainPanel explainKey={explainKey} onClose={() => setExplainKey(null)} onNavigate={setExplainKey} />
      <SwitchAircraftDialog
        target={switchTarget ?? paramSwitch}
        onClose={() => {
          setSwitchTarget(null)
          if (aircraftParam) setParams({}, { replace: true })
        }}
      />
      <SessionMenu open={showSessions} onClose={() => setShowSessions(false)} />
      <FlightPlanDialog open={showIo} onClose={() => setShowIo(false)} />
      <Dialog open={showSelector} title={t('aircraft.select')} onClose={() => setShowSelector(false)} wide>
        <AircraftSelector
          initial={state.aircraft.aircraftId}
          onStart={(id) => {
            setShowSelector(false)
            if (id !== state.aircraft.aircraftId) setSwitchTarget(id)
            else navigate('/emulator')
          }}
        />
      </Dialog>
    </div>
  )
}
