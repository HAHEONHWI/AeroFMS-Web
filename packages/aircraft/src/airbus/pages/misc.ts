import { bearingDeg, distanceNm } from '@aerofms/shared'
import {
  displayedPlan,
  entryError,
  grossWeightKg,
  maxAltitudeFt,
  opSetCruiseAltitude,
  optimumAltitudeFt,
  parseCourse,
  parseDecimal,
  parseInteger,
  resolveWaypointEntry,
  row,
  span,
  splitSlash,
  trueToMag,
} from '@aerofms/core'
import type { FmsPageDefinition, FmsState, LskHandler } from '@aerofms/core'
import { fmtCourse, fmtDistance, fmtFl } from '../../common/format'
import { abTitle, goTo, label } from '../helpers'
import type { AirbusVariant } from '../variant'

export function progPage(v: AirbusVariant): FmsPageDefinition {
  const phaseName = (s: FmsState): string =>
    ({ PREFLIGHT: 'PREFLIGHT', TAXI: 'PREFLIGHT', TAKEOFF: 'TAKE OFF', CLIMB: 'CLB', CRUISE: 'CRZ', DESCENT: 'DES', APPROACH: 'APPR', GO_AROUND: 'GO AROUND', LANDED: 'DONE' })[s.flightPhase]
  return {
    id: 'PROG',
    title: 'PROG',
    render: (state, ctx) => {
      const plan = displayedPlan(state)
      const gw = grossWeightKg(state.performance)
      const ref = typeof state.currentPage.context.bdTo === 'string' ? state.currentPage.context.bdTo : undefined
      const wp = ref ? ctx.nav.findWaypoint(ref, state.position.aircraft ?? undefined) : undefined
      const pos = state.position.aircraft
      const bd = wp && pos ? `${fmtCourse(trueToMag(bearingDeg(pos, wp), wp.magVar))}/${fmtDistance(distanceNm(pos, wp))}` : '---°/----.-'
      const title = abTitle(state, `${phaseName(state)} ${plan.flightNumber ?? ''}`.trim(), { mfd: v.display === 'AIRBUS_MFD', mfdName: 'POSITION/MONITOR', color: 'green' })
      return {
        title,
        rows: [
          row(label('CRZ', 'REC MAX', 'OPT'), {
            left: [span(state.performance.cruiseAltitudeFt ? fmtFl(state.performance.cruiseAltitudeFt) : '-----', 'cyan')],
            center: [span(gw !== undefined ? fmtFl(optimumAltitudeFt(ctx.perf, gw)) : '-----', 'green')],
            right: [span(gw !== undefined ? fmtFl(maxAltitudeFt(ctx.perf, gw)) : `${fmtFl(ctx.perf.maxCertifiedAltitudeFt)}`, 'magenta')],
          }, { L: { fieldId: 'AB_PROG.CRZ', explainKey: 'cruiseAltitude' } }),
          row(label(' VDEV', 'XTK'), { left: [span(`${Math.round(state.position.altitudeFt - state.simulation.targetAltitudeFt)}FT`, 'green')], right: [span(`${Math.abs(state.guidance.crossTrackNm).toFixed(1)}${state.guidance.crossTrackNm < 0 ? 'L' : 'R'}`, 'green')] }),
          row(label(' BRG / DIST', 'TO'), { left: [span(bd, 'green')], right: [span(ref ?? '[     ]', 'cyan')] }, { R: { fieldId: 'AB_PROG.BRG_DIST', explainKey: 'bearingDistance' } }),
          row(label(' PREDICTIVE'), { left: [span('<GPS')], right: [span('GPS PRIMARY', 'green')] }),
          row(label('REQUIRED  ACCUR  ESTIMATED'), { left: [span('1.0NM', 'cyan')], center: [span('HIGH', 'green')], right: [span('0.05NM', 'green')] }),
          row(),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (ctx.deleteMode) return entryError('NOT_ALLOWED')
        opSetCruiseAltitude(draft, ctx, ctx.scratchpad)
      },
    ],
    rightLskHandlers: [
      undefined,
      undefined,
      (draft, ctx) => {
        if (ctx.deleteMode) {
          draft.currentPage.context.bdTo = null
          return
        }
        const wp = resolveWaypointEntry(ctx, ctx.scratchpad, draft.position.aircraft ?? undefined)
        draft.currentPage.context.bdTo = wp.ident
      },
    ],
  }
}

export function radNavPage(v: AirbusVariant): FmsPageDefinition {
  const setVor =
    (side: 'vor1' | 'vor2'): LskHandler =>
    (draft, ctx) => {
      if (ctx.deleteMode) {
        draft.navigation.radios[side] = undefined
        return
      }
      const [idOrFreq] = splitSlash(ctx.scratchpad)
      const freq = parseDecimal(idOrFreq ?? '', 108, 117.95, 2)
      if (freq !== undefined) {
        draft.navigation.radios[side] = { frequency: freq, manual: true }
        return
      }
      const n = ctx.nav.getNavaid(idOrFreq ?? '', draft.position.aircraft ?? undefined)
      if (!n || n.type === 'NDB') return entryError('NOT_IN_DATABASE')
      draft.navigation.radios[side] = { ident: n.ident, frequency: n.frequency, manual: true }
    }
  const setCrs =
    (side: 'vor1' | 'vor2'): LskHandler =>
    (draft, ctx) => {
      const c = parseCourse(ctx.scratchpad)
      const r = draft.navigation.radios[side]
      if (c === undefined || !r) return entryError('FORMAT_ERROR')
      r.course = c
    }
  return {
    id: 'RAD_NAV',
    title: 'RADIO NAV',
    render: (state, ctx) => {
      const r = state.navigation.radios
      const plan = displayedPlan(state)
      const ap = plan.destination ? ctx.nav.searchAirport(plan.destination) : undefined
      const rw = ap && plan.arrivalRunway ? ap.runways.find((x) => x.ident === plan.arrivalRunway) : undefined
      const fmt = (x: typeof r.vor1) => (x ? `${x.ident ?? ''}/${x.frequency?.toFixed(2) ?? ''}` : '[ ]/[  .  ]')
      return {
        title: abTitle(state, 'RADIO NAV', { mfd: v.display === 'AIRBUS_MFD', mfdName: 'NAVAIDS' }),
        rows: [
          row(label('VOR1/FREQ', 'FREQ/VOR2'), { left: [span(fmt(r.vor1), 'cyan')], right: [span(fmt(r.vor2), 'cyan')] }),
          row(label('CRS', 'CRS'), { left: [span(r.vor1?.course !== undefined ? fmtCourse(r.vor1.course) : '[ ]', 'cyan')], right: [span(r.vor2?.course !== undefined ? fmtCourse(r.vor2.course) : '[ ]', 'cyan')] }),
          row(label('ILS /FREQ'), { left: [span(rw?.ilsFrequency ? `I${plan.arrivalRunway}/${rw.ilsFrequency.toFixed(2)}` : '[  ]/[  .  ]', 'cyan')] }),
          row(label('CRS'), { left: [span(rw?.ilsCourse !== undefined ? fmtCourse(rw.ilsCourse) : '---', 'cyan')] }),
          row(label('ADF1/FREQ'), { left: [span(r.adf1 ? `/${r.adf1}` : '[ ]/[    ]', 'cyan')] }),
          row(),
        ],
      }
    },
    leftLskHandlers: [
      setVor('vor1'),
      setCrs('vor1'),
      undefined,
      undefined,
      (draft, ctx) => {
        const [, f] = splitSlash(ctx.scratchpad)
        const kHz = parseInteger(f ?? ctx.scratchpad, 190, 1750)
        if (kHz === undefined) return entryError('ENTRY_OUT_OF_RANGE')
        draft.navigation.radios.adf1 = kHz
      },
    ],
    rightLskHandlers: [setVor('vor2'), setCrs('vor2')],
  }
}

export function mcduMenuPage(): FmsPageDefinition {
  return {
    id: 'MCDU_MENU',
    title: 'MCDU MENU',
    render: () => ({
      title: { center: [span('MCDU MENU')] },
      rows: [
        row({}, { left: [span('<FMGC', 'green')], right: [span('(REQ)', 'white', 'S')] }),
        row({}, { left: [span('<SIM CTL')] }),
        row(),
        row(),
        row(),
        row(),
      ],
    }),
    leftLskHandlers: [goTo('F_PLN'), goTo('SIM')],
    rightLskHandlers: [],
  }
}

/** Datalink is not simulated: shows the real "no ATC connection" state. */
export function atcCommPage(): FmsPageDefinition {
  return {
    id: 'ATC_COMM',
    title: 'ATC MENU',
    render: () => ({
      title: { center: [span('ATC MENU')] },
      rows: [
        row(label('CONNECTION STATUS'), { left: [span('NO ACTIVE ATC', 'white')] }),
        row(label('NEXT ATC'), { left: [span('----', 'cyan')] }),
        row(),
        row(),
        row(label('DATALINK'), { left: [span('NOT AVAILABLE', 'amber')] }),
        row(),
      ],
    }),
    leftLskHandlers: [],
    rightLskHandlers: [],
  }
}

export function abFixInfoPage(): FmsPageDefinition {
  const idx = 0
  return {
    id: 'AB_FIX_INFO',
    title: 'FIX INFO',
    onOpen: (draft, ctx) => {
      const ident = draft.currentPage.context.ident
      if (typeof ident === 'string' && !draft.navigation.fixInfo.some((f) => f.ref.ident === ident)) {
        const wp = resolveWaypointEntry(ctx, ident, draft.position.aircraft ?? undefined)
        draft.navigation.fixInfo.splice(idx, 1, { ref: wp, radials: [], distancesNm: [], abeam: false })
      }
    },
    render: (state) => {
      const f = state.navigation.fixInfo[idx]
      const items = f ? [...f.radials.map((r) => `${String(r).padStart(3, '0')}°`), ...f.distancesNm.map((d) => `${d}NM`)] : []
      return {
        title: { center: [span('FIX INFO')] },
        rows: [
          row(label('REF FIX'), { left: [span(f?.ref.ident ?? '[    ]', 'cyan')] }, { L: { fieldId: 'AB_FIX.REF', explainKey: 'fixInfo' } }),
          row(label('RADIUS'), { left: [span(f?.distancesNm[0] !== undefined ? `${f.distancesNm[0]}` : '[  ]', 'cyan')] }),
          row(label('RADIAL'), { left: [span(f?.radials[0] !== undefined ? `${String(f.radials[0]).padStart(3, '0')}°` : '[ ]°', 'cyan')] }),
          row(label('RADIAL'), { left: [span(f?.radials[1] !== undefined ? `${String(f.radials[1]).padStart(3, '0')}°` : '[ ]°', 'cyan')] }),
          row(label('ACTIVE'), { left: [span(items.join(' '), 'green')] }),
          row({}, { left: [span('<RETURN')] }),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (ctx.deleteMode) {
          draft.navigation.fixInfo.splice(idx, 1)
          return
        }
        const wp = resolveWaypointEntry(ctx, ctx.scratchpad, draft.position.aircraft ?? undefined)
        draft.navigation.fixInfo.splice(idx, 1, { ref: wp, radials: [], distancesNm: [], abeam: false })
      },
      (draft, ctx) => {
        const f = draft.navigation.fixInfo[idx]
        if (!f) return entryError('NOT_ALLOWED')
        if (ctx.deleteMode) {
          f.distancesNm = []
          return
        }
        const d = parseDecimal(ctx.scratchpad, 1, 999)
        if (d === undefined) return entryError('ENTRY_OUT_OF_RANGE')
        f.distancesNm = [d]
      },
      ...[0, 1].map(
        (i): LskHandler =>
          (draft, ctx) => {
            const f = draft.navigation.fixInfo[idx]
            if (!f) return entryError('NOT_ALLOWED')
            if (ctx.deleteMode) {
              f.radials.splice(i, 1)
              return
            }
            const c = parseCourse(ctx.scratchpad)
            if (c === undefined) return entryError('FORMAT_ERROR')
            f.radials[i] = c
          },
      ),
      undefined,
      goTo('F_PLN'),
    ],
    rightLskHandlers: [],
  }
}

export function abOffsetPage(): FmsPageDefinition {
  return {
    id: 'AB_OFFSET',
    title: 'OFFSET',
    render: (state) => {
      const o = state.navigation.offsetNm
      return {
        title: { center: [span('LAT REV OFFSET')] },
        rows: [
          row(label('OFFSET'), { left: [span(o ? `${o < 0 ? 'L' : 'R'}${Math.abs(o)}` : '[ ]', 'cyan')] }, { L: { fieldId: 'AB_OFFSET', explainKey: 'offset' } }),
          row(),
          row(),
          row(),
          row(),
          row({}, { left: [span('<RETURN')] }),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (ctx.deleteMode) {
          draft.navigation.offsetNm = undefined
          return
        }
        const m = /^([LR])(\d{1,2})$|^(\d{1,2})([LR])$/.exec(ctx.scratchpad)
        if (!m) return entryError('FORMAT_ERROR')
        const side = m[1] ?? m[4]
        const nm = Number(m[2] ?? m[3])
        if (nm < 1 || nm > 50) return entryError('ENTRY_OUT_OF_RANGE')
        draft.navigation.offsetNm = side === 'L' ? -nm : nm
        ctx.fieldChanged('OFFSET', ctx.scratchpad)
      },
      undefined,
      undefined,
      undefined,
      undefined,
      goTo('F_PLN'),
    ],
    rightLskHandlers: [],
  }
}
