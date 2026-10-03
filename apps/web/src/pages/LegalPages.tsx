import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/common/Form'

const LAST_UPDATED = '2026-10-03'

interface Section {
  title: string
  body: string
}

export function PrivacyPage() {
  const { t } = useTranslation()
  const sections = t('legal.privacy.sections', { returnObjects: true }) as Section[]
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t('legal.privacy.title')} subtitle={t('legal.lastUpdated', { date: LAST_UPDATED })} />
      <p className="mb-6 leading-relaxed text-fg-muted">{t('legal.privacy.intro')}</p>
      {sections.map((s) => (
        <section key={s.title} className="mb-6">
          <h2 className="mb-2 font-semibold">{s.title}</h2>
          <p className="leading-relaxed text-fg-muted">{s.body}</p>
        </section>
      ))}
      <p className="text-sm text-fg-faint">{t('legal.contact')}</p>
    </article>
  )
}

export function TermsPage() {
  const { t } = useTranslation()
  const sections = t('legal.terms.sections', { returnObjects: true }) as Section[]
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t('legal.terms.title')} subtitle={t('legal.lastUpdated', { date: LAST_UPDATED })} />
      <div className="mb-8 rounded-lg border border-warn/40 bg-warn/5 p-4 text-sm">{t('app.disclaimerShort')}</div>
      {sections.map((s) => (
        <section key={s.title} className="mb-6">
          <h2 className="mb-2 font-semibold">{s.title}</h2>
          <p className="leading-relaxed text-fg-muted">{s.body}</p>
        </section>
      ))}
    </article>
  )
}

export function DisclaimerPage() {
  const { t } = useTranslation()
  const points = t('legal.disclaimer.points', { returnObjects: true }) as string[]
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t('legal.disclaimer.title')} />
      <p className="mb-6 rounded-lg border border-warn/40 bg-warn/5 p-5 leading-relaxed">{t('legal.disclaimer.body')}</p>
      <ul className="list-disc space-y-2 pl-6 text-fg-muted">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </article>
  )
}
