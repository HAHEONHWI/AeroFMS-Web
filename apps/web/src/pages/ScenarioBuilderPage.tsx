import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BUILDER_CONDITION_TYPES, builderObjective, conditionNeedsValue, createUserScenario, generateObjectives, briefingFromForm, validateScenario } from '@aerofms/training'
import type { BuilderConditionType, ScenarioObjective, ScenarioVisibility, Difficulty } from '@aerofms/training'
import { Button } from '@/components/common/Button'
import { PageHeader, SelectInput, TextArea, TextInput } from '@/components/common/Form'
import { toast } from '@/components/common/Toast'
import { services } from '@/services/runtime'
import { currentLanguage } from '@/i18n'
import { useAuth } from '@/stores/auth'

/** Scenario Builder: users define a flight, objectives and hints without writing code. */
export function ScenarioBuilderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const aircraft = services().registry.list()
  const [form, setForm] = useState({
    title: '',
    description: '',
    aircraftId: aircraft[0]?.id ?? 'B737-800',
    difficulty: 'MEDIUM' as Difficulty,
    language: currentLanguage(),
    visibility: 'PRIVATE' as ScenarioVisibility,
    initialAirport: '',
    origin: '',
    destination: '',
    route: '',
    runway: '',
    sid: '',
    star: '',
    approach: '',
    cruise: '',
    fuel: '',
    weight: '',
  })
  const [objectives, setObjectives] = useState<ScenarioObjective[]>([])
  const [hints, setHints] = useState<string[]>([])
  const [newObj, setNewObj] = useState<{ type: BuilderConditionType; value: string; text: string; points: string }>({ type: 'ORIGIN', value: '', text: '', points: '10' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: k === 'title' || k === 'description' ? e.target.value : e.target.value.toUpperCase() })

  const scenarioForm = () => ({ ...form, fuelKg: form.fuel ? Number(form.fuel) : undefined, zfwKg: form.weight ? Number(form.weight) : undefined })
  const generate = () => setObjectives(generateObjectives(briefingFromForm(scenarioForm()), form.language, (x) => !!services().nav.getAirway(x)))

  const save = async () => {
    const scenario = createUserScenario(scenarioForm(), objectives, hints, user ? { uid: user.uid, name: user.displayName } : undefined)
    const v = validateScenario(scenario)
    if (!v.ok) {
      toast(t('scenarios.builder.invalid', { error: v.error }), 'error')
      return
    }
    await services().scenarios.save(v.scenario, 'LOCAL')
    toast(t('scenarios.builder.saved'), 'success')
    navigate(`/scenarios/${v.scenario.id}`)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title={t('scenarios.builder.title')} />
      <div className="flex flex-col gap-8">
        <section className="grid gap-4 tablet:grid-cols-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-muted tablet:col-span-2">{t('scenarios.builder.basic')}</h2>
          <div className="tablet:col-span-2">
            <TextInput label={t('scenarios.builder.titleLabel')} value={form.title} maxLength={120} onChange={set('title')} required />
          </div>
          <div className="tablet:col-span-2">
            <TextArea label={t('scenarios.builder.descriptionLabel')} value={form.description} maxLength={2000} onChange={set('description')} />
          </div>
          <SelectInput label={t('scenarios.builder.aircraft')} value={form.aircraftId} onChange={(e) => setForm({ ...form, aircraftId: e.target.value })} options={aircraft.map((a) => ({ value: a.id, label: a.displayName }))} />
          <SelectInput label={t('scenarios.builder.difficulty')} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as Difficulty })} options={(['EASY', 'MEDIUM', 'HARD'] as const).map((d) => ({ value: d, label: t(`difficulty.${d}`) }))} />
          <SelectInput label={t('scenarios.builder.language')} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as 'ko' | 'en' })} options={[{ value: 'ko', label: '한국어' }, { value: 'en', label: 'English' }]} />
          <SelectInput label={t('scenarios.builder.visibility')} value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as ScenarioVisibility })} options={(['PRIVATE', 'UNLISTED', 'PUBLIC'] as const).map((v) => ({ value: v, label: t(`scenarios.visibility.${v}`) }))} />
        </section>

        <section className="grid gap-4 tablet:grid-cols-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-muted tablet:col-span-3">{t('scenarios.builder.flight')}</h2>
          <TextInput label={t('scenarios.builder.initialAirport')} value={form.initialAirport} maxLength={4} onChange={set('initialAirport')} />
          <TextInput label={t('scenarios.builder.origin')} value={form.origin} maxLength={4} onChange={set('origin')} />
          <TextInput label={t('scenarios.builder.destination')} value={form.destination} maxLength={4} onChange={set('destination')} />
          <div className="tablet:col-span-3">
            <TextInput label={t('scenarios.builder.route')} value={form.route} placeholder="BULTI Y711 OSN Y722 KALOD" onChange={set('route')} />
          </div>
          <TextInput label={t('scenarios.builder.runway')} value={form.runway} onChange={set('runway')} />
          <TextInput label={t('scenarios.builder.sid')} value={form.sid} onChange={set('sid')} />
          <TextInput label={t('scenarios.builder.star')} value={form.star} onChange={set('star')} />
          <TextInput label={t('scenarios.builder.approach')} value={form.approach} onChange={set('approach')} />
          <TextInput label={t('scenarios.builder.cruise')} value={form.cruise} placeholder="FL350" onChange={set('cruise')} />
          <TextInput label={t('scenarios.builder.fuel')} value={form.fuel} inputMode="numeric" onChange={set('fuel')} />
          <TextInput label={t('scenarios.builder.weight')} value={form.weight} inputMode="numeric" onChange={set('weight')} />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-muted">{t('scenarios.builder.objectives')}</h2>
            <Button size="sm" onClick={generate}>
              {t('scenarios.builder.generateObjectives')}
            </Button>
          </div>
          <ol className="flex flex-col gap-2">
            {objectives.map((o, i) => (
              <li key={o.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
                <span>
                  {i + 1}. {'text' in o.text ? o.text.text : ''} <span className="text-xs text-fg-faint">({o.points})</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setObjectives(objectives.filter((x) => x.id !== o.id))}>
                  {t('common.delete')}
                </Button>
              </li>
            ))}
          </ol>
          <div className="grid gap-2 rounded-md border border-dashed border-line p-3 tablet:grid-cols-[1.2fr_1fr_1fr_5rem_auto] tablet:items-end">
            <SelectInput
              label={t('scenarios.builder.objectiveType')}
              value={newObj.type}
              onChange={(e) => setNewObj({ ...newObj, type: e.target.value as BuilderConditionType })}
              options={BUILDER_CONDITION_TYPES.map((c) => ({ value: c, label: t(`scenarios.condition.${c}`) }))}
            />
            <TextInput label={t('scenarios.builder.objectiveValue')} value={newObj.value} disabled={!conditionNeedsValue(newObj.type)} onChange={(e) => setNewObj({ ...newObj, value: e.target.value })} />
            <TextInput label={t('scenarios.builder.objectiveText')} value={newObj.text} onChange={(e) => setNewObj({ ...newObj, text: e.target.value })} />
            <TextInput label={t('scenarios.builder.points')} value={newObj.points} inputMode="numeric" onChange={(e) => setNewObj({ ...newObj, points: e.target.value })} />
            <Button
              disabled={!newObj.text.trim() || (conditionNeedsValue(newObj.type) && !newObj.value.trim())}
              onClick={() => {
                setObjectives([...objectives, builderObjective(newObj.type, newObj.value, newObj.text, Number(newObj.points))])
                setNewObj({ ...newObj, value: '', text: '' })
              }}
            >
              {t('scenarios.builder.addObjective')}
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-muted">{t('scenarios.builder.hints')}</h2>
          {hints.map((h, i) => (
            <TextInput key={i} label={`#${i + 1}`} value={h} maxLength={300} onChange={(e) => setHints(hints.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <div>
            <Button size="sm" disabled={hints.length >= 10} onClick={() => setHints([...hints, ''])}>
              {t('scenarios.builder.addHint')}
            </Button>
          </div>
        </section>

        <div className="flex gap-2">
          <Button variant="primary" size="lg" onClick={() => void save()}>
            {t('scenarios.builder.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
