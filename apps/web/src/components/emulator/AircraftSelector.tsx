import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AircraftDefinition } from '@aerofms/core'
import { services } from '@/services/runtime'
import { Button } from '@/components/common/Button'
import { SelectInput } from '@/components/common/Form'

/** Manufacturer → aircraft → system selector. */
export function AircraftSelector({ initial, onStart, startLabel }: { initial?: string; onStart: (aircraftId: string) => void; startLabel?: string }) {
  const { t } = useTranslation()
  const all = useMemo(() => services().registry.list(), [])
  const initialDef = all.find((a) => a.id === initial) ?? all[0]
  const [manufacturer, setManufacturer] = useState<AircraftDefinition['manufacturer']>(initialDef?.manufacturer ?? 'BOEING')
  const models = all.filter((a) => a.manufacturer === manufacturer)
  const [aircraftId, setAircraftId] = useState(initialDef?.id ?? '')
  const selected = models.find((a) => a.id === aircraftId) ?? models[0]
  return (
    <div className="grid gap-4 tablet:grid-cols-[1fr_1fr_1fr_auto] tablet:items-end">
      <SelectInput
        label={t('aircraft.manufacturer')}
        value={manufacturer}
        onChange={(e) => {
          const m = e.target.value as AircraftDefinition['manufacturer']
          setManufacturer(m)
          setAircraftId(all.find((a) => a.manufacturer === m)?.id ?? '')
        }}
        options={[
          { value: 'BOEING', label: 'Boeing' },
          { value: 'AIRBUS', label: 'Airbus' },
        ]}
      />
      <SelectInput label={t('aircraft.model')} value={selected?.id ?? ''} onChange={(e) => setAircraftId(e.target.value)} options={models.map((m) => ({ value: m.id, label: m.model }))} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-fg-muted">{t('aircraft.system')}</span>
        <div className="flex h-11 items-center rounded-md border border-line bg-surface px-3 text-sm">{selected?.fmsType}</div>
      </div>
      <Button variant="primary" size="md" onClick={() => selected && onStart(selected.id)}>
        {startLabel ?? t('aircraft.start')}
      </Button>
      {selected && selected.fidelityNotes.length > 0 && (
        <details className="text-xs text-fg-faint tablet:col-span-4">
          <summary className="cursor-pointer">{t('aircraft.fidelityTitle')}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {selected.fidelityNotes.map((n) => (
              <li key={n}>{t(n)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
