import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { UserLevel } from '@aerofms/training'
import type { LanguagePreference } from '@aerofms/i18n'
import { Dialog } from '@/components/common/Dialog'
import { Button } from '@/components/common/Button'
import { useSettings } from '@/stores/settings'
import { applyLanguage } from '@/i18n'
import { services } from '@/services/runtime'

type Step = 'welcome' | 'simulation' | 'language' | 'experience' | 'aircraft'
const ORDER: Step[] = ['welcome', 'simulation', 'language', 'experience', 'aircraft']

/** First-run onboarding: intro → simulation-only notice → language → experience → aircraft. */
export function Onboarding() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { settings, update } = useSettings()
  const [step, setStep] = useState<Step>('welcome')
  if (settings.onboardingDone) return null
  const idx = ORDER.indexOf(step)
  const next = () => setStep(ORDER[Math.min(ORDER.length - 1, idx + 1)] ?? 'aircraft')
  const finish = (aircraftId?: string) => {
    update({ onboardingDone: true })
    if (aircraftId) navigate(`/emulator?aircraft=${aircraftId}`)
  }
  const titles: Record<Step, string> = {
    welcome: t('onboarding.welcomeTitle'),
    simulation: t('onboarding.simTitle'),
    language: t('onboarding.languageTitle'),
    experience: t('onboarding.experienceTitle'),
    aircraft: t('onboarding.aircraftTitle'),
  }
  return (
    <Dialog
      open
      title={titles[step]}
      onClose={() => step !== 'simulation' && finish()}
      footer={
        <div className="flex w-full items-center justify-between">
          {step !== 'simulation' ? (
            <Button variant="ghost" onClick={() => finish()}>
              {t('onboarding.skip')}
            </Button>
          ) : (
            <span />
          )}
          <span className="text-xs text-fg-faint">
            {idx + 1} / {ORDER.length}
          </span>
          {step === 'aircraft' ? (
            <Button variant="primary" onClick={() => finish()}>
              {t('onboarding.finish')}
            </Button>
          ) : (
            <Button variant="primary" onClick={next}>
              {step === 'simulation' ? t('onboarding.simAccept') : t('common.next')}
            </Button>
          )}
        </div>
      }
    >
      {step === 'welcome' && <p className="leading-relaxed text-fg-muted">{t('onboarding.welcomeText')}</p>}
      {step === 'simulation' && <p className="rounded-md border border-warn/40 bg-warn/5 p-4 leading-relaxed">{t('onboarding.simText')}</p>}
      {step === 'language' && (
        <div className="grid gap-2">
          {(['system', 'ko', 'en'] as LanguagePreference[]).map((l) => (
            <Button
              key={l}
              variant={settings.language === l ? 'primary' : 'secondary'}
              onClick={() => {
                update({ language: l })
                applyLanguage(l)
              }}
            >
              {l === 'system' ? t('settings.languageSystem') : l === 'ko' ? '한국어' : 'English'}
            </Button>
          ))}
        </div>
      )}
      {step === 'experience' && (
        <div className="grid gap-2">
          {(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as UserLevel[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => update({ trainingLevel: l })}
              className={`rounded-md border p-3 text-left ${settings.trainingLevel === l ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong'}`}
            >
              <p className="font-medium">{t(`level.${l}`)}</p>
              <p className="text-sm text-fg-muted">{t(`level.${l}Desc`)}</p>
            </button>
          ))}
        </div>
      )}
      {step === 'aircraft' && (
        <div className="grid grid-cols-2 gap-2">
          {services()
            .registry.list()
            .filter((a) => a.quickStart)
            .map((a) => (
              <Button key={a.id} onClick={() => finish(a.id)}>
                {a.model}
              </Button>
            ))}
        </div>
      )}
    </Dialog>
  )
}
