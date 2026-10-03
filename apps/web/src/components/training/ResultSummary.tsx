import { useTranslation } from 'react-i18next'
import type { AttemptResult } from '@aerofms/training'

export function ResultSummary({ result, title }: { result: AttemptResult; title: string }) {
  const { t } = useTranslation()
  const m = Math.floor(result.timeSec / 60)
  const s = result.timeSec % 60
  const items: Array<[string, string]> = [
    [t('training.score'), String(result.score)],
    [t('training.completion'), `${result.completionPct}%`],
    [t('training.correctInputs'), String(result.correctInputs)],
    [t('training.incorrectInputs'), String(result.incorrectInputs)],
    [t('training.hintsUsed'), String(result.hintsUsed)],
    [t('training.time'), `${m}:${String(s).padStart(2, '0')}`],
  ]
  return (
    <div className="rounded-lg border border-ok/50 bg-ok/5 p-4">
      <h3 className="font-semibold text-ok">{title}</h3>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-fg-faint">{k}</dt>
            <dd className="cdu-font text-lg">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
