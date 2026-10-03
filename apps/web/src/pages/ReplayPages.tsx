import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatRelative } from '@aerofms/i18n'
import { createId } from '@aerofms/shared'
import { uploadReplay } from '@aerofms/cloud'
import { CduFrame } from '@/components/cdu/CduFrame'
import { FlightMap } from '@/components/map/FlightMap'
import { EventRow } from '@/components/emulator/TimelinePanel'
import { Button } from '@/components/common/Button'
import { PageHeader, Segmented } from '@/components/common/Form'
import { toast } from '@/components/common/Toast'
import { services } from '@/services/runtime'
import { currentLanguage } from '@/i18n'
import { track } from '@/services/analytics'
import { getFirebase } from '@/platform/firebase'
import { useAuth } from '@/stores/auth'

export function ReplayListPage() {
  const { t } = useTranslation()
  const sessions = useQuery({ queryKey: ['sessions', 'all', 'replay'], queryFn: () => services().sessions.list() })
  const list = (sessions.data ?? []).filter((s) => s.actionCount > 0)
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title={t('replay.title')} subtitle={t('replay.subtitle')} />
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted">{t('replay.sessions')}</h2>
      <ul className="divide-y divide-line rounded-md border border-line">
        {list.length === 0 && <li className="p-4 text-sm text-fg-muted">{t('replay.empty')}</li>}
        {list.map((s) => (
          <li key={s.id}>
            <Link to={`/replay/${encodeURIComponent(s.id)}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-surface">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-fg-faint">
                  {services().registry.definition(s.aircraftId)?.displayName} · {s.origin ?? '----'} → {s.destination ?? '----'}
                </p>
              </div>
              <span className="text-xs text-fg-muted">
                {t('session.actions', { count: s.actionCount })} · {formatRelative(currentLanguage(), s.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

const SPEEDS = ['0.5', '1', '2', '4'] as const

export function ReplayPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const user = useAuth((s) => s.user)
  const replay = useQuery({ queryKey: ['replay', id], queryFn: () => services().sessions.loadReplay(id).then((r) => r ?? null) })
  /** null = the final state (a replay opens at the end of the recording). */
  const [cursor, setCursor] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>('1')
  const ctrl = replay.data
  const pos = cursor ?? ctrl?.length ?? 0
  const delay = ctrl && playing ? ctrl.delayToNext(pos, Number(speed)) : undefined
  const isPlaying = delay !== undefined
  const seek = (p: number) => {
    setPlaying(false)
    setCursor(p)
  }
  useEffect(() => {
    if (ctrl) track('replay_opened')
  }, [ctrl])
  useEffect(() => {
    if (!ctrl || delay === undefined) return
    const timer = setTimeout(() => setCursor((c) => Math.min(ctrl.length, (c ?? ctrl.length) + 1)), delay)
    return () => clearTimeout(timer)
  }, [delay, pos, ctrl])
  const state = useMemo(() => (ctrl ? ctrl.stateAt(pos) : undefined), [ctrl, pos])
  if (replay.isLoading) return <p className="px-4 py-10 text-fg-muted">{t('app.loading')}</p>
  if (!ctrl || !state) return <p className="px-4 py-10">{t('replay.notAvailable')}</p>
  const adapter = services().registry.get(state.aircraft.aircraftId)
  if (!adapter) return null
  const events = ctrl.events.filter((e) => e.actionIndex < pos && e.type !== 'SIMULATION_EVENT').slice(-40).reverse()

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-2 py-3 tablet:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{t('replay.title')}</h1>
          <p className="text-sm text-fg-muted">
            {state.session.name} · {adapter.definition.displayName}
          </p>
        </div>
        {getFirebase() && user && (
          <Button
            onClick={async () => {
              const fb = getFirebase()
              if (!fb) return
              try {
                const actions = (await services().sessions.sessions.loadActions(id)).map((a) => a.action)
                const baseline = ctrl.stateAt(0)
                await uploadReplay(fb.db, fb.storage, user.uid, { id: createId('r-'), sessionId: id, title: state.session.name, aircraftId: state.aircraft.aircraftId, actionCount: actions.length, payload: { baseline, actions } })
                toast(t('replay.uploaded'), 'success')
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), 'error')
              }
            }}
          >
            {t('replay.shareCloud')}
          </Button>
        )}
      </div>
      <div className="rounded-lg border border-line bg-bg-elevated p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => {
            if (!isPlaying && pos >= ctrl.length) setCursor(0)
            setPlaying(!isPlaying)
          }}>
            {isPlaying ? t('replay.pause') : t('replay.play')}
          </Button>
          <Segmented label={t('replay.speed')} value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))} />
          <span className="cdu-font text-sm text-fg-muted">{t('replay.position', { current: pos, total: ctrl.length })}</span>
        </div>
        <div className="relative mt-4">
          <input
            type="range"
            min={0}
            max={ctrl.length}
            value={pos}
            onChange={(e) => {
              seek(Number(e.target.value))
            }}
            className="w-full accent-[var(--color-accent)]"
            aria-label={t('replay.position', { current: pos, total: ctrl.length })}
          />
          <div className="pointer-events-none absolute inset-x-0 top-5 h-3">
            {ctrl.markers.map((m, i) => (
              <span
                key={i}
                title={`${m.kind} ${m.detail}`}
                className={`absolute h-3 w-0.5 ${m.kind === 'ERROR' ? 'bg-danger' : 'bg-ok'}`}
                style={{ left: `${((m.actionIndex + 1) / Math.max(1, ctrl.length)) * 100}%` }}
              />
            ))}
          </div>
        </div>
        {ctrl.markers.some((m) => m.kind === 'ERROR') && (
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="text-fg-muted">{t('replay.errors')}:</span>
            {ctrl.markers
              .filter((m) => m.kind === 'ERROR')
              .slice(0, 12)
              .map((m, i) => (
                <button key={i} type="button" className="rounded border border-danger/50 px-2 py-1 text-danger hover:bg-danger/10" onClick={() => seek(m.actionIndex + 1)}>
                  #{m.actionIndex + 1} {m.detail}
                </button>
              ))}
          </div>
        )}
      </div>
      <div className="grid gap-4 tablet:grid-cols-[minmax(320px,480px)_1fr]">
        <CduFrame state={state} adapter={adapter} nav={services().nav} readOnly />
        <div className="flex min-w-0 flex-col gap-4">
          <div className="h-80">
            <FlightMap state={state} nav={services().nav} adapter={adapter} />
          </div>
          <section>
            <h2 className="mb-2 text-sm font-semibold">{t('replay.events')}</h2>
            <ol className="max-h-72 divide-y divide-line/60 overflow-y-auto rounded-md border border-line bg-surface px-3">
              {events.map((e, i) => (
                <EventRow key={i} e={e} />
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
