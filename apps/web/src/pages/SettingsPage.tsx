import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { LanguagePreference } from '@aerofms/i18n'
import type { UnitSystem } from '@aerofms/shared'
import type { UserLevel } from '@aerofms/training'
import { Button } from '@/components/common/Button'
import { PageHeader, SelectInput, Toggle } from '@/components/common/Form'
import { toast } from '@/components/common/Toast'
import { applyLanguage } from '@/i18n'
import { services, APP_VERSION, isDebugBuild } from '@/services/runtime'
import { ensureNavDatabase } from '@/services/bootstrap'
import { analytics, track } from '@/services/analytics'
import { useSettings } from '@/stores/settings'
import type { ThemePreference } from '@/stores/settings'
import { ConnectorPanel } from '@/components/emulator/ConnectorPanel'
import { applyTheme } from '@/services/theme'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-bg-elevated p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { settings, update } = useSettings()
  const nav = services().nav
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t('settings.title')} />
      <div className="flex flex-col gap-5">
        <Section title={t('settings.language')}>
          <SelectInput
            label={t('settings.language')}
            value={settings.language}
            onChange={(e) => {
              const v = e.target.value as LanguagePreference
              update({ language: v })
              const lang = applyLanguage(v)
              track('language_changed', { language: lang })
            }}
            options={[
              { value: 'system', label: t('settings.languageSystem') },
              { value: 'ko', label: t('settings.languageKo') },
              { value: 'en', label: t('settings.languageEn') },
            ]}
          />
        </Section>
        <Section title={t('settings.theme')}>
          <SelectInput
            label={t('settings.theme')}
            value={settings.theme}
            onChange={(e) => {
              const v = e.target.value as ThemePreference
              update({ theme: v })
              applyTheme(v)
            }}
            options={[
              { value: 'dark', label: t('settings.themeDark') },
              { value: 'dim', label: t('settings.themeDim') },
              { value: 'system', label: t('settings.themeSystem') },
            ]}
          />
        </Section>
        <Section title={t('settings.units')}>
          <SelectInput
            label={t('settings.units')}
            value={settings.units}
            onChange={(e) => update({ units: e.target.value as UnitSystem })}
            options={[
              { value: 'AVIATION', label: t('settings.unitsAviation') },
              { value: 'METRIC', label: t('settings.unitsMetric') },
              { value: 'IMPERIAL', label: t('settings.unitsImperial') },
            ]}
          />
          <p className="text-xs text-fg-faint">{t('settings.unitsNote')}</p>
        </Section>
        <Section title={t('settings.navData')}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-fg-faint">{t('settings.navDataCycle')}</dt>
            <dd className="cdu-font">{nav.meta.cycle}</dd>
            <dt className="text-fg-faint">{t('settings.navDataSource')}</dt>
            <dd className="text-fg-muted">{nav.meta.isDemo ? t('settings.navDataDemoSource') : nav.meta.source}</dd>
          </dl>
          <div>
            <Button
              onClick={async () => {
                await ensureNavDatabase(services().db, true)
                toast(t('settings.navDataReimported'), 'success')
              }}
            >
              {t('settings.navDataReimport')}
            </Button>
          </div>
        </Section>
        <Section title={t('settings.mapSettings')}>
          <Toggle label={t('settings.mapAirways')} checked={settings.mapAirways} onChange={(v) => update({ mapAirways: v })} />
          <Toggle label={t('settings.mapBasemap')} description={t('map.basemapHint')} checked={settings.mapBasemap} onChange={(v) => update({ mapBasemap: v })} />
        </Section>
        <Section title={t('settings.simulator')}>
          <ConnectorPanel />
        </Section>
        <Section title={t('settings.cloudSync')}>
          <Toggle label={t('settings.cloudSyncEnabled')} checked={settings.cloudSync} onChange={(v) => update({ cloudSync: v })} />
        </Section>
        <Section title={t('settings.sound')}>
          <SelectInput
            label={t('settings.sound')}
            value={settings.sound}
            onChange={(e) => update({ sound: e.target.value as 'off' | 'soft' | 'classic' })}
            options={[
              { value: 'off', label: t('settings.soundOff') },
              { value: 'soft', label: t('settings.soundSoft') },
              { value: 'classic', label: t('settings.soundClassic') },
            ]}
          />
          <Toggle label={t('settings.haptic')} checked={settings.haptic} onChange={(v) => update({ haptic: v })} />
        </Section>
        <Section title={t('settings.trainingAssistance')}>
          <SelectInput
            label={t('settings.trainingAssistance')}
            value={settings.trainingLevel}
            onChange={(e) => update({ trainingLevel: e.target.value as UserLevel })}
            options={(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const).map((l) => ({ value: l, label: `${t(`level.${l}`)} – ${t(`level.${l}Desc`)}` }))}
          />
        </Section>
        <Section title={t('settings.replay')}>
          <Toggle label={t('settings.replayEnabled')} checked={settings.replayEnabled} onChange={(v) => update({ replayEnabled: v })} />
        </Section>
        <Section title={t('settings.privacy')}>
          <Toggle
            label={t('settings.analytics')}
            checked={settings.analytics}
            onChange={(v) => {
              update({ analytics: v })
              analytics.setEnabled(v)
            }}
          />
          <Toggle label={t('settings.crashReports')} checked={settings.crashReports} onChange={(v) => update({ crashReports: v })} />
        </Section>
        <Section title={t('settings.dataManagement')}>
          <p className="text-sm text-fg-muted">{t('settings.storageInfo')}</p>
          <div>
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm(t('settings.resetLocalConfirm'))) return
                await services().database.destroy()
                qc.clear()
                window.location.reload()
              }}
            >
              {t('settings.resetLocal')}
            </Button>
          </div>
        </Section>
        <Section title={t('settings.about')}>
          <p className="text-sm text-fg-muted">{t('settings.aboutText')}</p>
          <p className="text-xs text-fg-faint">
            AeroFMS {t('common.version', { version: APP_VERSION })} {isDebugBuild ? '(debug)' : ''}
          </p>
        </Section>
      </div>
    </div>
  )
}
