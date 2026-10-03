import {
  computeVnavProfile,
  displayedPlan,
  econSpeeds,
  entryError,
  grossWeightKg,
  opSetCostIndex,
  parseAltitude,
  parseInteger,
  parseQnhHpa,
  parseSpeed,
  parseTemperatureC,
  parseWind,
  row,
  small,
  span,
  splitSlash,
  takeoffSpeeds,
  vref,
} from '@aerofms/core'
import type { FmsPageContent, FmsPageDefinition, FmsState, HandlerContext, LskHandler, RenderContext } from '@aerofms/core'
import { fmtFl, fmtHhmm, fmtMach } from '../../common/format'
import { abTitle, label } from '../helpers'
import type { AirbusVariant } from '../variant'

export const PERF_PHASES = ['TAKE OFF', 'CLB', 'CRZ', 'DES', 'APPR', 'GO AROUND'] as const

/** Index (1-based sub page) of the PERF phase matching the flight phase. */
export function perfSubPageFor(state: FmsState): number {
  switch (state.flightPhase) {
    case 'CLIMB':
      return 2
    case 'CRUISE':
      return 3
    case 'DESCENT':
      return 4
    case 'APPROACH':
    case 'LANDED':
      return 5
    case 'GO_AROUND':
      return 6
    default:
      return 1
  }
}

/** Characteristic speeds (training approximation): green dot O ≈ 2·W(t)+85, S ≈ 0.82·O, F ≈ 0.69·O. */
function charSpeeds(state: FmsState): { f: number; s: number; o: number } | undefined {
  const gw = grossWeightKg(state.performance)
  if (gw === undefined) return undefined
  const t = gw / 1000
  const scale = gw > 120000 ? 0.62 : 1
  const o = Math.round(2 * t * scale + 85 + (gw > 120000 ? 60 : 0))
  return { o, s: Math.round(o * 0.82), f: Math.round(o * 0.69) }
}

const phaseTitle = (state: FmsState, idx: number, mfd: boolean): FmsPageContent['title'] => {
  const name = PERF_PHASES[idx - 1] ?? ''
  const active = perfSubPageFor(state) === idx && state.flightPhase !== 'PREFLIGHT'
  return abTitle(state, name, { mfd, mfdName: `PERF ${name}`, color: active ? 'green' : 'white' })
}

const navRow = (idx: number) =>
  row(
    { left: [small(idx > 1 ? ' PREV' : '')], right: [small(idx < 6 ? 'NEXT ' : '')] },
    { left: [span(idx > 1 ? '<PHASE' : '')], right: [span(idx < 6 ? 'PHASE>' : '')] },
  )

function takeoffContent(state: FmsState, ctx: RenderContext, mfd: boolean): FmsPageContent {
  const t = state.performance.takeoff
  const plan = displayedPlan(state)
  const cs = charSpeeds(state)
  const gw = grossWeightKg(state.performance)
  const conf = t.flaps
  const sug = gw !== undefined && conf !== undefined ? takeoffSpeeds(ctx.perf, gw, conf) : undefined
  const v = (k: 'v1' | 'vr' | 'v2') => (t[k] !== undefined ? span(String(t[k]), 'cyan') : sug ? span(String(sug[k]), 'cyan', 'S') : span('[ ]', 'amber'))
  return {
    title: phaseTitle(state, 1, mfd),
    rows: [
      row(label('V1', 'RWY', 'FLP RETR'), { left: [v('v1')], center: [span(cs ? `F=${cs.f}` : 'F=---', 'green')], right: [span(plan.departureRunway ?? '---', 'green')] }, { L: { fieldId: 'AB_TO.V1', explainKey: 'v1' } }),
      row(label('VR', 'TO SHIFT', 'SLT RETR'), { left: [v('vr')], center: [span(cs ? `S=${cs.s}` : 'S=---', 'green')], right: [span('[M]', 'cyan')] }, { L: { fieldId: 'AB_TO.VR', explainKey: 'vr' } }),
      row(label('V2', 'FLAPS/THS', 'CLEAN'), { left: [v('v2')], center: [span(cs ? `O=${cs.o}` : 'O=---', 'green')], right: [span(conf !== undefined ? `${conf}/UP1.0` : '[ ]/[   ]', conf !== undefined ? 'cyan' : 'amber')] }, { L: { fieldId: 'AB_TO.V2', explainKey: 'v2' }, R: { fieldId: 'AB_TO.FLAPS', explainKey: 'takeoffFlaps' } }),
      row(label('TRANS ALT', 'FLEX TO TEMP'), { left: [span(String(state.performance.transitionAltitudeFt ?? 14000), 'cyan')], right: [span(t.assumedTempC !== undefined ? `${t.assumedTempC}°` : '[ ]°', 'cyan')] }, { R: { fieldId: 'AB_TO.FLEX', explainKey: 'assumedTemperature' } }),
      row(label('THR RED/ACC', 'ENG OUT ACC'), { left: [span(`${t.thrustReductionAltFt ?? 1500}/${t.accelerationAltFt ?? 1500}`, 'cyan')], right: [span(String(t.engineOutAccelAltFt ?? 1500), 'cyan')] }, { L: { fieldId: 'AB_TO.THR_RED', explainKey: 'thrustReduction' } }),
      navRow(1),
    ],
  }
}

