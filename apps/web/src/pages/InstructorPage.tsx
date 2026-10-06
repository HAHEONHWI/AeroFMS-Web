import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ScenarioCloud } from '@aerofms/cloud'
import { formatDateTime } from '@aerofms/i18n'
import { PageHeader } from '@/components/common/Form'
import { Button } from '@/components/common/Button'
import { getFirebase } from '@/platform/firebase'
import { useAuth } from '@/stores/auth'
import { currentLanguage, useLocalized } from '@/i18n'

/** Instructor dashboard: attempts on scenarios shared by the instructor (custom claim `instructor`). */
export function InstructorPage() {
  const { t } = useTranslation()
  const L = useLocalized()
  const user = useAuth((s) => s.user)
  const fb = getFirebase()
  const [selected, setSelected] = useState<string | null>(null)
  const cloud = fb ? new ScenarioCloud(fb.db) : null
  const mine = useQuery({ queryKey: ['instructor', 'scenarios', user?.uid], queryFn: () => (cloud && user ? cloud.listMine(user.uid) : Promise.resolve([])), enabled: !!user?.instructor })
  const attempts = useQuery({ queryKey: ['instructor', 'attempts', selected], queryFn: () => (cloud && selected ? cloud.listAttempts(selected) : Promise.resolve([])), enabled: !!selected })
  if (!fb) return <p className="mx-auto max-w-3xl px-4 py-10 text-fg-muted">{t('common.cloudUnavailable')}</p>
  if (!user) return <p className="mx-auto max-w-3xl px-4 py-10 text-fg-muted">{t('common.signInRequired')}</p>
  if (!user.instructor) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <PageHeader title={t('instructor.title')} subtitle={t('instructor.subtitle')} />
        <p className="text-sm text-fg-muted">{t('instructor.notInstructor')}</p>
        <p className="mt-2 text-sm text-fg-faint">{t('instructor.requestRole')}</p>
      </div>
    )
  }
  const list = attempts.data ?? []
  const done = list.filter((a) => a.completionPct >= 100)
  const avg = list.length ? Math.round(list.reduce((s, a) => s + a.score, 0) / list.length) : 0
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title={t('instructor.title')} subtitle={t('instructor.subtitle')} />
      <p className="mb-6 text-xs text-fg-faint">{t('instructor.privacyNote')}</p>
      <div className="grid gap-6 desktop:grid-cols-[320px_1fr]">
        <section>
          <h2 className="mb-2 text-sm font-semibold">{t('instructor.myScenarios')}</h2>
          <ul className="flex flex-col gap-2">
            {(mine.data ?? []).map((c) => (
              <li key={c.scenario.id}>
                <Button className={`w-full justify-between ${selected === c.scenario.id ? 'border-accent' : ''}`} onClick={() => setSelected(c.scenario.id)}>
                  <span className="truncate">{L(c.scenario.title)}</span>
                  <span className="cdu-font text-xs text-accent">{c.shareCode ?? ''}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-md border border-line p-3">
              <p className="text-xs text-fg-faint">{t('instructor.completed')}</p>
              <p className="cdu-font text-xl">{done.length}</p>
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="text-xs text-fg-faint">{t('instructor.inProgress')}</p>
              <p className="cdu-font text-xl">{list.length - done.length}</p>
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="text-xs text-fg-faint">{t('instructor.averageScore')}</p>
              <p className="cdu-font text-xl">{avg}</p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs text-fg-faint">
                <tr>
                  <th className="p-2">{t('instructor.student')}</th>
                  <th className="p-2">{t('training.score')}</th>
                  <th className="p-2">{t('training.completion')}</th>
                  <th className="p-2">{t('instructor.errors')}</th>
                  <th className="p-2">{t('instructor.time')}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td className="p-3 text-fg-faint" colSpan={6}>
                      {t('instructor.noAttempts')}
                    </td>
                  </tr>
                )}
                {list.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="p-2">{a.displayName}</td>
                    <td className="cdu-font p-2">{a.score}</td>
                    <td className="cdu-font p-2">{a.completionPct}%</td>
                    <td className="cdu-font p-2">{a.incorrectInputs}</td>
                    <td className="cdu-font p-2">{Math.round(a.timeSec / 60)}m</td>
                    <td className="p-2 text-xs text-fg-faint">{formatDateTime(currentLanguage(), a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
