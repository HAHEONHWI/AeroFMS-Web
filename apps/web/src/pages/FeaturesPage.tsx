import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/common/Form'

const ITEMS = ['emulator', 'aircraft', 'navdb', 'map', 'modern', 'training', 'scenarios', 'replay', 'simulation', 'connector'] as const

export function FeaturesPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title={t('features.title')} subtitle={t('features.subtitle')} />
      <div className="grid gap-4 tablet:grid-cols-2">
        {ITEMS.map((i) => (
          <article key={i} className="rounded-lg border border-line bg-bg-elevated p-5">
            <h2 className="font-semibold">{t(`features.list.${i}.title`)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t(`features.list.${i}.body`)}</p>
          </article>
        ))}
      </div>
      <p className="mt-8 text-sm">
        <Link to="/emulator" className="text-accent">
          {t('home.startWeb')} →
        </Link>
      </p>
    </div>
  )
}
