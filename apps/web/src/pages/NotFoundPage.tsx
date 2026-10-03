import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="cdu-font text-cdu-amber">NOT IN DATA BASE</p>
      <h1 className="mt-3 text-2xl font-semibold">{t('common.notFound')}</h1>
      <p className="mt-2 text-fg-muted">{t('common.notFoundDetail')}</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-md bg-accent px-4 font-semibold text-bg">
        {t('common.goHome')}
      </Link>
    </div>
  )
}
