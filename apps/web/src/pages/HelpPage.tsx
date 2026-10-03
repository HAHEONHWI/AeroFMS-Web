import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HELP_ARTICLES } from '@aerofms/training'
import { PageHeader, TextInput } from '@/components/common/Form'

/** Searchable help center (ko/en). */
export function HelpPage() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const articles = useMemo(
    () =>
      HELP_ARTICLES.map((id) => ({ id, title: t(`help.articles.${id}.title`), body: t(`help.articles.${id}.body`) })).filter(
        (a) => !q.trim() || `${a.title} ${a.body}`.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [q, t],
  )
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t('help.title')} subtitle={t('help.subtitle')} />
      <div className="mb-6">
        <TextInput label={t('common.search')} placeholder={t('help.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} type="search" />
      </div>
      {articles.length === 0 && <p className="text-sm text-fg-muted">{t('common.noResults')}</p>}
      <div className="flex flex-col gap-3">
        {articles.map((a) => (
          <details key={a.id} className="rounded-lg border border-line bg-bg-elevated p-4" open={!!q.trim()}>
            <summary className="cursor-pointer font-semibold">{a.title}</summary>
            <p className="mt-3 leading-relaxed text-fg-muted">{a.body}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
