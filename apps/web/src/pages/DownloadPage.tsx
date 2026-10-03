import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/common/Form'

/** Play Store listing URL, set at build time once the Android app is published. */
const PLAY_STORE_URL = import.meta.env.VITE_PLAY_STORE_URL?.startsWith('https://play.google.com/') ? import.meta.env.VITE_PLAY_STORE_URL : undefined

/** Android download information. */
export function DownloadPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t('download.title')} subtitle={t('download.subtitle')} />
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-bg-elevated p-6">
        <p className="text-sm">{t('download.requirements')}</p>
        <p className="text-sm text-fg-muted">{t('download.tablet')}</p>
        {PLAY_STORE_URL ? (
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-fit items-center rounded-md bg-accent px-5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t('download.playStore')}
          </a>
        ) : (
          <p className="rounded-md border border-line bg-surface p-4 text-sm text-fg-muted">{t('download.comingSoon')}</p>
        )}
        <p className="text-xs text-fg-faint">applicationId: dev.heonhwi.areofms</p>
      </div>
    </div>
  )
}
