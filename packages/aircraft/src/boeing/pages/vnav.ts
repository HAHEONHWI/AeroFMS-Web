import { isLeg } from '@aerofms/shared'
import {
  computeVnavProfile,
  displayedPerformance,
  displayedPlan,
  econSpeeds,
  entryError,
  grossWeightKg,
  maxAltitudeFt,
  optimumAltitudeFt,
  parseCruiseAltitude,
  parseInteger,
  parseSpeed,
  performanceForEdit,
  row,
  small,
  span,
  splitSlash,
} from '@aerofms/core'
import type { FmsPageContent, FmsPageDefinition, FmsState, HandlerContext, LskHandler, PerformanceState, RenderContext, VnavProfile } from '@aerofms/core'
import type { Draft } from 'immer'
import { dashes, fmtAlt, fmtBoeingAltConstraint, fmtFl, fmtMach, fmtWeight, fmtZulu } from '../../common/format'
import { eraseOr } from '../helpers'

type Phase = 'CLB' | 'CRZ' | 'DES'

function editPerf(draft: Draft<FmsState>, ctx: HandlerContext): Draft<PerformanceState> {
  return performanceForEdit(draft, ctx.adapter.planEditPolicy('PERFORMANCE', draft as FmsState))
}

function profileOf(state: FmsState, ctx: RenderContext): VnavProfile {
  return computeVnavProfile(displayedPlan(state), displayedPerformance(state), ctx.perf, ctx.nav)
}

/** Time (ms) and remaining distance to a profile point along the plan. */
function predictTo(state: FmsState, profile: VnavProfile, distanceNm: number | undefined): string {
  if (distanceNm === undefined || !profile.valid) return '----.-z/ ---NM'
  const flown = state.simulation.status === 'IDLE' ? 0 : Math.max(0, profile.totalDistanceNm - state.guidance.distanceToDestinationNm)
  const remaining = distanceNm - flown
  if (remaining < 0) return '----.-z/ ---NM'
  // ETA: interpolate leg ETAs by cumulative distance.
  const plan = displayedPlan(state)
  let eta = 0
  let prevD = 0
  let prevT = 0
  for (const p of profile.legs) {
    const leg = plan.elements.find((e) => e.id === p.legId)
    const d = isLeg(leg) ? (leg.cumulativeDistance ?? 0) : 0
    if (d >= distanceNm) {
      const f = d - prevD > 0 ? (distanceNm - prevD) / (d - prevD) : 0
      eta = prevT + (p.etaMin - prevT) * f
      break
    }
    prevD = d
    prevT = p.etaMin
    eta = p.etaMin
  }
  const base = state.simulation.status === 'IDLE' ? state.simulation.simTimeMs : state.simulation.simTimeMs - state.simulation.elapsedSec * 1000
  return `${fmtZulu(base + eta * 60000)}/${String(Math.round(remaining)).padStart(4, ' ')}NM`
}

function title(state: FmsState, phase: Phase, perf: PerformanceState): FmsPageContent['title'] {
  const mode = phase === 'CLB' ? perf.climb : phase === 'CRZ' ? perf.cruise : perf.descent
  const name = phase === 'CLB' ? 'CLB' : phase === 'CRZ' ? 'CRZ' : 'PATH DES'
  let spd = 'ECON'
  if (mode.mode === 'MANUAL') spd = mode.mach !== undefined && phase === 'CRZ' ? `${fmtMach(mode.mach)}M` : `${mode.speedKt ?? ''}KT`
  const prefix = state.modifiedPerformance ? 'MOD' : state.flightPhase === (phase === 'CLB' ? 'CLIMB' : phase === 'CRZ' ? 'CRUISE' : 'DESCENT') ? 'ACT' : ''
  return { center: [span(prefix ? `${prefix} ` : '', 'white', 'S'), span(`${spd} ${name}`)] }
}

function nextConstraint(state: FmsState, segmentFilter: (seg: string) => boolean): { ident: string; text: string } | undefined {
  const plan = displayedPlan(state)
  for (let i = plan.activeLegIndex; i < plan.elements.length; i++) {
    const e = plan.elements[i]
    if (isLeg(e) && e.altitudeConstraint && segmentFilter(e.segment)) {
      return { ident: e.waypoint.ident, text: fmtBoeingAltConstraint(e.altitudeConstraint, state.performance.transitionAltitudeFt ?? 18000) }
    }
  }
  return undefined
}

