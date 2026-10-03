import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BUILTIN_LESSONS, LESSON_CATEGORIES } from '@aerofms/training'
import type { UserLevel } from '@aerofms/training'
import { Badge, PageHeader, Segmented } from '@/components/common/Form'
import { Button } from '@/components/common/Button'
import { services } from '@/services/runtime'
import { useLocalized } from '@/i18n'
import { useSettings } from '@/stores/settings'

export function AcademyPage() {
  const { t } = useTranslation()
  const L = useLocalized()
  const navigate = useNavigate()
  const { settings, update } = useSettings()
  const progress = useQuery({ queryKey: ['progress'], queryFn: () => services().progress.list() })
  const byId = new Map((progress.data ?? []).map((p) => [p.lessonId, p]))
  const completed = (progress.data ?? []).filter((p) => p.status === 'COMPLETED').length
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader
        title={t('academy.title')}
        subtitle={t('academy.subtitle')}
        actions={
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-fg-muted">{t('academy.levelLabel')}</span>
            <Segmented<UserLevel>
              label={t('academy.levelLabel')}
              value={settings.trainingLevel}
              onChange={(v) => update({ trainingLevel: v })}
              options={(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const).map((l) => ({ value: l, label: t(`level.${l}`) }))}
            />
          </div>
        }
      />
      <p className="mb-6 text-sm text-fg-muted">
        {t('academy.progress')}: {completed} / {BUILTIN_LESSONS.length}
      </p>
      <div className="flex flex-col gap-8">
        {LESSON_CATEGORIES.map((cat) => {
          const lessons = BUILTIN_LESSONS.filter((l) => l.category === cat)
          if (!lessons.length) return null
          return (
            <section key={cat}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted">{t(`academy.categories.${cat}`)}</h2>
              <div className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
                {lessons.map((l) => {
                  const p = byId.get(l.id)
                  const def = services().registry.definition(l.aircraftId)
                  return (
                    <article key={l.id} className="flex flex-col rounded-lg border border-line bg-bg-elevated p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{def?.model ?? l.aircraftId}</Badge>
                        <Badge tone={l.difficulty === 'HARD' ? 'warn' : 'neutral'}>{t(`difficulty.${l.difficulty}`)}</Badge>
                        <span className="text-xs text-fg-faint">{t('common.minutes', { count: l.estimatedMinutes })}</span>
                      </div>
                      <h3 className="mt-3 font-semibold">{L(l.title)}</h3>
                      <p className="mt-1 flex-1 text-sm text-fg-muted">{L(l.description)}</p>
                      <div className="mt-4 flex items-center justify-between">
                        <span className={`text-xs ${p?.status === 'COMPLETED' ? 'text-ok' : 'text-fg-faint'}`}>
                          {p?.status === 'COMPLETED' ? `${t('academy.completed')} · ${t('academy.bestScore', { score: p.bestScore })}` : p?.status === 'IN_PROGRESS' ? t('academy.inProgress') : t('academy.notStarted')}
                        </span>
                        <Button size="sm" variant="primary" onClick={() => navigate(`/emulator?lesson=${l.id}`)}>
                          {p?.status === 'COMPLETED' ? t('academy.restart') : t('academy.start')}
                        </Button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
