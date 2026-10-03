import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BUILTIN_LESSONS, BUILTIN_SCENARIOS } from '@aerofms/training'
import { formatRelative } from '@aerofms/i18n'
import { Button } from '@/components/common/Button'
import { Badge } from '@/components/common/Form'
import { Logo } from '@/components/layout/Logo'
import { services } from '@/services/runtime'
import { currentLanguage, useLocalized } from '@/i18n'
import { useConnector } from '@/components/emulator/ConnectorPanel'

const FEATURES = ['multiAircraft', 'offline', 'training', 'visual', 'replay', 'companion'] as const

export function HomePage() {
  const { t } = useTranslation()
  const L = useLocalized()
  const navigate = useNavigate()
  const s = services()
  const sessions = useQuery({ queryKey: ['sessions', 'all'], queryFn: () => s.sessions.list() })
  const current = useQuery({ queryKey: ['sessions', 'current'], queryFn: () => s.sessions.currentSessionId().then((id) => id ?? null) })
  const progress = useQuery({ queryKey: ['progress'], queryFn: () => s.progress.list() })
  const plans = useQuery({ queryKey: ['flightPlans'], queryFn: () => s.flightPlans.list() })
  const connector = useConnector((c) => c.status)
  // The open session first; otherwise the most recently updated one.
  const recent = sessions.data?.find((x) => x.id === current.data) ?? sessions.data?.[0]
  const recentDef = recent ? s.registry.definition(recent.aircraftId) : undefined
  const quick = s.registry.list().filter((a) => a.quickStart)
  const done = new Set((progress.data ?? []).filter((p) => p.status === 'COMPLETED').map((p) => p.lessonId))
  const nextLesson = BUILTIN_LESSONS.find((l) => !done.has(l.id)) ?? BUILTIN_LESSONS[0]

  return (
    <div>
      <section className="border-b border-line bg-[radial-gradient(ellipse_at_top,rgba(79,179,169,0.10),transparent_60%)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 desktop:grid-cols-[1.1fr_1fr] desktop:py-20">
          <div className="flex flex-col justify-center gap-6">
            <div className="flex items-center gap-3">
              <Logo size={40} />
              <div>
                <p className="text-2xl font-semibold tracking-tight">AeroFMS</p>
                <p className="text-sm text-fg-muted">{t('app.tagline')}</p>
              </div>
            </div>
            <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight tablet:text-4xl">{t('home.heroTitle')}</h1>
            <p className="max-w-xl text-fg-muted">{t('home.heroSubtitle')}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="lg" onClick={() => navigate('/emulator')}>
                {t('home.startWeb')}
              </Button>
              <Button size="lg" onClick={() => navigate('/download')}>
                {t('home.androidApp')}
              </Button>
            </div>
            <p className="max-w-xl text-xs text-fg-faint">{t('app.disclaimerShort')}</p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-line bg-bg-elevated p-5">
              <p className="text-xs uppercase tracking-wider text-fg-faint">{t('home.recentSession')}</p>
              {recent ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{recentDef?.displayName}</p>
                    <p className="cdu-font text-sm text-cdu-green">
                      {recent.origin ?? '----'} → {recent.destination ?? '----'}
                    </p>
                    <p className="text-xs text-fg-faint">{t('session.updated', { time: formatRelative(currentLanguage(), recent.updatedAt) })}</p>
                  </div>
                  <Button variant="primary" onClick={() => navigate(`/emulator?session=${encodeURIComponent(recent.id)}`)}>
                    {t('home.continueSession')}
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-fg-muted">{t('home.noSession')}</p>
              )}
            </div>
            <div className="rounded-lg border border-line bg-bg-elevated p-5">
              <p className="text-xs uppercase tracking-wider text-fg-faint">{t('home.quickStart')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {quick.map((a) => (
                  <Button key={a.id} onClick={() => navigate(`/emulator?aircraft=${a.id}`)} className="justify-between">
                    <span>{a.model}</span>
                    <span className="text-xs text-fg-faint">{a.manufacturer === 'AIRBUS' ? 'MCDU' : 'FMC'}</span>
                  </Button>
                ))}
                <Button variant="ghost" className="col-span-2" onClick={() => navigate('/emulator')}>
                  {t('home.allAircraft')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-10 tablet:grid-cols-2 desktop:grid-cols-4">
        <div className="rounded-lg border border-line p-4">
          <p className="text-xs uppercase tracking-wider text-fg-faint">{t('home.recommendedLesson')}</p>
          {nextLesson && (
            <>
              <p className="mt-2 font-medium">{L(nextLesson.title)}</p>
              <Link className="mt-3 inline-block text-sm text-accent" to={`/emulator?lesson=${nextLesson.id}`}>
                {t('academy.start')} →
              </Link>
            </>
          )}
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-xs uppercase tracking-wider text-fg-faint">{t('home.recentScenarios')}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {BUILTIN_SCENARIOS.slice(0, 3).map((sc) => (
              <li key={sc.id}>
                <Link className="hover:text-accent" to={`/scenarios/${sc.id}`}>
                  {L(sc.title)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-xs uppercase tracking-wider text-fg-faint">{t('home.recentPlans')}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {(plans.data ?? []).slice(0, 3).map((p) => (
              <li key={p.id} className="cdu-font text-cdu-green">
                {p.name}
              </li>
            ))}
            {(plans.data ?? []).length === 0 && <li className="text-fg-faint">—</li>}
          </ul>
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-xs uppercase tracking-wider text-fg-faint">{t('home.navDbStatus')}</p>
          <p className="cdu-font mt-2 text-sm">{s.nav.meta.cycle}</p>
          <Badge tone="warn">DEMO</Badge>
          <p className="mt-3 text-xs uppercase tracking-wider text-fg-faint">{t('home.simulatorStatus')}</p>
          <p className="text-sm">{t(`connector.status.${connector}`)}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16">
        <h2 className="mb-6 text-xl font-semibold">{t('home.featuresTitle')}</h2>
        <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f} className="rounded-lg border border-line bg-bg-elevated p-5">
              <h3 className="font-semibold">{t(`home.features.${f}`)}</h3>
              <p className="mt-2 text-sm text-fg-muted">{t(`home.features.${f}Desc`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