export function climbContent(state: FmsState, ctx: RenderContext): FmsPageContent {
  const perf = displayedPerformance(state)
  const econ = econSpeeds(ctx.perf, perf.costIndex)
  const manual = perf.climb.mode === 'MANUAL'
  const profile = profileOf(state, ctx)
  const nc = nextConstraint(state, (s) => s === 'DEPARTURE' || s === 'ENROUTE')
  return {
    title: title(state, 'CLB', perf),
    rows: [
      row({ left: [small('CRZ ALT')], right: [small(nc ? `AT ${nc.ident}` : '')] }, { left: [span(perf.cruiseAltitudeFt ? fmtFl(perf.cruiseAltitudeFt) : dashes(5))], right: [span(nc?.text ?? '')] }, { L: { fieldId: 'CLB.CRZ_ALT', explainKey: 'cruiseAltitude' } }),
      row(
        { left: [small(manual ? 'SEL SPD' : 'ECON SPD')], right: [small('TO T/C')] },
        {
          left: [span(manual ? `${perf.climb.speedKt ?? econ.climbKt}/${fmtMach(perf.climb.mach ?? econ.climbMach)}` : `${econ.climbKt}/${fmtMach(econ.climbMach)}`)],
          right: [span(predictTo(state, profile, profile.topOfClimb?.distanceNm), 'white', 'S')],
        },
        { L: { fieldId: 'CLB.TGT_SPD', explainKey: 'targetSpeed' } },
      ),
      row({ left: [small('SPD REST')] }, { left: [span(perf.climb.speedRestrictionKt ? `${perf.climb.speedRestrictionKt}/${perf.climb.speedRestrictionAltFt ?? 10000}` : '250/10000')] }, { L: { fieldId: 'CLB.SPD_REST', explainKey: 'speedRestriction' } }),
      row(),
      row({}, { left: [span(manual ? '<ECON' : '')] }),
      eraseOr(state, undefined, undefined),
    ],
  }
}

export function cruiseContent(state: FmsState, ctx: RenderContext): FmsPageContent {
  const perf = displayedPerformance(state)
  const econ = econSpeeds(ctx.perf, perf.costIndex)
  const manual = perf.cruise.mode === 'MANUAL'
  const profile = profileOf(state, ctx)
  const gw = grossWeightKg(perf)
  const step = profile.stepClimb
  return {
    title: title(state, 'CRZ', perf),
    rows: [
      row(
        { left: [small('CRZ ALT')], right: [small('STEP TO')] },
        { left: [span(perf.cruiseAltitudeFt ? fmtFl(perf.cruiseAltitudeFt) : dashes(5))], right: [span(perf.cruise.stepToFt ? fmtFl(perf.cruise.stepToFt) : step ? fmtFl(step.toAltitudeFt) : 'NONE', 'white', perf.cruise.stepToFt ? 'L' : 'S')] },
        { L: { fieldId: 'CRZ.CRZ_ALT', explainKey: 'cruiseAltitude' }, R: { fieldId: 'CRZ.STEP_TO', explainKey: 'stepClimb' } },
      ),
      row(
        { left: [small(manual ? 'SEL SPD' : 'ECON SPD')], right: [small(step ? 'AT' : '')] },
        { left: [span(fmtMach(manual ? (perf.cruise.mach ?? econ.cruiseMach) : econ.cruiseMach))], right: [span(step ? predictTo(state, profile, step.distanceNm) : '', 'white', 'S')] },
        { L: { fieldId: 'CRZ.TGT_SPD', explainKey: 'targetSpeed' } },
      ),
      row({ left: [small('TO T/D')], right: [small('STEP SIZE')] }, { left: [span(profile.topOfDescent ? predictTo(state, profile, profile.topOfDescent.distanceNm) : '----.-z/ ---NM', 'white', 'S')], right: [span(perf.cruise.stepSizeFt ? String(perf.cruise.stepSizeFt) : 'ICAO')] }, { R: { fieldId: 'CRZ.STEP_SIZE', explainKey: 'stepClimb' } }),
      row({ left: [small(`FUEL AT ${displayedPlan(state).destination ?? '----'}`)] }, { left: [span(profile.destinationFuelKg !== undefined ? fmtWeight(profile.destinationFuelKg) : '--.-', profile.warnings.includes('INSUFFICIENT_FUEL') ? 'amber' : 'white')] }),
      row({ left: [small('OPT     MAX     RECMD')] }, { left: [span(gw !== undefined ? `${fmtFl(optimumAltitudeFt(ctx.perf, gw))}   ${fmtFl(maxAltitudeFt(ctx.perf, gw))}   ${fmtFl(Math.min(maxAltitudeFt(ctx.perf, gw), optimumAltitudeFt(ctx.perf, gw)))}` : '-----   -----   -----')] }),
      eraseOr(state, manual ? '<ECON' : undefined, 'LRC>'),
    ],
  }
}