function speedPhase(state: FmsState, ctx: RenderContext, idx: 2 | 3 | 4, mfd: boolean): FmsPageContent {
  const p = state.performance
  const econ = econSpeeds(ctx.perf, p.costIndex)
  const prof = computeVnavProfile(displayedPlan(state), p, ctx.perf, ctx.nav)
  const mode = idx === 2 ? p.climb : idx === 3 ? p.cruise : p.descent
  const managed =
    idx === 2 ? `${econ.climbKt}/${fmtMach(econ.climbMach)}` : idx === 3 ? fmtMach(econ.cruiseMach) : `${fmtMach(econ.descentMach)}/${econ.descentKt}`
  const selected = mode.mode === 'MANUAL' ? (mode.mach !== undefined && idx === 3 ? fmtMach(mode.mach) : String(mode.speedKt ?? '')) : undefined
  const base = state.simulation.status === 'IDLE' ? state.simulation.simTimeMs : state.simulation.simTimeMs - state.simulation.elapsedSec * 1000
  const pt = idx === 2 ? prof.topOfClimb : idx === 3 ? prof.topOfDescent : undefined
  const etaAt = (dist: number | undefined): string => {
    if (dist === undefined) return '----'
    const legs = prof.legs
    if (!legs.length || prof.totalDistanceNm <= 0) return '----'
    return fmtHhmm(base + (dist / prof.totalDistanceNm) * prof.tripTimeMin * 60000)
  }
  const rightLabel = idx === 2 ? 'UTC  DIST (TO CRZ)' : idx === 3 ? 'UTC  DIST (TO T/D)' : 'UTC  DIST (TO DEST)'
  const rightVal = idx === 4 ? `${fmtHhmm(base + prof.tripTimeMin * 60000)} ${Math.round(prof.totalDistanceNm)}` : `${etaAt(pt?.distanceNm)} ${pt ? Math.round(pt.distanceNm) : '---'}`
  return {
    title: phaseTitle(state, idx, mfd),
    rows: [
      row(label('ACT MODE', idx === 3 ? 'CRZ FL' : ''), { left: [span(mode.mode === 'MANUAL' ? 'SELECTED' : 'MANAGED', 'green')], right: [span(idx === 3 && p.cruiseAltitudeFt ? fmtFl(p.cruiseAltitudeFt) : '', 'cyan')] }),
      row(label('CI', rightLabel), { left: [span(p.costIndex !== undefined ? String(p.costIndex) : '[ ]', p.costIndex !== undefined ? 'cyan' : 'amber')], right: [span(rightVal, 'green', 'S')] }, { L: { fieldId: 'AB_PERF.CI', explainKey: 'costIndex' } }),
      row(label('MANAGED'), { left: [span(`*${managed}`, mode.mode === 'MANUAL' ? 'cyan' : 'green')] }, { L: { fieldId: 'AB_PERF.MANAGED', explainKey: 'managedSpeed' } }),
      row(label('PRESEL'), { left: [span(selected ?? '[ ]', 'cyan')] }, { L: { fieldId: 'AB_PERF.PRESEL', explainKey: 'targetSpeed' } }),
      row(label(idx === 2 ? 'SPD LIM' : idx === 4 ? 'SPD LIM' : 'STEP ALT'), {
        left: [
          span(
            idx === 3
              ? p.cruise.stepToFt
                ? fmtFl(p.cruise.stepToFt)
                : prof.stepClimb
                  ? fmtFl(prof.stepClimb.toAltitudeFt)
                  : 'NONE'
              : `${(idx === 2 ? p.climb : p.descent).speedRestrictionKt ?? 250}/${fmtFl((idx === 2 ? p.climb : p.descent).speedRestrictionAltFt ?? 10000)}`,
            'magenta',
          ),
        ],
      }),
      navRow(idx),
    ],
  }
}

