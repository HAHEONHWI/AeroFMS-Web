import {
  entryError,
  opSetPositionFromAirport,
  parseLatLon,
  pendingMessages,
  row,
  setScratchpad,
  small,
  span,
} from '@aerofms/core'
import type { FmsPageDefinition, FmsState } from '@aerofms/core'
import { boxes, dashes, fmtLatLonBoeing, fmtZulu } from '../../common/format'
import { eraseOr, goTo, separatorLabel } from '../helpers'
import type { BoeingVariant } from '../variant'

export function identPage(v: BoeingVariant): FmsPageDefinition {
  return {
    id: 'IDENT',
    title: 'IDENT',
    render: (state) => ({
      title: { center: [span('IDENT')] },
      rows: [
        row({ left: [small('MODEL')], right: [small('ENG RATING')] }, { left: [span(v.definition.model)], right: [span(v.engineRatingLabel)] }),
        row(
          { left: [small('NAV DATA')], right: [small('ACTIVE')] },
          { left: [span(state.navigation.navDbCycle)], right: [span('DEMO DATA', 'white', 'S')] },
          { L: { fieldId: 'IDENT.NAV_DATA', explainKey: 'navDatabase' } },
        ),
        row({ left: [small(state.navigation.navDbName.slice(0, 24))] }, {}),
        row({ left: [small('OP PROGRAM')] }, { left: [span(v.opProgram)] }),
        row({ left: [small('DRAG/F-F')] }, { left: [span('+0.0/+0.0')] }),
        row(separatorLabel(), { left: [span('<INDEX')], right: [span('POS INIT>')] }),
      ],
    }),
    leftLskHandlers: [undefined, undefined, undefined, undefined, undefined, goTo('INIT_REF_INDEX')],
    rightLskHandlers: [undefined, undefined, undefined, undefined, undefined, goTo('POS_INIT')],
  }
}

export function posInitPage(): FmsPageDefinition {
  return {
    id: 'POS_INIT',
    title: 'POS INIT',
    pageCount: () => 2,
    render: (state, ctx) => {
      if (ctx.subPage === 2) return posRef(state)
      const ref = state.position.refAirport ? ctx.nav.searchAirport(state.position.refAirport) : undefined
      const last = state.position.aircraft ?? ref
      return {
        title: { center: [span('POS INIT')] },
        rows: [
          row({ right: [small('LAST POS')] }, { right: [span(last ? fmtLatLonBoeing(last) : '')] }, { R: { fieldId: 'POS_INIT.LAST_POS' } }),
          row(
            { left: [small('REF AIRPORT')] },
            { left: [span(state.position.refAirport ?? dashes(4))], right: [span(ref ? fmtLatLonBoeing(ref) : '')] },
            { L: { fieldId: 'POS_INIT.REF_AIRPORT', explainKey: 'refAirport' }, R: { fieldId: 'POS_INIT.REF_AIRPORT_POS' } },
          ),
          row({ left: [small('GATE')] }, { left: [span(state.position.gate ?? dashes(5))] }, { L: { fieldId: 'POS_INIT.GATE' } }),
          row(
            { right: [small('SET IRS POS')] },
            {
              right: [
                state.position.irsPosition
                  ? span(fmtLatLonBoeing(state.position.irsPosition), 'white')
                  : span(`${boxes(3)}°${boxes(2)}.${boxes(1)} ${boxes(4)}°${boxes(2)}.${boxes(1)}`, 'white'),
              ],
            },
            { R: { fieldId: 'POS_INIT.SET_IRS_POS', explainKey: 'irsPosition' } },
          ),
          row({ left: [small('GMT-MON/DY')] }, { left: [span(`${fmtZulu(state.simulation.simTimeMs, false)} ${utcMonDay(state.simulation.simTimeMs)}`)] }),
          row(separatorLabel(), { left: [span('<INDEX')], right: [span('ROUTE>')] }),
        ],
      }
    },
    leftLskHandlers: [
      undefined,
      (draft, ctx) => {
        if (ctx.deleteMode) {
          draft.position.refAirport = undefined
          return
        }
        if (!ctx.scratchpad) entryError('INVALID_ENTRY')
        const ap = ctx.nav.searchAirport(ctx.scratchpad)
        if (!ap) entryError('NOT_IN_DATABASE')
        draft.position.refAirport = ap?.icao
        ctx.fieldChanged('REF_AIRPORT', ap?.icao ?? null)
      },
      (draft, ctx) => {
        if (ctx.deleteMode) {
          draft.position.gate = undefined
          return
        }
        if (!/^[A-Z0-9]{1,5}$/.test(ctx.scratchpad)) entryError('INVALID_ENTRY')
        draft.position.gate = ctx.scratchpad
        ctx.fieldChanged('GATE', ctx.scratchpad)
      },
      undefined,
      undefined,
      goTo('INIT_REF_INDEX'),
    ],
    rightLskHandlers: [
      (draft, ctx) => {
        if (ctx.subPage === 2) return
        const p = draft.position.aircraft ?? (draft.position.refAirport ? ctx.nav.searchAirport(draft.position.refAirport) : undefined)
        if (!p || ctx.scratchpad) entryError('INVALID_ENTRY')
        else setScratchpad(draft, compactLatLon(p))
      },
      (draft, ctx) => {
        const ap = draft.position.refAirport ? ctx.nav.searchAirport(draft.position.refAirport) : undefined
        if (!ap || ctx.scratchpad) entryError('INVALID_ENTRY')
        else setScratchpad(draft, compactLatLon(ap))
      },
      undefined,
      (draft, ctx) => {
        if (!ctx.scratchpad) entryError('INVALID_ENTRY')
        const p = parseLatLon(ctx.scratchpad)
        if (!p) {
          // Allow entering an airport ICAO as a shortcut to its reference point.
          if (/^[A-Z]{4}$/.test(ctx.scratchpad)) return opSetPositionFromAirport(draft, ctx, ctx.scratchpad)
          return entryError('INVALID_ENTRY')
        }
        draft.position.irsPosition = p
        draft.position.initialized = true
        if (draft.simulation.status === 'IDLE') draft.position.aircraft = p
        ctx.fieldChanged('IRS_POS', ctx.scratchpad)
      },
      undefined,
      goTo('RTE'),
    ],
  }
}

