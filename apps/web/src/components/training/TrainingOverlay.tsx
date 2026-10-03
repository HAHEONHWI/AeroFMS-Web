import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/common/Button'
import { Badge } from '@/components/common/Form'
import { useLocalized } from '@/i18n'
import { useTraining } from '@/stores/training'
import { useSettings } from '@/stores/settings'
import { MistakePanel } from './MistakePanel'
import { ResultSummary } from './ResultSummary'

/** Training Assistant: lives beside the emulator, never changes emulator behaviour. */
export function TrainingOverlay() {
  const { t } = useTranslation()
  const L = useLocalized()
  const navigate = useNavigate()
  const { active, latest, result, requestHint, dismissFeedback, stop } = useTraining()
  useTraining((s) => s.revision)
  const level = useSettings((s) => s.settings.trainingLevel)
  const [hint, setHint] = useState<string | null>(null)
  if (!active) return null

  if (active.kind === 'LESSON') {
    const { lesson, runner } = active
    const step = runner.currentStep
    const total = lesson.steps.length
    const lastMistake = latest?.kind === 'MISTAKE' ? latest.mistake : undefined
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-bg-elevated p-4" aria-live="polite" aria-label={t('training.overlayTitle')}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-accent">{t('training.overlayTitle')}</p>
            <h2 className="font-semibold">{L(lesson.title)}</h2>
          </div>
          <Badge tone="accent">{t('academy.step', { current: Math.min(runner.stepIndex + 1, total), total })}</Badge>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={runner.stepIndex}>
          <div className="h-full bg-accent transition-all" style={{ width: `${(runner.stepIndex / total) * 100}%` }} />
        </div>
        {step && !runner.completed && (
          <>
            <p className="text-base leading-relaxed">{L(step.instruction)}</p>
            {level === 'BEGINNER' && step.hint && !hint && <p className="text-sm text-fg-muted">{L(step.hint)}</p>}
            {hint && <p className="rounded bg-surface p-3 text-sm">{hint}</p>}
          </>
        )}
        {latest?.kind === 'WRONG_PAGE' && <p className="rounded border border-warn/40 bg-warn/10 p-3 text-sm text-warn">{L(latest.message)}</p>}
        {latest?.kind === 'STEP_DONE' && !runner.completed && <p className="text-sm text-ok">{t('training.stepDone')}</p>}
        {lastMistake && <MistakePanel mistake={lastMistake} answer={step ? L(step.hint ?? step.instruction) : undefined} onClose={dismissFeedback} />}
        {runner.completed && result && <ResultSummary result={result} title={t('academy.lessonComplete')} />}
        <div className="flex flex-wrap gap-2">
          {!runner.completed && (
            <Button
              size="sm"
              onClick={() => {
                requestHint()
                const st = runner.currentStep
                setHint(st ? L(st.hint ?? st.instruction) : null)
              }}
            >
              {t('academy.hint')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              stop()
              navigate('/academy')
            }}
          >
            {t('academy.exit')}
          </Button>
        </div>
      </section>
    )
  }

  const { scenario, runner } = active
  const lastMistake = latest?.kind === 'MISTAKE' ? latest.mistake : undefined
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-bg-elevated p-4" aria-live="polite">
      <div>
        <p className="text-xs uppercase tracking-wider text-accent">{t('nav.scenarios')}</p>
        <h2 className="font-semibold">{L(scenario.title)}</h2>
      </div>
      <ol className="flex flex-col gap-1.5">
        {scenario.objectives.map((o) => {
          const done = runner.done.has(o.id)
          return (
            <li key={o.id} className={`flex items-start gap-2 text-sm ${done ? 'text-ok' : 'text-fg'}`}>
              <span aria-hidden="true">{done ? '✔' : '○'}</span>
              <span className="flex-1">{L(o.text)}</span>
              <span className="text-xs text-fg-faint">{t('common.points', { count: o.points })}</span>
            </li>
          )
        })}
      </ol>
      {lastMistake && <MistakePanel mistake={lastMistake} onClose={dismissFeedback} />}
      {hint && <p className="rounded bg-surface p-3 text-sm">{hint}</p>}
      {runner.completed && result && <ResultSummary result={result} title={t('training.result')} />}
      <div className="flex flex-wrap gap-2">
        {!runner.completed && scenario.hints.length > 0 && (
          <Button
            size="sm"
            onClick={() => {
              const idx = requestHint()
              setHint(L(scenario.hints[idx]))
            }}
          >
            {t('academy.hint')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            stop()
            navigate('/scenarios')
          }}
        >
          {t('academy.exit')}
        </Button>
      </div>
    </section>
  )
}
