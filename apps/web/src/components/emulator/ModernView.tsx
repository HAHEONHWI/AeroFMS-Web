import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDurationHm, formatFlightLevel, isLeg, kgToLb, lbToKg, legDetail, unitPreferences } from '@aerofms/shared'
import { computeVnavProfile, displayedPerformance, displayedPlan, procedureRunways, hasModification } from '@aerofms/core'
import type { FmsCommand, FmsState } from '@aerofms/core'
import { Button } from '@/components/common/Button'
import { SelectInput, TextInput } from '@/components/common/Form'
import { toast } from '@/components/common/Toast'
import { services } from '@/services/runtime'
import { useFms } from '@/stores/fms'
import { useSettings } from '@/stores/settings'

function useCommand() {
  const dispatch = useFms((s) => s.dispatch)
  return (command: FmsCommand): boolean => {
    const events = dispatch({ type: 'COMMAND', command })
    const err = events.find((e) => e.type === 'ERROR')
    const msg = events.find((e) => e.type === 'MESSAGE')
    if (err) {
      toast(`${msg?.value ?? err.detail}${err.value ? ` (${String(err.value)})` : ''}`, 'error')
      return false
    }
    return true
  }
}

function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-bg-elevated">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function PendingBanner({ state }: { state: FmsState }) {
  const { t } = useTranslation()
  const run = useCommand()
  if (!hasModification(state)) return null
  const boeing = state.aircraft.manufacturer === 'BOEING'
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/50 bg-warn/10 px-4 py-3" role="status">
      <p className="flex-1 text-sm">{boeing ? t('modern.pendingBoeing') : t('modern.pendingAirbus')}</p>
      <Button size="sm" variant="ghost" onClick={() => run({ kind: 'ERASE' })}>
        {t('modern.erase')}
      </Button>
      <Button size="sm" variant="primary" onClick={() => run({ kind: 'EXECUTE' })}>
        {boeing ? t('modern.execute') : t('modern.insert')}
      </Button>
    </div>
  )
}