export function descentContent(state: FmsState, ctx: RenderContext): FmsPageContent {
  const perf = displayedPerformance(state)
  const econ = econSpeeds(ctx.perf, perf.costIndex)
  const manual = perf.descent.mode === 'MANUAL'
  const profile = profileOf(state, ctx)
  const nc = nextConstraint(state, (s) => s === 'ARRIVAL' || s === 'APPROACH' || s === 'ENROUTE')
  const plan = displayedPlan(state)
  const ed = [...plan.elements].reverse().find((e) => isLeg(e) && !e.missed && e.altitudeConstraint)
  return {
    title: title(state, 'DES', perf),
    rows: [
      row(
        { left: [small('E/D ALT')], right: [small(nc ? `AT ${nc.ident}` : '')] },
        { left: [span(isLeg(ed) && ed.altitudeConstraint ? fmtAlt(ed.altitudeConstraint.altitudeFt, 18000) : dashes(5))], right: [span(nc?.text ?? '')] },
      ),
      row(
        { left: [small(manual ? 'SEL SPD' : 'ECON SPD')], right: [small('TO T/D')] },
        {
          left: [span(`${fmtMach(manual ? (perf.descent.mach ?? econ.descentMach) : econ.descentMach)}/${manual ? (perf.descent.speedKt ?? econ.descentKt) : econ.descentKt}`)],
          right: [span(profile.topOfDescent ? predictTo(state, profile, profile.topOfDescent.distanceNm) : '----.-z/ ---NM', 'white', 'S')],
        },
        { L: { fieldId: 'DES.TGT_SPD', explainKey: 'targetSpeed' } },
      ),
      row(
        { left: [small('SPD REST')] },
        { left: [span(perf.descent.speedRestrictionKt ? `${perf.descent.speedRestrictionKt}/${perf.descent.speedRestrictionAltFt ?? 10000}` : dashes(3) + '/' + dashes(5))] },
        { L: { fieldId: 'DES.SPD_REST', explainKey: 'speedRestriction' } },
      ),
      row({ left: [small('PATH')] }, { left: [span(profile.warnings.includes('DES_PATH_UNACHIEVABLE') ? 'UNACHIEVABLE' : profile.valid ? 'ON PATH' : '----', profile.warnings.includes('DES_PATH_UNACHIEVABLE') ? 'amber' : 'white')] }),
      row({}, { left: [span(manual ? '<ECON' : '')] }),
      eraseOr(state, undefined, undefined),
    ],
  }
}

function setCrzAlt(draft: Draft<FmsState>, ctx: HandlerContext): void {
  const perf = editPerf(draft, ctx)
  const ft = parseCruiseAltitude(ctx.scratchpad, ctx.perf.maxCertifiedAltitudeFt)
  if (ft === undefined) return entryError('INVALID_ENTRY')
  perf.cruiseAltitudeFt = ft
  ctx.fieldChanged('CRZ_ALT', ft)
}

function setSpeed(phase: Phase): LskHandler {
  return (draft, ctx) => {
    const perf = editPerf(draft, ctx)
    const target = phase === 'CLB' ? perf.climb : phase === 'CRZ' ? perf.cruise : perf.descent
    if (ctx.deleteMode) {
      target.mode = 'ECON'
      target.speedKt = undefined
      target.mach = undefined
      return
    }
    const [a, b] = splitSlash(ctx.scratchpad)
    for (const part of [a, b]) {
      if (part === undefined) continue
      const s = parseSpeed(part)
      if (!s) return entryError('INVALID_ENTRY')
      if (s.kind === 'IAS') target.speedKt = s.kt
      else target.mach = s.mach
    }
    target.mode = 'MANUAL'
    ctx.fieldChanged(`${phase}_SPD`, ctx.scratchpad)
  }
}

function setSpeedRestriction(phase: 'CLB' | 'DES'): LskHandler {
  return (draft, ctx) => {
    const perf = editPerf(draft, ctx)
    const target = phase === 'CLB' ? perf.climb : perf.descent
    if (ctx.deleteMode) {
      target.speedRestrictionKt = undefined
      target.speedRestrictionAltFt = undefined
      return
    }
    const [s, a] = splitSlash(ctx.scratchpad)
    const kt = s !== undefined ? parseInteger(s, 100, 340) : undefined
    const alt = a !== undefined ? parseInteger(a, 1000, 20000) : undefined
    if (kt === undefined || alt === undefined) return entryError('INVALID_ENTRY')
    target.speedRestrictionKt = kt
    target.speedRestrictionAltFt = alt
  }
}

const toEcon =
  (phase: Phase): LskHandler =>
  (draft, ctx) => {
    if (ctx.scratchpad) return entryError('INVALID_ENTRY')
    const perf = editPerf(draft, ctx)
    const target = phase === 'CLB' ? perf.climb : phase === 'CRZ' ? perf.cruise : perf.descent
    if (target.mode !== 'MANUAL') return
    target.mode = 'ECON'
    target.speedKt = undefined
    target.mach = undefined
  }