function approachContent(state: FmsState, ctx: RenderContext, mfd: boolean): FmsPageContent {
  const a = state.performance.approach
  const plan = displayedPlan(state)
  const cs = charSpeeds(state)
  const gw = grossWeightKg(state.performance)
  const lw = gw !== undefined ? gw - (state.simulation.status === 'IDLE' ? (state.performance.fuelKg ?? 0) * 0.6 : 0) : undefined
  const conf = a.flaps ?? 4
  const vls = lw !== undefined ? vref(ctx.perf, lw, conf) : undefined
  const vapp = a.vapp ?? (vls !== undefined ? vls + Math.max(5, Math.min(15, Math.round((a.windKt ?? 0) / 3))) : undefined)
  return {
    title: phaseTitle(state, 5, mfd),
    rows: [
      row(label('QNH', 'FINAL', 'FLP RETR'), { left: [span(a.qnhHpa ? String(a.qnhHpa) : '[  ]', a.qnhHpa ? 'cyan' : 'amber')], center: [span(cs ? `F=${cs.f}` : 'F=---', 'green')], right: [span(plan.approach?.name ?? '-----', 'green')] }, { L: { fieldId: 'AB_APPR.QNH', explainKey: 'qnh' } }),
      row(label('TEMP', 'MDA', 'SLT RETR'), { left: [span(a.tempC !== undefined ? `${a.tempC}°` : '[ ]°', 'cyan')], center: [span(cs ? `S=${cs.s}` : 'S=---', 'green')], right: [span(a.minimumType === 'BARO' && a.minimumFt ? String(a.minimumFt) : '[ ]', 'cyan')] }, { R: { fieldId: 'AB_APPR.MDA', explainKey: 'minimums' } }),
      row(label('MAG WIND', 'DH', 'CLEAN'), { left: [span(a.windKt !== undefined ? `${String(a.windDir ?? 0).padStart(3, '0')}°/${a.windKt}` : '[ ]°/[ ]', 'cyan')], center: [span(cs ? `O=${cs.o}` : 'O=---', 'green')], right: [span(a.minimumType === 'RADIO' && a.minimumFt ? String(a.minimumFt) : '[ ]', 'cyan')] }, { R: { fieldId: 'AB_APPR.DH', explainKey: 'minimums' } }),
      row(label('TRANS FL', 'LDG CONF', 'VLS'), { left: [span(a.transitionLevelFt ? fmtFl(a.transitionLevelFt) : 'FL150', 'cyan')], center: [span(vls !== undefined ? String(vls) : '---', 'green')], right: [span(conf === 3 ? 'CONF3*' : 'CONF3', conf === 3 ? 'green' : 'cyan')] }, { R: { fieldId: 'AB_APPR.CONF', explainKey: 'landingConfig' } }),
      row(label('VAPP'), { left: [span(vapp !== undefined ? String(vapp) : '[ ]', 'cyan', a.vapp ? 'L' : 'S')], right: [span(conf === 4 ? 'FULL*' : 'FULL', conf === 4 ? 'green' : 'cyan')] }, { L: { fieldId: 'AB_APPR.VAPP', explainKey: 'vapp' } }),
      navRow(5),
    ],
  }
}