function posRef(state: FmsState) {
  const p = state.position.aircraft
  return {
    title: { center: [span('POS REF')] },
    rows: [
      row({ left: [small('FMC POS')], right: [small('GS')] }, { left: [span(p ? fmtLatLonBoeing(p) : '', 'green')], right: [span(`${Math.round(state.position.groundSpeedKt)}KT`)] }),
      row({ left: [small('IRS(3)')] }, { left: [span(state.position.initialized && p ? fmtLatLonBoeing(p) : '', 'green')] }),
      row({ left: [small('GPS L')] }, { left: [span(p ? fmtLatLonBoeing(p) : '', 'green')] }),
      row({ left: [small('RADIO')] }, { left: [span(p && !state.position.onGround ? fmtLatLonBoeing(p) : '', 'green')] }),
      row({ left: [small('RNP/ACTUAL')], right: [small('DME DME')] }, { left: [span('1.00/0.05NM')] }),
      row(separatorLabel(), { left: [span('<INDEX')], right: [span('ROUTE>')] }),
    ],
  }
}

function compactLatLon(p: { lat: number; lon: number }): string {
  const f = (v: number, pos: string, neg: string, w: number): string => {
    const a = Math.abs(v)
    const d = Math.floor(a)
    return `${v >= 0 ? pos : neg}${String(d).padStart(w, '0')}${((a - d) * 60).toFixed(1).padStart(4, '0')}`
  }
  return `${f(p.lat, 'N', 'S', 2)}${f(p.lon, 'E', 'W', 3)}`
}

function utcMonDay(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
}

export function initRefIndexPage(v: BoeingVariant): FmsPageDefinition {
  const left: Array<[string, string]> = [
    ['<IDENT', 'IDENT'],
    ['<POS', 'POS_INIT'],
    ['<PERF', 'PERF_INIT'],
    [v.cdu === '737' ? '<TAKEOFF' : '<THRUST LIM', v.cdu === '737' ? 'TAKEOFF_REF' : 'THRUST_LIM'],
    ['<APPROACH', 'APPROACH_REF'],
    ['<OFFSET', 'OFFSET'],
  ]
  const right: Array<[string, string]> = [
    ['NAV DATA>', 'NAV_DATA'],
    ['MSG RECALL>', 'MSG_RECALL'],
    [v.cdu === '737' ? 'N1 LIMIT>' : 'TAKEOFF>', v.cdu === '737' ? 'N1_LIMIT' : 'TAKEOFF_REF'],
    ['', ''],
    ['', ''],
    ['', ''],
  ]
  return {
    id: 'INIT_REF_INDEX',
    title: 'INIT/REF INDEX',
    render: () => ({
      title: { center: [span('INIT/REF INDEX')] },
      rows: left.map(([l], i) => row({}, { left: [span(l)], right: right[i]?.[0] ? [span(right[i]?.[0] ?? '')] : undefined })),
    }),
    leftLskHandlers: left.map(([, p]) => goTo(p)),
    rightLskHandlers: right.map(([, p]) => (p ? goTo(p) : undefined)),
  }
}

