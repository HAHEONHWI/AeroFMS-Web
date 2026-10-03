import type { NavigationProvider } from '@aerofms/navigation'
import { InMemoryNavigationProvider } from '@aerofms/navigation'
import { lskRow, lskSide } from '@aerofms/core'
import type { AircraftFmsAdapter, EngineUpdate, FmsEvent } from '@aerofms/core'
import { k } from './text'
import type { LocalizedText } from './text'

export interface MistakeExplanation {
  code: string
  /** Message shown by the FMC (e.g. NOT IN DATA BASE). */
  fmcMessage: string
  title: LocalizedText
  body: LocalizedText
  why: LocalizedText
  hint: LocalizedText
  fieldId?: string
  entry?: string
  suggestions: string[]
  actionIndex: number
}

/** Expected-format hint per field (i18n key under mistake.format.*). */
const FIELD_FORMAT: Record<string, string> = {
  'RTE.ORIGIN': 'icao',
  'RTE.DEST': 'icao',
  'RTE.RUNWAY': 'runway',
  'RTE.FLT_NO': 'flightNumber',
  'RTE.VIA': 'via',
  'RTE.TO': 'waypoint',
  'LEGS.WAYPOINT': 'waypoint',
  'LEGS.DISCONTINUITY': 'waypoint',
  'LEGS.CONSTRAINT': 'boeingConstraint',
  'PERF.ZFW': 'weight',
  'PERF.FUEL': 'weight',
  'PERF.RESERVES': 'weight',
  'PERF.GW': 'weight',
  'PERF.COST_INDEX': 'costIndex',
  'PERF.CRZ_ALT': 'cruiseAltitude',
  'PERF.CRZ_WIND': 'wind',
  'PERF.ISA_DEV': 'temperature',
  'POS_INIT.REF_AIRPORT': 'icao',
  'POS_INIT.SET_IRS_POS': 'latlon',
  'TO.FLAPS': 'flaps',
  'TO.V1': 'speed',
  'TO.VR': 'speed',
  'TO.V2': 'speed',
  'INIT.FROM_TO': 'fromTo',
  'INIT.COST_INDEX': 'costIndex',
  'INIT.CRZ_FL': 'cruiseAltitude',
  'INIT_B.ZFW': 'zfwCg',
  'INIT_B.BLOCK': 'weight',
  'FPLN.WAYPOINT': 'waypoint',
  'FPLN.CONSTRAINT': 'airbusConstraint',
  'AIRWAYS.VIA': 'via',
  'AIRWAYS.TO': 'waypoint',
  'DIRTO.WAYPOINT': 'waypoint',
  'HOLD.INBD': 'holdInbound',
  'LATREV.NEXT_WPT': 'waypoint',
  'LATREV.NEW_DEST': 'icao',
}

/** Finds the field bound to the LSK that caused an error by rendering the page as it was. */
function fieldFor(update: EngineUpdate, adapter: AircraftFmsAdapter, nav: NavigationProvider): string | undefined {
  if (update.action.type !== 'LSK') return undefined
  const page = adapter.renderPage(update.previous, nav)
  const row = page.rows[lskRow(update.action.lsk) - 1]
  return row?.fields?.[lskSide(update.action.lsk)]?.fieldId
}

/**
 * Mistake Analyzer: turns an FMC entry error into a learner-friendly explanation
 * (why it happened, how to fix it, "did you mean" suggestions).
 */
export function analyzeMistake(
  update: EngineUpdate,
  error: FmsEvent,
  adapter: AircraftFmsAdapter,
  nav: NavigationProvider,
): MistakeExplanation {
  const entry = typeof error.value === 'string' ? error.value : update.previous.scratchpad.text
  const fieldId = fieldFor(update, adapter, nav)
  const format = fieldId ? FIELD_FORMAT[fieldId] : undefined
  const fmcMessage = update.state.scratchpad.message?.text ?? error.detail
  const params = { entry: entry || '—', field: fieldId ?? '', message: fmcMessage }
  const suggestions =
    error.detail === 'NOT_IN_DATABASE' && entry && nav instanceof InMemoryNavigationProvider ? nav.suggest(entry.split(':')[0] ?? entry) : []
  const base = {
    code: error.detail,
    fmcMessage,
    fieldId,
    entry,
    suggestions,
    actionIndex: error.actionIndex,
    hint: format ? k(`mistake.format.${format}`) : k('mistake.hint.generic'),
  }
  switch (error.detail) {
    case 'NOT_IN_DATABASE':
      return {
        ...base,
        title: k('mistake.notInDatabase.title'),
        body: k('mistake.notInDatabase.body', params),
        why: k('mistake.notInDatabase.why'),
      }
    case 'INVALID_DELETE':
      return {
        ...base,
        title: k('mistake.invalidDelete.title'),
        body: k('mistake.invalidDelete.body', params),
        why: k(adapter.manufacturer === 'BOEING' ? 'mistake.invalidDelete.whyBoeing' : 'mistake.invalidDelete.whyAirbus'),
      }
    case 'AIRWAY_NOT_CONNECTED':
      return {
        ...base,
        title: k('mistake.airwayNotConnected.title'),
        body: k('mistake.airwayNotConnected.body', params),
        why: k('mistake.airwayNotConnected.why'),
      }
    case 'ARR_DEP_FIRST':
      return { ...base, title: k('mistake.originFirst.title'), body: k('mistake.originFirst.body', params), why: k('mistake.originFirst.why') }
    case 'NOT_ALLOWED':
      return { ...base, title: k('mistake.notAllowed.title'), body: k('mistake.notAllowed.body', params), why: k('mistake.notAllowed.why') }
    case 'ENTRY_OUT_OF_RANGE':
      return { ...base, title: k('mistake.outOfRange.title'), body: k('mistake.outOfRange.body', params), why: k('mistake.outOfRange.why') }
    case 'TEMPORARY_PENDING':
    case 'MOD_PENDING':
      return { ...base, title: k('mistake.pending.title'), body: k('mistake.pending.body', params), why: k('mistake.pending.why') }
    default:
      return {
        ...base,
        title: k('mistake.invalidEntry.title'),
        body: k('mistake.invalidEntry.body', params),
        why: k(format ? `mistake.why.${format}` : 'mistake.invalidEntry.why'),
      }
  }
}