function goAroundContent(state: FmsState, mfd: boolean): FmsPageContent {
  const t = state.performance.takeoff
  const cs = charSpeeds(state)
  return {
    title: phaseTitle(state, 6, mfd),
    rows: [
      row(label('', '', 'FLP RETR'), { center: [span(cs ? `F=${cs.f}` : 'F=---', 'green')] }),
      row(label('', '', 'SLT RETR'), { center: [span(cs ? `S=${cs.s}` : 'S=---', 'green')] }),
      row(label('', '', 'CLEAN'), { center: [span(cs ? `O=${cs.o}` : 'O=---', 'green')] }),
      row(),
      row(label('THR RED/ACC', 'ENG OUT ACC'), { left: [span(`${t.thrustReductionAltFt ?? 1500}/${t.accelerationAltFt ?? 1500}`, 'cyan')], right: [span(String(t.engineOutAccelAltFt ?? 1500), 'cyan')] }),
      navRow(6),
    ],
  }
}

function vSpeed(key: 'v1' | 'vr' | 'v2'): LskHandler {
  return (draft, ctx) => {
    const t = draft.performance.takeoff
    if (ctx.deleteMode) {
      t[key] = undefined
      return
    }
    if (!ctx.scratchpad) {
      const gw = grossWeightKg(draft.performance)
      if (gw === undefined || t.flaps === undefined) return entryError('NOT_ALLOWED')
      const s = takeoffSpeeds(ctx.perf, gw, t.flaps)
      if (!s) return entryError('NOT_ALLOWED')
      t[key] = s[key]
      return
    }
    const kt = parseInteger(ctx.scratchpad, 90, 200)
    if (kt === undefined) return entryError('ENTRY_OUT_OF_RANGE')
    t[key] = kt
    ctx.fieldChanged(`AB_${key.toUpperCase()}`, kt)
  }
}

function presel(phase: 2 | 3 | 4): LskHandler {
  return (draft, ctx) => {
    const target = phase === 2 ? draft.performance.climb : phase === 3 ? draft.performance.cruise : draft.performance.descent
    if (ctx.deleteMode) {
      target.mode = 'ECON'
      target.speedKt = undefined
      target.mach = undefined
      return
    }
    const s = parseSpeed(ctx.scratchpad)
    if (!s) return entryError('FORMAT_ERROR')
    if (s.kind === 'IAS') target.speedKt = s.kt
    else target.mach = s.mach
    target.mode = 'MANUAL'
    ctx.fieldChanged('PRESEL', ctx.scratchpad)
  }
}

