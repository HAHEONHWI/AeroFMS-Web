import {
  calculatePerformance,
  displayedPlan,
  entryError,
  grossWeightKg,
  maxAltitudeFt,
  opSetCostIndex,
  opSetCruiseAltitude,
  opSetDepartureRunway,
  opSetFuel,
  opSetReserves,
  opSetZfw,
  optimumAltitudeFt,
  parseDecimal,
  parseInteger,
  parseTemperatureC,
  parseWeightKg,
  parseWind,
  row,
  small,
  span,
  splitSlash,
  takeoffSpeeds,
  vref,
} from '@aerofms/core'
import type { FmsPageDefinition, FmsState, HandlerContext, LskHandler } from '@aerofms/core'
import type { Draft } from 'immer'
import { boxes, dashes, fmtFl, fmtTemp, fmtWeight } from '../../common/format'
import { goTo, separatorLabel } from '../helpers'
import type { BoeingVariant } from '../variant'

const del = (ctx: HandlerContext, fn: () => void): boolean => {
  if (!ctx.deleteMode) return false
  fn()
  return true
}

export function perfInitPage(v: BoeingVariant): FmsPageDefinition {
  const is737 = v.cdu === '737'
  return {
    id: 'PERF_INIT',
    title: 'PERF INIT',
    render: (state, ctx) => {
      const p = state.performance
      const gw = grossWeightKg(p)
      const crz = p.cruiseAltitudeFt
      const res = calculatePerformance(ctx.perf, p)
      return {
        title: { center: [span('PERF INIT')] },
        rows: [
          row(
            { left: [small(is737 ? 'GW/CRZ CG' : 'GR WT')], right: [small(is737 ? 'TRIP/CRZ ALT' : 'CRZ ALT')] },
            {
              left: [span(gw !== undefined ? (is737 ? `${fmtWeight(gw)}/ ${(p.zfwCgPercent ?? 25).toFixed(1)}%` : fmtWeight(gw)) : is737 ? '---.-/ --.-%' : boxes(5))],
              right: [span(crz !== undefined ? fmtFl(crz) : boxes(5), res.warnings.includes('CRZ_ABOVE_MAX') ? 'amber' : 'white')],
            },
            { L: { fieldId: 'PERF.GW', explainKey: 'grossWeight' }, R: { fieldId: 'PERF.CRZ_ALT', explainKey: 'cruiseAltitude' } },
          ),
          row(
            { left: [small(is737 ? 'PLAN/FUEL' : 'FUEL')], right: [small('CRZ WIND')] },
            {
              left: [span(p.fuelKg !== undefined ? (is737 ? `--.-/ ${fmtWeight(p.fuelKg)}` : fmtWeight(p.fuelKg)) : is737 ? `--.-/ ${boxes(4)}` : boxes(4))],
              right: [span(p.cruiseWindKt !== undefined ? `${String(p.cruiseWindDir ?? 0).padStart(3, '0')}°/${p.cruiseWindKt}` : '---°/---')],
            },
            { L: { fieldId: 'PERF.FUEL', explainKey: 'fuel' }, R: { fieldId: 'PERF.CRZ_WIND', explainKey: 'cruiseWind' } },
          ),
          row(
            { left: [small('ZFW')], right: [small(is737 ? 'ISA DEV' : 'ISA DEV')] },
            { left: [span(p.zfwKg !== undefined ? fmtWeight(p.zfwKg) : boxes(5))], right: [span(fmtTemp(p.isaDevC ?? 0))] },
            { L: { fieldId: 'PERF.ZFW', explainKey: 'zfw' }, R: { fieldId: 'PERF.ISA_DEV', explainKey: 'isaDev' } },
          ),
          row(
            { left: [small('RESERVES')], right: [small('TRANS ALT')] },
            {
              left: [span(p.reserveFuelKg !== undefined ? fmtWeight(p.reserveFuelKg) : boxes(4))],
              right: [span(String(p.transitionAltitudeFt ?? 18000))],
            },
            { L: { fieldId: 'PERF.RESERVES', explainKey: 'reserves' }, R: { fieldId: 'PERF.TRANS_ALT', explainKey: 'transitionAltitude' } },
          ),
          row(
            { left: [small('COST INDEX')], right: [small(is737 ? 'OPT/MAX' : 'STEP SIZE')] },
            {
              left: [span(p.costIndex !== undefined ? String(p.costIndex) : boxes(3))],
              right: [
                span(
                  is737
                    ? gw !== undefined
                      ? `${fmtFl(optimumAltitudeFt(ctx.perf, gw))}/${fmtFl(maxAltitudeFt(ctx.perf, gw))}`
                      : '-----/-----'
                    : p.cruise.stepSizeFt > 0
                      ? String(p.cruise.stepSizeFt)
                      : 'ICAO',
                ),
              ],
            },
            { L: { fieldId: 'PERF.COST_INDEX', explainKey: 'costIndex' }, R: { fieldId: is737 ? 'PERF.OPT_MAX' : 'PERF.STEP_SIZE', explainKey: is737 ? 'optimumAltitude' : 'stepClimb' } },
          ),
          row(separatorLabel(), {
            left: [span('<INDEX')],
            right: [span(is737 ? 'N1 LIMIT>' : 'THRUST LIM>')],
          }),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (del(ctx, () => (draft.performance.zfwKg = undefined))) return
        const [gwRaw, cgRaw] = splitSlash(ctx.scratchpad)
        if (cgRaw !== undefined) {
          const cg = parseDecimal(cgRaw.replace('%', ''), 5, 40)
          if (cg === undefined) return entryError('INVALID_ENTRY')
          draft.performance.zfwCgPercent = cg
        }
        if (gwRaw !== undefined) {
          const gw = parseWeightKg(gwRaw, ctx.perf.oewKg, ctx.perf.mtowKg * 1.05)
          if (gw === undefined) return entryError('INVALID_ENTRY')
          if (draft.performance.fuelKg === undefined) return entryError('INVALID_ENTRY')
          const zfw = gw - draft.performance.fuelKg
          if (zfw < ctx.perf.oewKg) return entryError('INVALID_ENTRY')
          draft.performance.zfwKg = zfw
          ctx.fieldChanged('GW', gw)
        }
      },
      (draft, ctx) => {
        if (del(ctx, () => (draft.performance.fuelKg = undefined))) return
        const [, fuel] = splitSlash(ctx.scratchpad)
        opSetFuel(draft, ctx, fuel ?? ctx.scratchpad)
      },
      (draft, ctx) => {
        if (del(ctx, () => (draft.performance.zfwKg = undefined))) return
        opSetZfw(draft, ctx, ctx.scratchpad)
      },
      (draft, ctx) => {
        if (del(ctx, () => (draft.performance.reserveFuelKg = undefined))) return
        opSetReserves(draft, ctx, ctx.scratchpad)
      },
      (draft, ctx) => {
        if (del(ctx, () => (draft.performance.costIndex = undefined))) return
        opSetCostIndex(draft, ctx, ctx.scratchpad)
      },
      goTo('INIT_REF_INDEX'),
    ],
    rightLskHandlers: [
      (draft, ctx) => {
        if (del(ctx, () => (draft.performance.cruiseAltitudeFt = undefined))) return
        const [, alt] = splitSlash(ctx.scratchpad)
        opSetCruiseAltitude(draft, ctx, alt ?? ctx.scratchpad)
      },
      (draft, ctx) => {
        if (
          del(ctx, () => {
            draft.performance.cruiseWindKt = undefined
            draft.performance.cruiseWindDir = undefined
          })
        )
          return
        const w = parseWind(ctx.scratchpad)
        if (!w) return entryError('INVALID_ENTRY')
        draft.performance.cruiseWindDir = w.dir
        draft.performance.cruiseWindKt = w.kt
        ctx.fieldChanged('CRZ_WIND', ctx.scratchpad)
      },
      (draft, ctx) => {
        if (del(ctx, () => (draft.performance.isaDevC = undefined))) return
        const t = parseTemperatureC(ctx.scratchpad, -40, 40)
        if (t === undefined) return entryError('INVALID_ENTRY')
        draft.performance.isaDevC = t
        ctx.fieldChanged('ISA_DEV', t)
      },
      (draft, ctx) => {
        if (ctx.deleteMode) return entryError('INVALID_DELETE')
        const ta = parseInteger(ctx.scratchpad, 1000, 18000)
        if (ta === undefined) return entryError('INVALID_ENTRY')
        draft.performance.transitionAltitudeFt = ta
        ctx.fieldChanged('TRANS_ALT', ta)
      },
      is737
        ? undefined
        : (draft, ctx) => {
            if (del(ctx, () => (draft.performance.cruise.stepSizeFt = 0))) return
            if (ctx.scratchpad === 'ICAO') {
              draft.performance.cruise.stepSizeFt = 0
              return
            }
            const step = parseInteger(ctx.scratchpad, 0, 9000)
            if (step === undefined || step % 1000 !== 0) return entryError('INVALID_ENTRY')
            draft.performance.cruise.stepSizeFt = step
            ctx.fieldChanged('STEP_SIZE', step)
          },
      goTo(is737 ? 'N1_LIMIT' : 'THRUST_LIM'),
    ],
  }
}

/** 737 N1 LIMIT / 777-787 THRUST LIM: take-off rating, assumed temperature, climb rating. */
export function thrustLimitPage(v: BoeingVariant): FmsPageDefinition {
  const id = v.cdu === '737' ? 'N1_LIMIT' : 'THRUST_LIM'
  const title = v.cdu === '737' ? 'N1 LIMIT' : 'THRUST LIM'
  const ratings = v.performanceModel.takeoff.thrustRatings
  const selectRating =
    (i: number): LskHandler =>
    (draft, ctx) => {
      const r = ratings[i]
      if (!r) return entryError('INVALID_ENTRY')
      if (ctx.scratchpad) return entryError('INVALID_ENTRY')
      draft.performance.takeoff.thrustRating = r
      ctx.fieldChanged('TO_RATING', r)
    }
  const selectClimb =
    (i: number): LskHandler =>
    (draft, ctx) => {
      const r = v.climbRatings[i]
      if (!r || ctx.scratchpad) return entryError('INVALID_ENTRY')
      draft.currentPage.context.climbRating = r
      ctx.fieldChanged('CLB_RATING', r)
    }
  return {
    id,
    title,
    render: (state, ctx) => {
      const t = state.performance.takeoff
      const sel = t.thrustRating ?? ratings[0]
      const res = calculatePerformance(ctx.perf, { ...state.performance, takeoff: { ...t, thrustRating: sel } })
      const clb = (state.currentPage.context.climbRating as string | undefined) ?? v.climbRatings[0]
      return {
        title: { center: [span(title)] },
        rows: [
          row(
            { left: [small(v.cdu === '737' ? 'SEL/OAT' : 'SEL  OAT')], right: [small(`${sel} N1`)] },
            {
              left: [span(`${t.assumedTempC !== undefined ? `${t.assumedTempC}` : '--'}/${fmtTemp(t.oatC ?? 15)}`)],
              right: [span(res.n1 !== undefined ? `${res.n1.toFixed(1)}/${res.n1.toFixed(1)}` : '', 'green')],
            },
            { L: { fieldId: 'THRUST.ASSUMED_TEMP', explainKey: 'assumedTemperature' } },
          ),
          ...[0, 1, 2].map((i) =>
            row(
              {},
              {
                left: ratings[i] ? [span(`<${ratings[i]}`), span(ratings[i] === sel ? ' <SEL>' : '', 'green', 'S')] : [],
                right: v.climbRatings[i] ? [span(v.climbRatings[i] === clb ? '<SEL> ' : '', 'green', 'S'), span(`${v.climbRatings[i]}>`)] : [],
              },
              { L: { fieldId: 'THRUST.TO_RATING', explainKey: 'thrustRating' } },
            ),
          ),
          row({ left: [small('CLB N1')] }, { left: [span(`${ctx.perf.climbN1.toFixed(1)}/${ctx.perf.climbN1.toFixed(1)}`, 'green')] }),
          row(separatorLabel(), { left: [span('<INDEX')], right: [span('TAKEOFF>')] }),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        const t = draft.performance.takeoff
        if (ctx.deleteMode) {
          t.assumedTempC = undefined
          return
        }
        const [sel, oat] = splitSlash(ctx.scratchpad)
        if (oat !== undefined) {
          const o = parseTemperatureC(oat, -60, 55)
          if (o === undefined) return entryError('INVALID_ENTRY')
          t.oatC = o
        }
        if (sel !== undefined) {
          const a = parseTemperatureC(sel, 0, ctx.perf.takeoff.maxAssumedTempC)
          if (a === undefined || a <= (t.oatC ?? 15)) return entryError('INVALID_ENTRY')
          t.assumedTempC = a
        }
        ctx.fieldChanged('ASSUMED_TEMP', ctx.scratchpad)
      },
      selectRating(0),
      selectRating(1),
      selectRating(2),
      undefined,
      goTo('INIT_REF_INDEX'),
    ],
    rightLskHandlers: [undefined, selectClimb(0), selectClimb(1), selectClimb(2), undefined, goTo('TAKEOFF_REF')],
  }
}

function setVSpeed(draft: Draft<FmsState>, ctx: HandlerContext, key: 'v1' | 'vr' | 'v2'): void {
  const t = draft.performance.takeoff
  if (ctx.deleteMode) {
    t[key] = undefined
    return
  }
  if (!ctx.scratchpad) {
    // Line select with empty scratchpad accepts the computed (QRH) speed.
    const gw = grossWeightKg(draft.performance)
    if (gw === undefined || t.flaps === undefined) return entryError('INVALID_ENTRY')
    const s = takeoffSpeeds(ctx.perf, gw, t.flaps)
    if (!s) return entryError('INVALID_ENTRY')
    t[key] = s[key]
    ctx.fieldChanged(key.toUpperCase(), s[key])
    return
  }
  const kt = parseInteger(ctx.scratchpad, 80, 200)
  if (kt === undefined) return entryError('INVALID_ENTRY')
  t[key] = kt
  ctx.fieldChanged(key.toUpperCase(), kt)
}

export function takeoffRefPage(v: BoeingVariant): FmsPageDefinition {
  const flapsList = v.performanceModel.takeoff.flaps
  return {
    id: 'TAKEOFF_REF',
    title: 'TAKEOFF REF',
    pageCount: () => 2,
    render: (state, ctx) => {
      const t = state.performance.takeoff
      const gw = grossWeightKg(state.performance)
      const qrh = gw !== undefined && t.flaps !== undefined ? takeoffSpeeds(ctx.perf, gw, t.flaps) : undefined
      const plan = displayedPlan(state)
      const vs = (k: 'v1' | 'vr' | 'v2'): Array<ReturnType<typeof span>> =>
        t[k] !== undefined ? [span(`${t[k]}KT`)] : qrh ? [span(`${qrh[k]}`, 'white', 'S'), span('>', 'white', 'S')] : [span(boxes(3))]
      if (ctx.subPage === 2) {
        return {
          title: { center: [span('TAKEOFF REF')] },
          rows: [
            row({ left: [small('RW WIND')], right: [small('ACCEL HT')] }, {
              left: [span(t.runwayWindKt !== undefined ? `${t.runwayWindKt}KT` : '---KT')],
              right: [span(`${t.accelerationAltFt ?? 1000}AGL`)],
            }, { L: { fieldId: 'TO.RW_WIND' }, R: { fieldId: 'TO.ACCEL_HT', explainKey: 'accelerationHeight' } }),
            row({ left: [small('RW COND')], right: [small('THR REDUCTION')] }, {
              left: [span(t.runwayCondition === 'WET' ? 'DRY/' : '', 'white', 'S'), span(t.runwayCondition ?? 'DRY'), span(t.runwayCondition !== 'WET' ? '/WET' : '', 'white', 'S')],
              right: [span(`${t.thrustReductionAltFt ?? 1500}AGL`)],
            }, { L: { fieldId: 'TO.RW_COND' }, R: { fieldId: 'TO.THR_RED', explainKey: 'thrustReduction' } }),
            row({ right: [small('E/O ACCEL HT')] }, { right: [span(`${t.engineOutAccelAltFt ?? 1000}AGL`)] }, { R: { fieldId: 'TO.EO_ACCEL' } }),
            row(),
            row(),
            row(separatorLabel(), { left: [span('<INDEX')], right: [span(v.cdu === '737' ? 'N1 LIMIT>' : 'THRUST LIM>')] }),
          ],
        }
      }
      return {
        title: { center: [span('TAKEOFF REF')] },
        rows: [
          row({ left: [small('FLAPS')], right: [small('V1')] }, { left: [span(t.flaps !== undefined ? `${t.flaps}°` : boxes(2) + '°')], right: vs('v1') }, { L: { fieldId: 'TO.FLAPS', explainKey: 'takeoffFlaps' }, R: { fieldId: 'TO.V1', explainKey: 'v1' } }),
          row({ left: [small('CG')], right: [small('VR')] }, { left: [span(t.cgPercent !== undefined ? `${t.cgPercent.toFixed(1)}%` : '--.-%')], center: [span(t.cgPercent !== undefined ? `${(5 - (t.cgPercent - 20) * 0.15).toFixed(2)}`.padStart(5, ' ') : '', 'white', 'S')], right: vs('vr') }, { L: { fieldId: 'TO.CG', explainKey: 'cg' }, R: { fieldId: 'TO.VR', explainKey: 'vr' } }),
          row({ left: [small('RUNWAY')], right: [small('V2')] }, { left: [span(plan.departureRunway ? `RW${plan.departureRunway}` : dashes(5))], right: vs('v2') }, { L: { fieldId: 'TO.RUNWAY', explainKey: 'departureRunway' }, R: { fieldId: 'TO.V2', explainKey: 'v2' } }),
          row({ left: [small('TO RATING')], right: [small('TO N1')] }, { left: [span(t.thrustRating ?? ctx.perf.takeoff.thrustRatings[0] ?? '')], right: [span(calculatePerformance(ctx.perf, state.performance).n1?.toFixed(1) ?? '', 'green')] }),
          row({ left: [small('GW/TOW')] }, { left: [span(gw !== undefined ? `${fmtWeight(gw)}/${fmtWeight(gw - ctx.perf.fuelFlow.taxiKgPerMin * 10)}` : '---.-/---.-')] }),
          row(separatorLabel(), { left: [span('<INDEX')], right: [span(v.cdu === '737' ? 'N1 LIMIT>' : 'THRUST LIM>')] }),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (ctx.subPage === 2) {
          if (ctx.deleteMode) {
            draft.performance.takeoff.runwayWindKt = undefined
            return
          }
          const w = parseInteger(ctx.scratchpad.replace(/^H/, '').replace(/^T/, '-'), -30, 60)
          if (w === undefined) return entryError('INVALID_ENTRY')
          draft.performance.takeoff.runwayWindKt = w
          return
        }
        if (ctx.deleteMode) {
          draft.performance.takeoff.flaps = undefined
          return
        }
        const f = parseInteger(ctx.scratchpad, 0, 30)
        if (f === undefined || !flapsList.includes(f)) return entryError('INVALID_ENTRY')
        const t = draft.performance.takeoff
        if (t.flaps !== undefined && t.flaps !== f && (t.v1 || t.vr || t.v2)) {
          t.v1 = t.vr = t.v2 = undefined
        }
        t.flaps = f
        ctx.fieldChanged('TO_FLAPS', f)
      },
      (draft, ctx) => {
        if (ctx.subPage === 2) {
          const t = draft.performance.takeoff
          t.runwayCondition = t.runwayCondition === 'WET' ? 'DRY' : 'WET'
          return
        }
        if (ctx.deleteMode) {
          draft.performance.takeoff.cgPercent = undefined
          return
        }
        const cg = parseDecimal(ctx.scratchpad.replace('%', ''), 5, 40)
        if (cg === undefined) return entryError('INVALID_ENTRY')
        draft.performance.takeoff.cgPercent = cg
        ctx.fieldChanged('TO_CG', cg)
      },
      (_draft, ctx) => {
        if (ctx.subPage === 2) return
        if (ctx.deleteMode) return entryError('INVALID_DELETE')
        opSetDepartureRunway(ctx, ctx.scratchpad)
      },
      undefined,
      undefined,
      goTo('INIT_REF_INDEX'),
    ],
    rightLskHandlers: [
      (draft, ctx) => {
        if (ctx.subPage === 2) {
          const h = parseInteger(ctx.scratchpad, 400, 5000)
          if (h === undefined) return entryError('INVALID_ENTRY')
          draft.performance.takeoff.accelerationAltFt = h
          return
        }
        setVSpeed(draft, ctx, 'v1')
      },
      (draft, ctx) => {
        if (ctx.subPage === 2) {
          const h = parseInteger(ctx.scratchpad, 400, 5000)
          if (h === undefined) return entryError('INVALID_ENTRY')
          draft.performance.takeoff.thrustReductionAltFt = h
          return
        }
        setVSpeed(draft, ctx, 'vr')
      },
      (draft, ctx) => {
        if (ctx.subPage === 2) {
          const h = parseInteger(ctx.scratchpad, 400, 5000)
          if (h === undefined) return entryError('INVALID_ENTRY')
          draft.performance.takeoff.engineOutAccelAltFt = h
          return
        }
        setVSpeed(draft, ctx, 'v2')
      },
      undefined,
      undefined,
      goTo(v.cdu === '737' ? 'N1_LIMIT' : 'THRUST_LIM'),
    ],
  }
}

export function approachRefPage(v: BoeingVariant): FmsPageDefinition {
  const flaps = v.performanceModel.landing.flaps
  const landingWeight = (state: FmsState): number | undefined => {
    const gw = grossWeightKg(state.performance)
    if (gw === undefined) return undefined
    // Estimate landing weight from current gross weight minus remaining trip fuel (simulation fuel).
    const burned = state.simulation.fuelUsedKg
    return Math.max(v.performanceModel.oewKg, gw - burned - (state.simulation.status === 'IDLE' ? (state.performance.fuelKg ?? 0) * 0.6 : 0))
  }
  const pick =
    (i: number): LskHandler =>
    (draft, ctx) => {
      const f = flaps[i]
      const lw = landingWeight(draft as FmsState)
      if (f === undefined || lw === undefined || ctx.scratchpad) return entryError('INVALID_ENTRY')
      const s = vref(ctx.perf, lw, f)
      draft.scratchpad.text = `${f}/${s}`
    }
  return {
    id: 'APPROACH_REF',
    title: 'APPROACH REF',
    render: (state, ctx) => {
      const lw = landingWeight(state)
      const plan = displayedPlan(state)
      const ap = plan.destination ? ctx.nav.searchAirport(plan.destination) : undefined
      const rw = ap && plan.arrivalRunway ? ap.runways.find((r) => r.ident === plan.arrivalRunway) : undefined
      const a = state.performance.approach
      return {
        title: { center: [span('APPROACH REF')] },
        rows: [
          row({ left: [small('GROSS WT')], right: [small(`FLAPS    VREF`)] }, { left: [span(lw !== undefined ? fmtWeight(lw) : boxes(5))], right: flaps[0] !== undefined && lw !== undefined ? [span(`${flaps[0]}°    ${vref(ctx.perf, lw, flaps[0])}KT`)] : [] }, { L: { fieldId: 'APPR.GW', explainKey: 'landingWeight' }, R: { fieldId: 'APPR.VREF', explainKey: 'vref' } }),
          row({}, { right: flaps[1] !== undefined && lw !== undefined ? [span(`${flaps[1]}°    ${vref(ctx.perf, lw, flaps[1])}KT`)] : [] }),
          row({ left: [small(ap ? `${ap.icao}${rw ? ` RW${rw.ident}` : ''}` : '')] }, { left: [span(rw ? `${rw.lengthFt}FT ${Math.round(rw.lengthFt * 0.3048)}M` : '')], right: flaps[2] !== undefined && lw !== undefined ? [span(`${flaps[2]}°    ${vref(ctx.perf, lw, flaps[2])}KT`)] : [] }),
          row({ left: [small(rw?.ilsFrequency ? 'ILS FREQ/CRS' : '')], right: [small('FLAP/SPD')] }, { left: [span(rw?.ilsFrequency ? `${rw.ilsFrequency.toFixed(2)}/${String(rw.ilsCourse ?? rw.headingMag).padStart(3, '0')}°` : '')], right: [span(a.flaps !== undefined && a.vref !== undefined ? `${a.flaps}/${a.vref}` : `${boxes(2)}/${boxes(3)}`)] }, { R: { fieldId: 'APPR.FLAP_SPD', explainKey: 'vref' } }),
          row({ right: [small('WIND CORR')] }, { right: [span(`+${a.windKt !== undefined ? Math.min(20, Math.max(5, Math.round(a.windKt / 2))) : 5}`)] }),
          row(separatorLabel(), { left: [span('<INDEX')], right: [span(v.cdu === '737' ? 'N1 LIMIT>' : 'THRUST LIM>')] }),
        ],
      }
    },
    leftLskHandlers: [undefined, undefined, undefined, undefined, undefined, goTo('INIT_REF_INDEX')],
    rightLskHandlers: [
      pick(0),
      pick(1),
      pick(2),
      (draft, ctx) => {
        const a = draft.performance.approach
        if (ctx.deleteMode) {
          a.flaps = undefined
          a.vref = undefined
          return
        }
        const [f, s] = splitSlash(ctx.scratchpad)
        const fl = f !== undefined ? parseInteger(f, 0, 40) : a.flaps
        const sp = s !== undefined ? parseInteger(s, 100, 200) : undefined
        if (fl === undefined || !flaps.includes(fl)) return entryError('INVALID_ENTRY')
        a.flaps = fl
        const lw = landingWeight(draft as FmsState)
        a.vref = sp ?? (lw !== undefined ? vref(ctx.perf, lw, fl) : undefined)
        if (a.vref === undefined) return entryError('INVALID_ENTRY')
        ctx.fieldChanged('VREF', `${a.flaps}/${a.vref}`)
      },
      undefined,
      goTo(v.cdu === '737' ? 'N1_LIMIT' : 'THRUST_LIM'),
    ],
  }
}
