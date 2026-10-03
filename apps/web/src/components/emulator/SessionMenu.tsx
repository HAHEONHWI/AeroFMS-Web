import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@/components/common/Dialog'
import { Button } from '@/components/common/Button'
import { TextInput } from '@/components/common/Form'
import { toast } from '@/components/common/Toast'
import { services } from '@/services/runtime'
import { useFms } from '@/stores/fms'
import { formatRelative } from '@aerofms/i18n'
import { currentLanguage } from '@/i18n'
import { downloadJson, pickFile } from '@/services/files'
import type { SessionExport } from '@aerofms/core'

/** Session management: new / continue / duplicate / rename / reset / delete / export / import. */
export function SessionMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const state = useFms((s) => s.state)
  const fms = useFms()
  const aircraftId = state?.aircraft.aircraftId
  const sessions = useQuery({
    queryKey: ['sessions', aircraftId, state?.session.updatedAt],
    queryFn: () => services().sessions.list(aircraftId),
    enabled: open && !!aircraftId,
  })
  const [airport, setAirport] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const refresh = () => void qc.invalidateQueries({ queryKey: ['sessions'] })
  if (!state || !aircraftId) return null

  const doExport = async (id: string, name: string) => {
    const data = await services().sessions.export(id)
    if (data) downloadJson(data, `${name.replace(/[^\w-]+/g, '_')}.aerofms-session.json`)
  }
  const doImport = async () => {
    const text = await pickFile('.json,application/json')
    if (!text) return
    try {
      const id = await services().sessions.import(JSON.parse(text) as SessionExport)
      const r = await fms.openSession(id)
      if (r === 'ok') onClose()
      refresh()
    } catch {
      toast(t('session.importError'), 'error')
    }
  }

  return (
    <Dialog open={open} title={t('session.title')} onClose={onClose} wide>
      <div className="flex flex-col gap-5">
        <section className="grid gap-3 tablet:grid-cols-[1fr_auto_auto] tablet:items-end">
          <TextInput label={t('session.newAtAirport')} placeholder={t('session.airportPlaceholder')} value={airport} maxLength={4} onChange={(e) => setAirport(e.target.value.toUpperCase())} />
          <Button
            variant="primary"
            disabled={!/^[A-Z]{4}$/.test(airport) || !services().nav.searchAirport(airport)}
            onClick={async () => {
              await fms.newSession(aircraftId, { airport })
              refresh()
              onClose()
            }}
          >
            {t('session.newAtAirport')}
          </Button>
          <Button
            onClick={async () => {
              await fms.newSession(aircraftId)
              refresh()
              onClose()
            }}
          >
            {t('session.newEmpty')}
          </Button>
        </section>
        <ul className="divide-y divide-line rounded-md border border-line">
          {(sessions.data ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">{t('session.empty')}</li>}
          {(sessions.data ?? []).map((s) => {
            const current = s.id === state.session.sessionId
            return (
              <li key={s.id} className={`flex flex-wrap items-center gap-2 p-3 ${current ? 'bg-surface' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-fg-faint">
                    {s.origin ?? '----'} → {s.destination ?? '----'} · {t('session.updated', { time: formatRelative(currentLanguage(), s.updatedAt) })} ·{' '}
                    {t('session.actions', { count: s.actionCount })}
                  </p>
                </div>
                {!current && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      const r = await fms.openSession(s.id)
                      if (r === 'corrupted') toast(t('session.corrupted'), 'error')
                      else onClose()
                    }}
                  >
                    {t('session.continue')}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setRenaming({ id: s.id, name: s.name })}>
                  {t('common.rename')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await services().sessions.duplicate(s.id)
                    refresh()
                  }}
                >
                  {t('common.duplicate')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void doExport(s.id, s.name)}>
                  {t('common.export')}
                </Button>
                {current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (window.confirm(t('session.resetConfirm'))) {
                        await fms.resetSession()
                        refresh()
                      }
                    }}
                  >
                    {t('common.reset')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={async () => {
                    if (window.confirm(t('session.deleteConfirm'))) {
                      await fms.deleteSession(s.id)
                      refresh()
                    }
                  }}
                >
                  {t('common.delete')}
                </Button>
              </li>
            )
          })}
        </ul>
        <div>
          <Button onClick={() => void doImport()}>{t('session.import')}</Button>
        </div>
      </div>
      {renaming && (
        <Dialog
          open
          title={t('session.rename')}
          onClose={() => setRenaming(null)}
          footer={
            <Button
              variant="primary"
              onClick={async () => {
                await services().sessions.rename(renaming.id, renaming.name)
                if (renaming.id === state.session.sessionId) await fms.restoreFromLatest()
                setRenaming(null)
                refresh()
              }}
            >
              {t('common.save')}
            </Button>
          }
        >
          <TextInput label={t('session.renamePrompt')} value={renaming.name} maxLength={60} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
        </Dialog>
      )}
    </Dialog>
  )
}