export function perfPage(v: AirbusVariant): FmsPageDefinition {
  const mfd = v.display === 'AIRBUS_MFD'
  const per = (handlers: Record<number, LskHandler | undefined>): LskHandler => {
    const h: LskHandler = (draft, ctx: HandlerContext) => {
      const fn = handlers[ctx.subPage]
      if (!fn) return ctx.scratchpad || ctx.deleteMode ? entryError('NOT_ALLOWED') : undefined
      return fn(draft, ctx)
    }
    return h
  }
  const prev: LskHandler = (draft, ctx) => {
    if (ctx.subPage > 1) draft.currentPage.subPage = ctx.subPage - 1
  }
  prev.keepsScratchpad = true
  const next: LskHandler = (draft, ctx) => {
    if (ctx.subPage < 6) draft.currentPage.subPage = ctx.subPage + 1
  }
  next.keepsScratchpad = true
  const ci: LskHandler = (draft, ctx) => (ctx.deleteMode ? void (draft.performance.costIndex = undefined) : opSetCostIndex(draft, ctx, ctx.scratchpad))
  return {
    id: 'PERF',
    title: 'PERF',
    pageCount: () => 6,
    render: (state, ctx) => {
      switch (ctx.subPage) {
        case 1:
          return takeoffContent(state, ctx, mfd)
        case 2:
        case 3:
        case 4:
          return speedPhase(state, ctx, ctx.subPage, mfd)
        case 5:
          return approachContent(state, ctx, mfd)
        default:
          return goAroundContent(state, mfd)
      }
    },
    leftLskHandlers: [
      per({
        1: vSpeed('v1'),
        5: (d, c) => {
          const q = parseQnhHpa(c.scratchpad)
          if (q === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          d.performance.approach.qnhHpa = q
          c.fieldChanged('QNH', q)
        },
      }),
      per({
        1: vSpeed('vr'),
        2: ci,
        3: ci,
        4: ci,
        5: (d, c) => {
          const t = parseTemperatureC(c.scratchpad, -60, 55)
          if (t === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          d.performance.approach.tempC = t
        },
      }),
      per({
        1: vSpeed('v2'),
        5: (d, c) => {
          const w = parseWind(c.scratchpad)
          if (!w) return entryError('FORMAT_ERROR')
          d.performance.approach.windDir = w.dir
          d.performance.approach.windKt = w.kt
        },
      }),
      per({
        1: (d, c) => {
          const ta = parseInteger(c.scratchpad, 1000, 18000)
          if (ta === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          d.performance.transitionAltitudeFt = ta
        },
        2: presel(2),
        3: presel(3),
        4: presel(4),
        5: (d, c) => {
          const fl = parseAltitude(c.scratchpad, 20000)
          if (fl === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          d.performance.approach.transitionLevelFt = fl
        },
      }),
      per({
        1: (d, c) => {
          const [r, a] = splitSlash(c.scratchpad)
          const t = d.performance.takeoff
          if (r !== undefined) {
            const v1 = parseInteger(r, 400, 5000)
            if (v1 === undefined) return entryError('ENTRY_OUT_OF_RANGE')
            t.thrustReductionAltFt = v1
          }
          if (a !== undefined) {
            const v2 = parseInteger(a, 400, 5000)
            if (v2 === undefined) return entryError('ENTRY_OUT_OF_RANGE')
            t.accelerationAltFt = v2
          }
        },
        5: (d, c) => {
          if (c.deleteMode) {
            d.performance.approach.vapp = undefined
            return
          }
          const kt = parseInteger(c.scratchpad, 90, 200)
          if (kt === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          d.performance.approach.vapp = kt
        },
      }),
      prev,
    ],
    rightLskHandlers: [
      undefined,
      per({
        5: (d, c) => {
          if (c.deleteMode) {
            d.performance.approach.minimumFt = undefined
            return
          }
          const ft = parseInteger(c.scratchpad, 0, 15000)
          if (ft === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          d.performance.approach.minimumFt = ft
          d.performance.approach.minimumType = 'BARO'
        },
      }),
      per({
        1: (d, c) => {
          const [f] = splitSlash(c.scratchpad)
          const conf = f !== undefined ? parseInteger(f, 0, 3) : undefined
          if (conf === undefined || !c.perf.takeoff.flaps.includes(conf)) return entryError('ENTRY_OUT_OF_RANGE')
          d.performance.takeoff.flaps = conf
          c.fieldChanged('TO_CONF', conf)
        },
        5: (d, c) => {
          if (c.deleteMode) {
            d.performance.approach.minimumFt = undefined
            return
          }
          const ft = parseInteger(c.scratchpad, 0, 1000)
          if (ft === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          d.performance.approach.minimumFt = ft
          d.performance.approach.minimumType = 'RADIO'
        },
      }),
      per({
        1: (d, c) => {
          if (c.deleteMode) {
            d.performance.takeoff.assumedTempC = undefined
            return
          }
          const t = parseTemperatureC(c.scratchpad, 0, c.perf.takeoff.maxAssumedTempC)
          if (t === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          d.performance.takeoff.assumedTempC = t
          d.performance.takeoff.thrustRating = 'FLEX'
        },
        5: (d) => {
          d.performance.approach.flaps = 3
        },
      }),
      per({
        1: (d, c) => {
          const v1 = parseInteger(c.scratchpad, 400, 5000)
          if (v1 === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          d.performance.takeoff.engineOutAccelAltFt = v1
        },
        5: (d) => {
          d.performance.approach.flaps = 4
        },
      }),
      next,
    ],
  }
}
