import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { bootstrap } from './services/bootstrap'
import { setServices } from './services/runtime'
import { analytics } from './services/analytics'
import { applyTheme } from './services/theme'
import i18n, { applyLanguage } from './i18n'
import { useSettings } from './stores/settings'
import { useAuth } from './stores/auth'
import { startAutoSync, useSync } from './stores/sync'
import { AppShell } from './components/layout/AppShell'
import { Onboarding } from './components/layout/Onboarding'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { ToastViewport, toast } from './components/common/Toast'
import { Logo } from './components/layout/Logo'
import { HomePage } from './pages/HomePage'
import { FeaturesPage } from './pages/FeaturesPage'
import { EmulatorPage } from './pages/EmulatorPage'
import { AcademyPage } from './pages/AcademyPage'
import { ScenariosPage } from './pages/ScenariosPage'
import { ScenarioDetailPage } from './pages/ScenarioDetailPage'
import { ScenarioBuilderPage } from './pages/ScenarioBuilderPage'
import { MapPage } from './pages/MapPage'
import { ReplayListPage, ReplayPage } from './pages/ReplayPages'
import { DownloadPage } from './pages/DownloadPage'
import { DisclaimerPage, PrivacyPage, TermsPage } from './pages/LegalPages'
import { AccountPage } from './pages/AccountPage'
import { SettingsPage } from './pages/SettingsPage'
import { HelpPage } from './pages/HelpPage'
import { InstructorPage } from './pages/InstructorPage'
import { NotFoundPage } from './pages/NotFoundPage'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } })

function Splash({ error }: { error?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size={56} />
      {error ? (
        <>
          <p className="font-semibold">{t('common.error')}</p>
          <p className="max-w-md text-sm text-fg-muted">{error}</p>
          <button type="button" className="h-11 rounded-md bg-accent px-4 font-semibold text-bg" onClick={() => window.location.reload()}>
            {t('common.reload')}
          </button>
        </>
      ) : (
        <p className="text-sm text-fg-muted" role="status">
          {t('app.loading')}
        </p>
      )}
      <p className="max-w-md text-xs text-fg-faint">{t('app.disclaimerShort')}</p>
    </div>
  )
}

export function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    let cancelled = false
    bootstrap()
      .then(async (svc) => {
        if (cancelled) return
        setServices(svc)
        await useSettings.getState().load()
        const settings = useSettings.getState().settings
        applyLanguage(settings.language)
        applyTheme(settings.theme)
        analytics.setEnabled(settings.analytics)
        svc.sessions.recording = settings.replayEnabled
        useAuth.getState().init()
        startAutoSync()
        void useSync.getState().refreshPending()
        setReady(true)
        if (svc.database.readOnly) toast(i18n.t('app.readOnlyTab'), 'error')
        if (svc.database.recovered || svc.migrationRecovered) toast(i18n.t('app.dataRecovered'), 'error')
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [])
  if (!ready) return <Splash error={error} />
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/features" element={<FeaturesPage />} />
              <Route path="/emulator" element={<EmulatorPage />} />
              <Route path="/academy" element={<AcademyPage />} />
              <Route path="/scenarios" element={<ScenariosPage />} />
              <Route path="/scenarios/new" element={<ScenarioBuilderPage />} />
              <Route path="/scenarios/:id" element={<ScenarioDetailPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/replay" element={<ReplayListPage />} />
              <Route path="/replay/:id" element={<ReplayPage />} />
              <Route path="/download" element={<DownloadPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/disclaimer" element={<DisclaimerPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/instructor" element={<InstructorPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppShell>
          <Onboarding />
          <ToastViewport />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
