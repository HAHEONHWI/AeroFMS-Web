import { useTranslation } from 'react-i18next'
import { formatAltitude, isLeg } from '@aerofms/shared'
import type { FmsState } from '@aerofms/core'
import { Button } from '@/components/common/Button'
import { Segmented } from '@/components/common/Form'
import { useFms } from '@/stores/fms'
import { track } from '@/services/analytics'

const RATES = [1, 2, 4, 8, 16] as const

export function SimulationPanel() {
  const { t } = useTranslation()
  const state = useFms((s) => s.state)
  const dispatch = useFms((s) => s.dispatch)
  if (!state) return null
  const sim = state.simulation
  const plan = state.activeFlightPlan
  const canStart = (sim.status === 'IDLE' || sim.status === 'COMPLETED') && !!plan.origin && plan.elements.filter(isLeg).length >= 2 && (plan.activated || state.aircraft.manufacturer === 'AIRBUS')
  const control = (kind: 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'RESET' | 'GO_AROUND') => {
    dispatch({ type: 'SIM_CONTROL', control: { kind } })
    if (kind === 'START') track('simulation_started', { aircraft_id: state.aircraft.aircraftId })
  }
  return (
    <section className="flex flex-col gap-3" aria-label={t('emulator.simulation')}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('emulator.simulation')}</h2>
        <span className={`text-xs ${sim.status === 'RUNNING' ? 'text-ok' : sim.status === 'PAUSED' ? 'text-warn' : 'text-fg-muted'}`}>{t(`emulator.simStatus.${sim.status}`)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {(sim.status === 'IDLE' || sim.status === 'COMPLETED') && (
          <Button variant="primary" size="sm" disabled={!canStart} onClick={() => control('START')}>
            {t('emulator.simStart')}
          </Button>
        )}
        {sim.status === 'RUNNING' && (
          <Button size="sm" onClick={() => control('PAUSE')}>
            {t('emulator.simPause')}
          </Button>
        )}
        {sim.status === 'PAUSED' && (
          <Button size="sm" variant="primary" onClick={() => control('RESUME')}>
            {t('emulator.simResume')}
          </Button>
        )}
        {(sim.status === 'RUNNING' || sim.status === 'PAUSED') && (
          <Button size="sm" onClick={() => control('STOP')}>
            {t('emulator.simStop')}
          </Button>
        )}
        {state.flightPhase === 'APPROACH' && (
          <Button size="sm" onClick={() => control('GO_AROUND')}>
            {t('emulator.simGoAround')}
          </Button>
        )}
        {sim.status === 'COMPLETED' && (
          <Button size="sm" variant="ghost" onClick={() => control('RESET')}>
            {t('emulator.simReset')}
          </Button>
        )}
      </div>
      {!canStart && sim.status === 'IDLE' && <p className="text-xs text-fg-faint">{t('emulator.simNeedsRoute')}</p>}
      <div className="flex items-center gap-2">
        <span className="text-xs text-fg-muted">{t('emulator.simRate')}</span>
        <Segmented
          label={t('emulator.simRate')}
          value={String(sim.timeScale)}
          options={RATES.map((r) => ({ value: String(r), label: `${r}×` }))}
          onChange={(v) => dispatch({ type: 'SIM_CONTROL', control: { kind: 'SET_SPEED', timeScale: Number(v) as 1 | 2 | 4 | 8 | 16 } })}
        />
      </div>
    </section>
  )
}

function Datum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</dt>
      <dd className="cdu-font mt-0.5 text-sm text-fg">{value}</dd>
    </div>
  )
}

export function FlightDataPanel({ state }: { state: FmsState }) {
  const { t } = useTranslation()
  const p = state.position
  const s = state.simulation
  const active = state.activeFlightPlan.elements[state.activeFlightPlan.activeLegIndex]
  const trans = state.performance.transitionAltitudeFt ?? 18000
  return (
    <section aria-label={t('emulator.flightData')}>
      <h2 className="mb-2 text-sm font-semibold">{t('emulator.flightData')}</h2>
      <dl className="grid grid-cols-2 gap-2 tablet:grid-cols-3">
        <Datum label={t('emulator.phase')} value={t(`phase.${state.flightPhase}`)} />
        <Datum label={t('emulator.altitude')} value={formatAltitude(p.altitudeFt, trans)} />
        <Datum label={t('emulator.groundSpeed')} value={`${Math.round(p.groundSpeedKt)} kt`} />
        <Datum label={t('emulator.airspeed')} value={`${Math.round(s.indicatedAirspeedKt)} / M${s.mach.toFixed(2)}`} />
        <Datum label={t('emulator.verticalSpeed')} value={`${s.verticalSpeedFpm > 0 ? '+' : ''}${s.verticalSpeedFpm} fpm`} />
        <Datum label={t('emulator.heading')} value={`${String(Math.round(p.headingTrue)).padStart(3, '0')}°T`} />
        <Datum label={t('emulator.fuel')} value={`${(((s.status === 'IDLE' ? state.performance.fuelKg : s.fuelKg) ?? 0) / 1000).toFixed(1)} t`} />
        <Datum label={t('emulator.distanceToGo')} value={`${Math.round(state.guidance.distanceToDestinationNm)} NM`} />
        <Datum label={t('emulator.activeWaypoint')} value={isLeg(active) ? active.waypoint.ident : '—'} />
        <Datum label={`${t('emulator.lnav')} / ${t('emulator.vnav')}`} value={`${state.guidance.lnav} / ${state.guidance.vnav}`} />
        <Datum label={t('emulator.xtk')} value={`${Math.abs(state.guidance.crossTrackNm).toFixed(2)} NM ${state.guidance.crossTrackNm < 0 ? 'L' : 'R'}`} />
      </dl>
    </section>
  )
}
