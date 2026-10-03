import { useTranslation } from 'react-i18next'
import { GLOSSARY } from '@aerofms/training'
import { Dialog } from '@/components/common/Dialog'

/** Explain Mode: short + detailed explanation, example, caution and related terms. */
export function ExplainPanel({ explainKey, onClose, onNavigate }: { explainKey: string | null; onClose: () => void; onNavigate: (key: string) => void }) {
  const { t } = useTranslation()
  if (!explainKey) return null
  const g = GLOSSARY[explainKey]
  const title = g ? t(`explain.${explainKey}.title`) : t('explain.title')
  return (
    <Dialog open title={title} onClose={onClose}>
      {!g ? (
        <p className="text-sm text-fg-muted">{t('explain.notFound')}</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <p className="text-base text-fg">{t(`explain.${explainKey}.short`)}</p>
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-faint">{t('explain.detail')}</h3>
            <p className="text-fg-muted">{t(`explain.${explainKey}.detail`)}</p>
          </section>
          {g.hasExample && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-faint">{t('explain.example')}</h3>
              <p className="cdu-font rounded bg-cdu-screen px-3 py-2 text-cdu-green">{t(`explain.${explainKey}.example`)}</p>
            </section>
          )}
          {g.hasCaution && (
            <section className="rounded-md border border-warn/40 bg-warn/5 p-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-warn">{t('explain.caution')}</h3>
              <p className="text-fg-muted">{t(`explain.${explainKey}.caution`)}</p>
            </section>
          )}
          {g.related.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-faint">{t('explain.related')}</h3>
              <div className="flex flex-wrap gap-2">
                {g.related.map((r) => (
                  <button key={r} type="button" onClick={() => onNavigate(r)} className="h-9 rounded-md border border-line px-3 text-sm hover:border-accent">
                    {t(`explain.${r}.title`)}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Dialog>
  )
}
