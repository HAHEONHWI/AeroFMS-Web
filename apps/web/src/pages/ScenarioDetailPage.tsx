import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scenarioById } from '@aerofms/training'
import type { Scenario } from '@aerofms/training'
import { ScenarioCloud } from '@aerofms/cloud'
import { formatDateTime } from '@aerofms/i18n'
import { Badge } from '@/components/common/Form'
import { Button } from '@/components/common/Button'
import { toast } from '@/components/common/Toast'
import { services } from '@/services/runtime'
import { currentLanguage, useLocalized } from '@/i18n'
import { getFirebase } from '@/platform/firebase'
import { useAuth } from '@/stores/auth'

async function loadScenario(id: string, cloud: boolean): Promise<{ scenario: Scenario; source: string } | null> {
  const builtIn = scenarioById(id)
  if (builtIn) return { scenario: builtIn, source: 'BUILTIN' }
  const local = await services().scenarios.get(id)
  if (local && !cloud) return { scenario: local.doc, source: local.source }
  const fb = getFirebase()
  if (fb) {
    const remote = await new ScenarioCloud(fb.db, fb.functions).get(id).catch(() => null)
    if (remote) {
      await services().scenarios.save(remote.scenario, 'CLOUD')
      return { scenario: remote.scenario, source: 'CLOUD' }
    }
  }
  return local ? { scenario: local.doc, source: local.source } : null
}

export function ScenarioDetailPage() {
  const { t } = useTranslation()
  const L = useLocalized()
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuth((s) => s.user)
  const q = useQuery({ queryKey: ['scenario', id], queryFn: () => loadScenario(id, params.get('cloud') === '1') })
  const attempts = useQuery({ queryKey: ['attempts', id], queryFn: () => services().attempts.list(id) })
  if (q.isLoading) return <p className="px-4 py-10 text-fg-muted">{t('app.loading')}</p>
  if (!q.data) return <p className="px-4 py-10">{t('common.notFound')}</p>
  const { scenario, source } = q.data
  const def = services().registry.definition(scenario.aircraftId)
  const isMine = source === 'LOCAL' || (!!user && scenario.authorUid === user.uid)
  const b = scenario.briefing
  const fb = getFirebase()

  const share = async () => {
    if (!fb || !user) {
      toast(t('scenarios.loginToShare'), 'error')
      return
    }
    try {
      const cloud = new ScenarioCloud(fb.db, fb.functions)
      const updated: Scenario = { ...scenario, visibility: scenario.visibility === 'PRIVATE' ? 'UNLISTED' : scenario.visibility, authorUid: user.uid, authorName: user.displayName }
      await cloud.save(user.uid, user.displayName, updated)
      const code = await cloud.share(scenario.id)
      await services().scenarios.save({ ...updated, shareCode: code }, 'LOCAL')
      await navigator.clipboard?.writeText(code).catch(() => undefined)
      toast(`${t('scenarios.shareCode')}: ${code}`, 'success')
      void qc.invalidateQueries({ queryKey: ['scenario', id] })
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap gap-2">
        <Badge>{def?.displayName ?? scenario.aircraftId}</Badge>
        <Badge tone={scenario.difficulty === 'HARD' ? 'warn' : 'neutral'}>{t(`difficulty.${scenario.difficulty}`)}</Badge>
        <Badge>{t(`scenarios.visibility.${scenario.visibility}`)}</Badge>
        {scenario.shareCode && <Badge tone="accent">{scenario.shareCode}</Badge>}
      </div>
      <h1 className="mt-3 text-2xl font-semibold">{L(scenario.title)}</h1>
      <p className="mt-2 text-fg-muted">{L(scenario.description)}</p>
      {scenario.authorName && <p className="mt-1 text-xs text-fg-faint">— {scenario.authorName}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={() => navigate(`/emulator?scenario=${encodeURIComponent(scenario.id)}`)}>
          {t('scenarios.start')}
        </Button>
        {isMine && !scenario.builtIn && fb && (
          <Button size="lg" onClick={() => void share()}>
            {t('scenarios.publish')}
          </Button>
        )}
        {isMine && !scenario.builtIn && (
          <Button
            size="lg"
            variant="ghost"
            className="text-danger"
            onClick={async () => {
              if (!window.confirm(t('session.deleteConfirm'))) return
              await services().scenarios.delete(scenario.id)
              if (fb && user && scenario.authorUid === user.uid) await new ScenarioCloud(fb.db, fb.functions).remove(scenario.id).catch(() => undefined)
              navigate('/scenarios')
            }}
          >
            {t('common.delete')}
          </Button>
        )}
      </div>

      <section className="mt-8 grid gap-6 tablet:grid-cols-2">
        <div className="rounded-lg border border-line p-4">
          <h2 className="mb-3 text-sm font-semibold">{t('scenarios.briefing')}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {b.origin && (<><dt className="text-fg-faint">{t('scenarios.builder.origin')}</dt><dd className="cdu-font">{b.origin}</dd></>)}
            {b.destination && (<><dt className="text-fg-faint">{t('scenarios.builder.destination')}</dt><dd className="cdu-font">{b.destination}</dd></>)}
            {b.runway && (<><dt className="text-fg-faint">{t('scenarios.builder.runway')}</dt><dd className="cdu-font">{b.runway}</dd></>)}
            {b.sid && (<><dt className="text-fg-faint">SID</dt><dd className="cdu-font">{b.sid}</dd></>)}
            {b.route && (<><dt className="text-fg-faint">{t('scenarios.route')}</dt><dd className="cdu-font">{b.route}</dd></>)}
            {b.star && (<><dt className="text-fg-faint">STAR</dt><dd className="cdu-font">{b.star}</dd></>)}
            {b.approach && (<><dt className="text-fg-faint">{t('scenarios.builder.approach')}</dt><dd className="cdu-font">{b.approach}</dd></>)}
            {b.cruiseAltitudeFt && (<><dt className="text-fg-faint">{t('scenarios.builder.cruise')}</dt><dd className="cdu-font">FL{Math.round(b.cruiseAltitudeFt / 100)}</dd></>)}
            {b.zfwKg && (<><dt className="text-fg-faint">ZFW</dt><dd className="cdu-font">{(b.zfwKg / 1000).toFixed(1)} t</dd></>)}
            {b.fuelKg && (<><dt className="text-fg-faint">{t('modern.fuel')}</dt><dd className="cdu-font">{(b.fuelKg / 1000).toFixed(1)} t</dd></>)}
            {b.costIndex !== undefined && (<><dt className="text-fg-faint">CI</dt><dd className="cdu-font">{b.costIndex}</dd></>)}
          </dl>
        </div>
        <div className="rounded-lg border border-line p-4">
          <h2 className="mb-3 text-sm font-semibold">{t('scenarios.objectives')}</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            {scenario.objectives.map((o) => (
              <li key={o.id}>
                {L(o.text)} <span className="text-xs text-fg-faint">({t('common.points', { count: o.points })})</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">{t('scenarios.attempts')}</h2>
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {(attempts.data ?? []).length === 0 && <li className="p-3 text-fg-faint">—</li>}
          {(attempts.data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 p-3">
              <span>{formatDateTime(currentLanguage(), a.createdAt)}</span>
              <span className="cdu-font">
                {t('training.score')} {String(a.score)} · {String(a.completionPct)}% · {t('training.incorrectInputs')} {String(a.incorrectInputs)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
