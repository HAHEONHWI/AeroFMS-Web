import { useTranslation } from 'react-i18next'
import type { FmsEvent } from '@aerofms/core'
import { useFms } from '@/stores/fms'

const TONE: Partial<Record<FmsEvent['type'], string>> = {
  ERROR: 'text-danger',
  EXEC: 'text-ok',
  INSERT: 'text-ok',
  ERASE: 'text-warn',
  ROUTE_CHANGED: 'text-info',
  FIELD_CHANGED: 'text-accent',
}

export function EventRow({ e }: { e: FmsEvent }) {
  const { t } = useTranslation()
  const time = new Date(e.t)
  return (
    <li className="grid grid-cols-[4.5rem_6.5rem_1fr] gap-2 py-1 text-xs">
      <span className="cdu-font text-fg-faint">{time.toLocaleTimeString([], { hour12: false })}</span>
      <span className={TONE[e.type] ?? 'text-fg-muted'}>{t(`replay.event.${e.type}`)}</span>
      <span className="cdu-font truncate text-fg">
        {e.detail}
        {e.value !== undefined && e.value !== null && e.value !== '' ? ` ${String(e.value)}` : ''}
      </span>
    </li>
  )
}

/** Live FMC action timeline for the open session (Session Timeline). */
export function TimelinePanel() {
  const { t } = useTranslation()
  const events = useFms((s) => s.eventLog)
  const visible = events.filter((e) => e.type !== 'SIMULATION_EVENT' || !e.detail.startsWith('TICK')).slice(-120).reverse()
  return (
    <section aria-label={t('emulator.timeline')}>
      <h2 className="mb-2 text-sm font-semibold">{t('emulator.timeline')}</h2>
      <ol className="max-h-96 divide-y divide-line/60 overflow-y-auto rounded-md border border-line bg-surface px-3">
        {visible.length === 0 && <li className="py-3 text-xs text-fg-faint">—</li>}
        {visible.map((e, i) => (
          <EventRow key={`${e.actionIndex}-${i}`} e={e} />
        ))}
      </ol>
    </section>
  )
}
