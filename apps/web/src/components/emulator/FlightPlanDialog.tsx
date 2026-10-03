import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createId } from '@aerofms/shared'
import { exportFlightPlanFile, importFlightPlan } from '@aerofms/core'
import { Dialog } from '@/components/common/Dialog'
import { Button } from '@/components/common/Button'
import { TextArea } from '@/components/common/Form'
import { toast } from '@/components/common/Toast'
import { services } from '@/services/runtime'
import { useFms } from '@/stores/fms'
import { downloadJson, pickFile } from '@/services/files'

/** Flight plan import (.areofms.json / ICAO route string), export and save. */
export function FlightPlanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const state = useFms((s) => s.state)
  const dispatch = useFms((s) => s.dispatch)
  const [text, setText] = useState('')
  if (!state) return null
  const plan = state.activeFlightPlan

  const runImport = (input: string) => {
    const r = importFlightPlan(input, services().nav)
    if (!r.ok) {
      toast(t('emulator.importFailed', { reason: r.detail ?? r.error }), 'error')
      return
    }
    let errors = 0
    for (const command of r.commands) {
      const ev = dispatch({ type: 'COMMAND', command })
      errors += ev.filter((e) => e.type === 'ERROR').length
    }
    toast(errors ? t('emulator.importFailed', { reason: `${errors} entries rejected` }) : t('emulator.importSuccess'), errors ? 'error' : 'success')
    onClose()
  }

  return (
    <Dialog open={open} title={t('emulator.importFlightPlan')} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">{t('emulator.importHint')}</p>
        <TextArea label={t('emulator.importPaste')} value={text} onChange={(e) => setText(e.target.value)} placeholder="RKSI BULTI1J BULTI Y711 OSN Y722 KALOD KALOD1A RKPK" />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!text.trim()} onClick={() => runImport(text)}>
            {t('common.import')}
          </Button>
          <Button
            onClick={async () => {
              const f = await pickFile('.json,application/json')
              if (f) runImport(f)
            }}
          >
            .areofms.json
          </Button>
          <span className="flex-1" />
          <Button
            disabled={!plan.origin}
            onClick={() => downloadJson(exportFlightPlanFile(state), `${plan.origin ?? 'plan'}-${plan.destination ?? ''}.areofms.json`)}
          >
            {t('emulator.exportFlightPlan')}
          </Button>
          <Button
            disabled={!plan.origin}
            onClick={async () => {
              const now = Date.now()
              await services().flightPlans.save({
                id: createId('fp-'),
                name: `${plan.origin ?? '----'} → ${plan.destination ?? '----'}`,
                aircraftId: state.aircraft.aircraftId,
                plan,
                createdAt: now,
                updatedAt: now,
              })
              toast(t('emulator.flightPlanSaved'), 'success')
            }}
          >
            {t('emulator.saveFlightPlan')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