export function ModernView({ state }: { state: FmsState }) {
  const { t } = useTranslation()
  const run = useCommand()
  const dispatch = useFms((s) => s.dispatch)
  const units = unitPreferences(useSettings((s) => s.settings.units))
  const nav = services().nav
  const adapter = services().registry.get(state.aircraft.aircraftId)
  const plan = displayedPlan(state)
  const perf = displayedPerformance(state)
  const [origin, setOrigin] = useState(plan.origin ?? '')
  const [dest, setDest] = useState(plan.destination ?? '')
  const [via, setVia] = useState('')
  const [to, setTo] = useState('')
  const [perfDraft, setPerfDraft] = useState<Record<string, string>>({})

  const originAp = plan.origin ? nav.searchAirport(plan.origin) : undefined
  const destAp = plan.destination ? nav.searchAirport(plan.destination) : undefined
  const sids = originAp ? nav.getDepartures(originAp.icao).filter((p) => !plan.departureRunway || procedureRunways(p, originAp).includes(plan.departureRunway)) : []
  const stars = destAp ? nav.getArrivals(destAp.icao) : []
  const approaches = destAp ? nav.getApproaches(destAp.icao) : []
  const sidProc = plan.sid ? nav.getProcedure(plan.sid.id) : undefined
  const starProc = plan.star ? nav.getProcedure(plan.star.id) : undefined
  const appProc = plan.approach ? nav.getProcedure(plan.approach.id) : undefined
  const profile = adapter ? computeVnavProfile(plan, perf, adapter.performanceModel, nav) : undefined

  const weight = (kg: number | undefined) =>
    kg === undefined ? '' : units.weight === 'lb' ? `${Math.round(kgToLb(kg)).toLocaleString()} lb` : `${Math.round(kg).toLocaleString()} kg`
  const toKgString = (v: string): string => {
    const n = Number(v.replace(/,/g, ''))
    if (!Number.isFinite(n)) return v
    const kg = units.weight === 'lb' ? lbToKg(n) : n
    return String(Math.round(kg))
  }

  const perfField = (key: 'SET_CRUISE_ALTITUDE' | 'SET_COST_INDEX' | 'SET_ZFW' | 'SET_FUEL' | 'SET_RESERVES', label: string, current: string, weightField = false) => (
    <div className="grid grid-cols-[1fr_auto] items-end gap-2">
      <TextInput label={label} value={perfDraft[key] ?? ''} placeholder={current || '—'} inputMode="decimal" onChange={(e) => setPerfDraft({ ...perfDraft, [key]: e.target.value })} />
      <Button
        disabled={!perfDraft[key]}
        onClick={() => {
          const raw = perfDraft[key] ?? ''
          if (run({ kind: key, value: weightField ? toKgString(raw) : raw })) setPerfDraft({ ...perfDraft, [key]: '' })
        }}
      >
        {t('modern.apply')}
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">{t('modern.title')}</h1>
        <p className="text-sm text-fg-muted">{t('modern.subtitle')}</p>
      </div>
      <PendingBanner state={state} />
      {!state.position.initialized && plan.origin && (
        <Button onClick={() => run({ kind: 'SET_POSITION_FROM_AIRPORT', icao: plan.origin ?? '' })}>{t('modern.position')}</Button>
      )}

      <Card title={t('modern.route')}>
        <div className="grid gap-3 tablet:grid-cols-2">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <TextInput label={t('modern.origin')} value={origin} maxLength={4} onChange={(e) => setOrigin(e.target.value.toUpperCase())} />
            <Button disabled={origin === (plan.origin ?? '') || origin.length !== 4} onClick={() => run({ kind: 'SET_ORIGIN', icao: origin })}>
              {t('modern.apply')}
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <TextInput label={t('modern.destination')} value={dest} maxLength={4} onChange={(e) => setDest(e.target.value.toUpperCase())} />
            <Button disabled={dest === (plan.destination ?? '') || dest.length !== 4} onClick={() => run({ kind: 'SET_DESTINATION', icao: dest })}>
              {t('modern.apply')}
            </Button>
          </div>
          {originAp && (
            <SelectInput
              label={t('modern.runway')}
              value={plan.departureRunway ?? ''}
              onChange={(e) => e.target.value && run({ kind: 'SET_DEPARTURE_RUNWAY', runway: e.target.value })}
              options={[{ value: '', label: '—' }, ...originAp.runways.map((r) => ({ value: r.ident, label: `${r.ident} (${Math.round(r.lengthFt * 0.3048)} m)` }))]}
            />
          )}
          {originAp && (
            <SelectInput
              label={t('modern.sid')}
              value={plan.sid?.id ?? ''}
              onChange={(e) => run({ kind: 'SET_SID', procedureId: e.target.value || null })}
              options={[{ value: '', label: t('modern.none') }, ...sids.map((p) => ({ value: p.id, label: p.name }))]}
            />
          )}
          {sidProc && sidProc.transitions.length > 0 && (
            <SelectInput
              label={`${t('modern.sid')} ${t('modern.transition')}`}
              value={plan.sid?.transition ?? ''}
              onChange={(e) => run({ kind: 'SET_SID', procedureId: sidProc.id, transition: e.target.value || undefined })}
              options={[{ value: '', label: t('modern.none') }, ...sidProc.transitions.map((tr) => ({ value: tr.name, label: tr.name }))]}
            />
          )}
          {destAp && (
            <SelectInput
              label={t('modern.star')}
              value={plan.star?.id ?? ''}
              onChange={(e) => run({ kind: 'SET_STAR', procedureId: e.target.value || null })}
              options={[{ value: '', label: t('modern.none') }, ...stars.map((p) => ({ value: p.id, label: p.name }))]}
            />
          )}
          {starProc && starProc.transitions.length > 0 && (
            <SelectInput
              label={`${t('modern.star')} ${t('modern.transition')}`}
              value={plan.star?.transition ?? ''}
              onChange={(e) => run({ kind: 'SET_STAR', procedureId: starProc.id, transition: e.target.value || undefined })}
              options={[{ value: '', label: t('modern.none') }, ...starProc.transitions.map((tr) => ({ value: tr.name, label: tr.name }))]}
            />
          )}
          {destAp && (
            <SelectInput
              label={t('modern.approach')}
              value={plan.approach?.id ?? ''}
              onChange={(e) => run({ kind: 'SET_APPROACH', procedureId: e.target.value || null })}
              options={[{ value: '', label: t('modern.none') }, ...approaches.map((p) => ({ value: p.id, label: p.name }))]}
            />
          )}
          {appProc && appProc.transitions.length > 0 && (
            <SelectInput
              label={`${t('modern.approach')} ${t('modern.transition')}`}
              value={plan.approach?.transition ?? ''}
              onChange={(e) => run({ kind: 'SET_APPROACH', procedureId: appProc.id, transition: e.target.value || undefined })}
              options={[{ value: '', label: t('modern.none') }, ...appProc.transitions.map((tr) => ({ value: tr.name, label: tr.name }))]}
            />
          )}
        </div>
        <div className="mt-4 grid gap-2 tablet:grid-cols-[1fr_1fr_auto] tablet:items-end">
          <TextInput label={t('modern.via')} value={via} placeholder="DIRECT" onChange={(e) => setVia(e.target.value.toUpperCase())} />
          <TextInput label={t('modern.to')} value={to} onChange={(e) => setTo(e.target.value.toUpperCase())} />
          <Button
            variant="primary"
            disabled={!to}
            onClick={() => {
              if (run({ kind: 'APPEND_ROUTE', via: via || 'DIRECT', to })) {
                setVia('')
                setTo('')
              }
            }}
          >
            {t('modern.add')}
          </Button>
        </div>
        {!state.activeFlightPlan.activated && plan.origin && plan.destination && state.aircraft.manufacturer === 'BOEING' && (
          <div className="mt-3">
            <Button onClick={() => run({ kind: 'ACTIVATE_ROUTE' })}>{t('modern.activateRoute')}</Button>
          </div>
        )}
      </Card>

      <Card title={t('modern.legs')}>
        {plan.elements.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('modern.noLegs')}</p>
        ) : (
          <ol className="flex flex-col">
            {plan.elements.map((e, i) => {
              if (!isLeg(e)) {
                return (
                  <li key={e.id} className="my-1 flex items-center justify-between rounded-md border border-dashed border-warn/60 bg-warn/5 px-3 py-2 text-sm text-warn">
                    <span>{t('modern.discontinuity')}</span>
                    <Button size="sm" onClick={() => run({ kind: 'CLOSE_DISCONTINUITY', discontinuityId: e.id })}>
                      {t('modern.closeDiscontinuity')}
                    </Button>
                  </li>
                )
              }
              const pred = profile?.legs.find((p) => p.legId === e.id)
              const active = i === plan.activeLegIndex
              return (
                <li
                  key={e.id}
                  className={`grid grid-cols-[1fr_auto] items-center gap-2 border-b border-line/50 py-2 ${state.navigation.highlightedLegId === e.id ? 'bg-cdu-yellow/5' : ''} ${e.missed ? 'opacity-60' : ''}`}
                >
                  <button type="button" className="min-w-0 text-left" onClick={() => dispatch({ type: 'HIGHLIGHT_LEG', legId: e.id })}>
                    <span className={`cdu-font font-semibold ${active ? 'text-cdu-magenta' : 'text-fg'}`}>{e.waypoint.ident}</span>
                    <span className="ml-2 text-xs text-fg-faint">{legDetail(e, pred?.altitudeFt, perf.transitionAltitudeFt ?? 18000)}</span>
                  </button>
                  {i > 0 && e.segment !== 'ORIGIN' && !e.missed && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => run({ kind: 'DIRECT_TO', ident: e.waypoint.ident })}>
                        {t('modern.directTo')}
                      </Button>
                      {e.segment !== 'DESTINATION' && (
                        <Button size="sm" variant="ghost" onClick={() => run({ kind: 'DELETE_LEG', legId: e.id })}>
                          {t('modern.deleteLeg')}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </Card>

      <Card title={t('modern.performance')}>
        <div className="grid gap-3 tablet:grid-cols-2">
          {perfField('SET_CRUISE_ALTITUDE', t('modern.cruiseAltitude'), perf.cruiseAltitudeFt ? formatFlightLevel(perf.cruiseAltitudeFt, 0) : '')}
          {perfField('SET_COST_INDEX', t('modern.costIndex'), perf.costIndex !== undefined ? String(perf.costIndex) : '')}
          {perfField('SET_ZFW', `${t('modern.zfw')} (${units.weight})`, weight(perf.zfwKg), true)}
          {perfField('SET_FUEL', `${t('modern.fuel')} (${units.weight})`, weight(perf.fuelKg), true)}
          {perfField('SET_RESERVES', `${t('modern.reserves')} (${units.weight})`, weight(perf.reserveFuelKg), true)}
        </div>
      </Card>

      {profile?.valid && (
        <Card title={t('modern.predictions')}>
          {profile.unableCruiseAltitude && <p className="mb-3 text-sm text-warn">{t('modern.unableCrz')}</p>}
          <dl className="grid grid-cols-2 gap-3 tablet:grid-cols-3">
            <div>
              <dt className="text-xs text-fg-faint">{t('modern.distance')}</dt>
              <dd className="cdu-font">{Math.round(profile.totalDistanceNm)} NM</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-faint">{t('modern.tripTime')}</dt>
              <dd className="cdu-font">{formatDurationHm(profile.tripTimeMin)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-faint">{t('modern.tripFuel')}</dt>
              <dd className="cdu-font">{weight(profile.tripFuelKg) || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-faint">{t('modern.toc')}</dt>
              <dd className="cdu-font">{profile.topOfClimb ? `${Math.round(profile.topOfClimb.distanceNm)} NM` : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-faint">{t('modern.tod')}</dt>
              <dd className="cdu-font">{profile.topOfDescent ? `${Math.round(profile.topOfDescent.distanceNm)} NM` : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-faint">{t('modern.destFuel')}</dt>
              <dd className={`cdu-font ${profile.warnings.includes('INSUFFICIENT_FUEL') ? 'text-warn' : ''}`}>{weight(profile.destinationFuelKg) || '—'}</dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  )
}
