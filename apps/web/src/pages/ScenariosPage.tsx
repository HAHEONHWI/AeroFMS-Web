import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { SHARE_CODE_PATTERN } from '@aerofms/shared'
import { BUILTIN_SCENARIOS } from '@aerofms/training'
import type { Scenario } from '@aerofms/training'
import { ScenarioCloud } from '@aerofms/cloud'
import { Badge, PageHeader, TextInput } from '@/components/common/Form'
import { Button } from '@/components/common/Button'
import { toast } from '@/components/common/Toast'
import { services } from '@/services/runtime'
import { useLocalized } from '@/i18n'
import { getFirebase } from '@/platform/firebase'

function ScenarioCard({ s, to }: { s: Scenario; to: string }) {
  const { t } = useTranslation()
  const L = useLocalized()
  const def = services().registry.definition(s.aircraftId)
  return (
    <Link to={to} className="flex flex-col rounded-lg border border-line bg-bg-elevated p-4 hover:border-line-strong">
      <div className="flex flex-wrap gap-2">
        <Badge>{def?.model ?? s.aircraftId}</Badge>
        <Badge tone={s.difficulty === 'HARD' ? 'warn' : 'neutral'}>{t(`difficulty.${s.difficulty}`)}</Badge>
        {s.builtIn && <Badge tone="accent">{t('scenarios.builtIn')}</Badge>}
      </div>
      <h3 className="mt-3 font-semibold">{L(s.title)}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{L(s.description)}</p>
      {s.briefing.origin && (
        <p className="cdu-font mt-3 text-sm text-cdu-green">
          {s.briefing.origin} → {s.briefing.destination}
        </p>
      )}
    </Link>
  )
}

export function ScenariosPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>()
  const mine = useQuery({ queryKey: ['scenarios', 'local'], queryFn: () => services().scenarios.list() })
  const fb = getFirebase()
  const community = useQuery({
    queryKey: ['scenarios', 'public'],
    queryFn: () => (fb ? new ScenarioCloud(fb.db, fb.functions).listPublic() : Promise.resolve([])),
    enabled: !!fb && navigator.onLine,
    retry: false,
  })

  const join = async () => {
    const c = code.trim().toUpperCase()
    if (!SHARE_CODE_PATTERN.test(c)) {
      setCodeError(t('scenarios.codeInvalid'))
      return
    }
    if (!fb) {
      setCodeError(t('common.cloudUnavailable'))
      return
    }
    try {
      const found = await new ScenarioCloud(fb.db, fb.functions).getByCode(c)
      if (!found) {
        setCodeError(t('scenarios.codeNotFound'))
        return
      }
      await services().scenarios.save(found.scenario, 'CLOUD')
      navigate(`/scenarios/${found.scenario.id}`)
    } catch {
      toast(t('common.networkRequired'), 'error')
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader
        title={t('scenarios.title')}
        subtitle={t('scenarios.subtitle')}
        actions={
          <Button variant="primary" onClick={() => navigate('/scenarios/new')}>
            {t('scenarios.create')}
          </Button>
        }
      />
      <section className="mb-10 grid max-w-xl gap-2 tablet:grid-cols-[1fr_auto] tablet:items-end">
        <TextInput
          label={t('scenarios.enterCode')}
          placeholder={t('scenarios.codePlaceholder')}
          value={code}
          error={codeError}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setCodeError(undefined)
          }}
          onKeyDown={(e) => e.key === 'Enter' && void join()}
        />
        <Button onClick={() => void join()}>{t('scenarios.join')}</Button>
      </section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted">{t('scenarios.builtIn')}</h2>
      <div className="mb-10 grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
        {BUILTIN_SCENARIOS.map((s) => (
          <ScenarioCard key={s.id} s={s} to={`/scenarios/${s.id}`} />
        ))}
      </div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted">{t('scenarios.mine')}</h2>
      <div className="mb-10 grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
        {(mine.data ?? []).map((r) => (
          <ScenarioCard key={r.doc.id} s={r.doc} to={`/scenarios/${r.doc.id}`} />
        ))}
        {(mine.data ?? []).length === 0 && <p className="text-sm text-fg-faint">—</p>}
      </div>
      {fb && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted">{t('scenarios.shared')}</h2>
          <div className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
            {(community.data ?? []).map((c) => (
              <ScenarioCard key={c.scenario.id} s={c.scenario} to={`/scenarios/${c.scenario.id}?cloud=1`} />
            ))}
            {community.isError && <p className="text-sm text-fg-faint">{t('common.networkRequired')}</p>}
          </div>
        </>
      )}
    </div>
  )
}