export function navDataPage(): FmsPageDefinition {
  return {
    id: 'NAV_DATA',
    title: 'REF NAV DATA',
    render: (state, ctx) => {
      const ident = typeof state.currentPage.context.ident === 'string' ? state.currentPage.context.ident : undefined
      const ap = ident ? ctx.nav.searchAirport(ident) : undefined
      const wp = ident && !ap ? ctx.nav.findWaypoint(ident, state.position.aircraft ?? undefined) : undefined
      const navaid = ident ? ctx.nav.getNavaid(ident) : undefined
      const p = ap ?? wp
      return {
        title: { center: [span('REF NAV DATA')] },
        rows: [
          row(
            { left: [small('IDENT')], right: [small(ap ? 'ELEVATION' : navaid ? 'FREQ' : '')] },
            {
              left: [span(ident ?? boxes(5))],
              right: [span(ap ? `${ap.elevationFt}FT` : navaid ? navaid.frequency.toFixed(navaid.type === 'NDB' ? 0 : 2) : '')],
            },
            { L: { fieldId: 'NAV_DATA.IDENT' } },
          ),
          row({ left: [small('LATITUDE')], right: [small('LONGITUDE')] }, { left: [span(p ? fmtLatLonBoeing(p).split(' ')[0] ?? '' : '')], right: [span(p ? fmtLatLonBoeing(p).split(' ')[1] ?? '' : '')] }),
          row({ left: [small(ap ? 'NAME' : 'TYPE')] }, { left: [span(ap ? ap.name.toUpperCase().slice(0, 24) : (wp?.type ?? ''))] }),
          row({ left: [small(ap ? 'RUNWAYS' : 'AIRWAYS')] }, { left: [span(ap ? ap.runways.map((r) => r.ident).join(' ').slice(0, 24) : ident ? ctx.nav.airwaysThrough(ident).join(' ').slice(0, 24) : '')] }),
          row({ left: [small(ap ? 'TRANS ALT' : 'MAG VAR')] }, { left: [span(ap ? String(ap.transitionAltitudeFt) : p?.magVar !== undefined ? `${Math.abs(p.magVar).toFixed(0)}${p.magVar < 0 ? 'W' : 'E'}` : '')] }),
          row(separatorLabel(), { left: [span('<INDEX')] }),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (!ctx.scratchpad) entryError('INVALID_ENTRY')
        const s = ctx.scratchpad
        if (!ctx.nav.searchAirport(s) && !ctx.nav.findWaypoint(s)) entryError('NOT_IN_DATABASE')
        draft.currentPage.context.ident = s
      },
      undefined,
      undefined,
      undefined,
      undefined,
      goTo('INIT_REF_INDEX'),
    ],
    rightLskHandlers: [],
  }
}

export function msgRecallPage(): FmsPageDefinition {
  return {
    id: 'MSG_RECALL',
    title: 'MESSAGE RECALL',
    render: (state) => {
      const msgs = [...state.messages].reverse().slice(0, 5)
      return {
        title: { center: [span('MESSAGE RECALL')] },
        rows: [
          ...msgs.map((m) => row({ left: [small(fmtZulu(m.createdAt, false))] }, { left: [span(m.text, m.acknowledged ? 'white' : 'amber')] })),
          ...Array.from({ length: 5 - msgs.length }, () => row()),
          row(separatorLabel(), { left: [span('<INDEX')], right: [span(pendingMessages(state).length ? 'ACKNOWLEDGE>' : '')] }),
        ],
      }
    },
    leftLskHandlers: [undefined, undefined, undefined, undefined, undefined, goTo('INIT_REF_INDEX')],
    rightLskHandlers: [
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (draft) => {
        for (const m of draft.messages) m.acknowledged = true
      },
    ],
  }
}

export function offsetPage(): FmsPageDefinition {
  return {
    id: 'OFFSET',
    title: 'LATERAL OFFSET',
    render: (state) => {
      const o = state.navigation.offsetNm
      return {
        title: { center: [span('LATERAL OFFSET')] },
        rows: [
          row({ left: [small('OFFSET DIST')] }, { left: [span(o ? `${o < 0 ? 'L' : 'R'}${Math.abs(o)}` : dashes(3))] }, { L: { fieldId: 'OFFSET.DIST', explainKey: 'offset' } }),
          row(),
          row(),
          row(),
          row(),
          eraseOr(state, '<INDEX'),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (ctx.deleteMode) {
          draft.navigation.offsetNm = undefined
          ctx.fieldChanged('OFFSET', null)
          return
        }
        const m = /^([LR])(\d{1,2}(?:\.\d)?)$/.exec(ctx.scratchpad)
        if (!m) entryError('INVALID_ENTRY')
        const nm = Number(m?.[2])
        if (nm < 1 || nm > 99) entryError('INVALID_ENTRY')
        draft.navigation.offsetNm = m?.[1] === 'L' ? -nm : nm
        ctx.fieldChanged('OFFSET', ctx.scratchpad)
      },
      undefined,
      undefined,
      undefined,
      undefined,
      goTo('INIT_REF_INDEX'),
    ],
    rightLskHandlers: [],
  }
}

/** CDU MENU: subsystem selection (FMC and the AeroFMS simulation control subsystem). */
export function menuPage(): FmsPageDefinition {
  return {
    id: 'MENU',
    title: 'MENU',
    render: () => ({
      title: { center: [span('MENU')] },
      rows: [
        row({}, { left: [span('<FMC')], right: [span('<ACT>', 'green', 'S')] }),
        row({}, { left: [span('<SIM CTL')] }),
        row(),
        row(),
        row(),
        row(),
      ],
    }),
    leftLskHandlers: [goTo('IDENT'), goTo('SIM')],
    rightLskHandlers: [],
  }
}