const eraseHandler: LskHandler = (draft, ctx) => {
  if (!draft.modifiedPerformance && !draft.modifiedFlightPlan) return entryError('INVALID_ENTRY')
  draft.modifiedPerformance = undefined
  draft.modifiedFlightPlan = undefined
  draft.modificationKind = undefined
  ctx.emit({ type: 'ERASE', detail: 'DISCARD' })
}

interface PhaseHandlers {
  left: Array<LskHandler | undefined>
  right: Array<LskHandler | undefined>
}

const climbHandlers: PhaseHandlers = {
  left: [setCrzAlt, setSpeed('CLB'), setSpeedRestriction('CLB'), undefined, toEcon('CLB'), eraseHandler],
  right: [],
}

const cruiseHandlers: PhaseHandlers = {
  left: [
    setCrzAlt,
    setSpeed('CRZ'),
    undefined,
    undefined,
    undefined,
    (draft, ctx) => {
      if (draft.modifiedPerformance || draft.modifiedFlightPlan) return eraseHandler(draft, ctx)
      return toEcon('CRZ')(draft, ctx)
    },
  ],
  right: [
    (draft, ctx) => {
      const perf = editPerf(draft, ctx)
      if (ctx.deleteMode) {
        perf.cruise.stepToFt = undefined
        return
      }
      const ft = parseCruiseAltitude(ctx.scratchpad, ctx.perf.maxCertifiedAltitudeFt)
      if (ft === undefined || (perf.cruiseAltitudeFt !== undefined && ft <= perf.cruiseAltitudeFt)) return entryError('INVALID_ENTRY')
      perf.cruise.stepToFt = ft
      ctx.fieldChanged('STEP_TO', ft)
    },
    undefined,
    (draft, ctx) => {
      const perf = editPerf(draft, ctx)
      if (ctx.deleteMode || ctx.scratchpad === 'ICAO') {
        perf.cruise.stepSizeFt = 0
        return
      }
      const step = parseInteger(ctx.scratchpad, 0, 9000)
      if (step === undefined || step % 1000 !== 0) return entryError('INVALID_ENTRY')
      perf.cruise.stepSizeFt = step
    },
    undefined,
    undefined,
    (draft, ctx) => {
      // LRC: long range cruise ≈ 99% maximum-range Mach (training approximation: CI 0 Mach + .01).
      if (ctx.scratchpad) return entryError('INVALID_ENTRY')
      const perf = editPerf(draft, ctx)
      perf.cruise.mode = 'MANUAL'
      perf.cruise.mach = Math.round((ctx.perf.cruise.machCi0 + 0.01) * 1000) / 1000
      ctx.fieldChanged('CRZ_SPD', 'LRC')
    },
  ],
}

const descentHandlers: PhaseHandlers = {
  left: [undefined, setSpeed('DES'), setSpeedRestriction('DES'), undefined, toEcon('DES'), eraseHandler],
  right: [],
}

/** 737: dedicated CLB / CRZ / DES pages. */
export function boeing737VnavPages(): FmsPageDefinition[] {
  return [
    { id: 'CLB', title: 'CLB', render: climbContent, leftLskHandlers: climbHandlers.left, rightLskHandlers: climbHandlers.right },
    { id: 'CRZ', title: 'CRZ', render: cruiseContent, leftLskHandlers: cruiseHandlers.left, rightLskHandlers: cruiseHandlers.right },
    { id: 'DES', title: 'DES', render: descentContent, leftLskHandlers: descentHandlers.left, rightLskHandlers: descentHandlers.right },
  ]
}

/** 777/787: one VNAV page with CLB (1/3), CRZ (2/3), DES (3/3). */
export function boeing777VnavPage(): FmsPageDefinition {
  const pick = (subPage: number): PhaseHandlers => (subPage === 1 ? climbHandlers : subPage === 2 ? cruiseHandlers : descentHandlers)
  const route =
    (side: 'L' | 'R', i: number): LskHandler =>
    (draft, ctx) => {
      const h = side === 'L' ? pick(ctx.subPage).left[i] : pick(ctx.subPage).right[i]
      if (!h) return ctx.scratchpad || ctx.deleteMode ? entryError('INVALID_ENTRY') : undefined
      return h(draft, ctx)
    }
  return {
    id: 'VNAV',
    title: 'VNAV',
    pageCount: () => 3,
    render: (state, ctx) => (ctx.subPage === 1 ? climbContent(state, ctx) : ctx.subPage === 2 ? cruiseContent(state, ctx) : descentContent(state, ctx)),
    leftLskHandlers: [0, 1, 2, 3, 4, 5].map((i) => route('L', i)),
    rightLskHandlers: [0, 1, 2, 3, 4, 5].map((i) => route('R', i)),
  }
}
