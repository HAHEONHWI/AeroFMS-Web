import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MistakeExplanation } from '@aerofms/training'
import { Button } from '@/components/common/Button'
import { useLocalized } from '@/i18n'
import { useFms } from '@/stores/fms'

/** Mistake Analyzer card: FMC message + learner explanation with re-enter / why / hint / answer. */
export function MistakePanel({ mistake, answer, onClose }: { mistake: MistakeExplanation; answer?: string; onClose: () => void }) {
  const { t } = useTranslation()
  const L = useLocalized()
  const dispatch = useFms((s) => s.dispatch)
  const [show, setShow] = useState<'why' | 'hint' | 'answer' | null>(null)
  return (
    <div className="rounded-lg border border-danger/50 bg-danger/5 p-4" role="alert">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-fg-faint">{t('mistake.fmcSaid')}</p>
          <p className="cdu-font text-sm text-cdu-amber">{mistake.fmcMessage}</p>
        </div>
        <button type="button" onClick={onClose} className="h-8 w-8 rounded text-fg-muted hover:bg-surface" aria-label={t('common.close')}>
          ✕
        </button>
      </div>
      <h3 className="mt-2 font-semibold">{L(mistake.title)}</h3>
      <p className="mt-1 text-sm text-fg-muted">{L(mistake.body)}</p>
      {mistake.suggestions.length > 0 && (
        <p className="mt-2 text-sm">
          {t('mistake.suggestions')}: <span className="cdu-font text-cdu-cyan">{mistake.suggestions.join(', ')}</span>
        </p>
      )}
      {show === 'why' && <p className="mt-3 rounded bg-surface p-3 text-sm">{L(mistake.why)}</p>}
      {show === 'hint' && <p className="mt-3 rounded bg-surface p-3 text-sm">{L(mistake.hint)}</p>}
      {show === 'answer' && answer && <p className="mt-3 rounded bg-surface p-3 text-sm">{answer}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            dispatch({ type: 'KEY_LONG', key: 'CLR' })
            onClose()
          }}
        >
          {t('mistake.reenter')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShow('why')}>
          {t('academy.why')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShow('hint')}>
          {t('academy.hint')}
        </Button>
        {answer && (
          <Button size="sm" variant="ghost" onClick={() => setShow('answer')}>
            {t('academy.showAnswer')}
          </Button>
        )}
      </div>
    </div>
  )
}
