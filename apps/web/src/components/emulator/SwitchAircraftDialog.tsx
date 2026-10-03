import { useTranslation } from 'react-i18next'
import { Dialog } from '@/components/common/Dialog'
import { Button } from '@/components/common/Button'
import { services } from '@/services/runtime'
import { useFms } from '@/stores/fms'

/** "Save the current 737-800 FMC session and switch to A320neo?" */
export function SwitchAircraftDialog({ target, onClose }: { target: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const state = useFms((s) => s.state)
  const switchAircraft = useFms((s) => s.switchAircraft)
  if (!target || !state) return null
  const from = services().registry.definition(state.aircraft.aircraftId)
  const to = services().registry.definition(target)
  const go = async (mode: 'save' | 'discard') => {
    onClose()
    await switchAircraft(target, mode)
  }
  return (
    <Dialog
      open
      title={t('aircraft.switchTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void go('discard')}>{t('aircraft.switchWithoutSaving')}</Button>
          <Button variant="primary" onClick={() => void go('save')}>
            {t('aircraft.saveAndSwitch')}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed">
        {t('aircraft.switchQuestion', { from: from?.model ?? '', system: from?.manufacturer === 'AIRBUS' ? 'MCDU' : 'FMC', to: to?.model ?? '' })}
      </p>
    </Dialog>
  )
}
