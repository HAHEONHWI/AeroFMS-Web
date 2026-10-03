import { isDiscontinuity, isLeg } from '@aerofms/shared'
import type { FlightPlan, FlightPlanElement, FlightPlanLeg } from '@aerofms/shared'
import {
  clearLegConstraints,
  clonePlan,
  computeVnavProfile,
  connectToDownstream,
  defaultHoldFor,
  deleteElement,
  displayedPerformance,
  displayedPlan,
  entryError,
  expandAirway,
  airwayContains,
  findLegIndex,
  finalizePlan,
  insertWaypointBefore,
  makeDiscontinuity,
  makeLeg,
  opDirectTo,
  opSetDepartureRunway,
  opSetProcedure,
  parseAirbusAltitudeConstraint,
  parseCourse,
  parseDecimal,
  parseInteger,
  procedureRunways,
  requireAirport,
  resolveWaypointEntry,
  row,
  setLegConstraints,
  small,
  span,
  splitSlash,
  trackActiveLeg,
  trueToMag,
  airportWaypoint,
} from '@aerofms/core'
import type { FmsLine, FmsPageDefinition, FmsRow, FmsState, HandlerContext, KeyBinding, LskHandler, RenderContext, TextSpan } from '@aerofms/core'
import type { Draft } from 'immer'
import { boxes, fmtAirbusAltConstraint, fmtAlt, fmtCourse, fmtDistance, fmtHhmm, fmtLatLonAirbus, fmtMach, fmtWeight } from '../../common/format'
import { abTitle, eraseOr, goTo, hasTmpy, insertOr, label, legById, routeColor } from '../helpers'
import type { AirbusVariant } from '../variant'

// ───────────────────────── F-PLN line model ─────────────────────────

type FplnLine =
  | { kind: 'LEG'; index: number; leg: FlightPlanLeg; from: boolean }
  | { kind: 'DISCO'; index: number }
  | { kind: 'HOLD'; index: number; leg: FlightPlanLeg }
  | { kind: 'END'; text: string }

function fplnLines(plan: FlightPlan): FplnLine[] {
  const lines: FplnLine[] = []
  // FROM line: the last leg before the active (TO) leg.
  let start = Math.max(0, plan.activeLegIndex - 1)
  while (start > 0 && !isLeg(plan.elements[start])) start--
  let endOfPlanAdded = false
  for (let i = start; i < plan.elements.length; i++) {
    const e = plan.elements[i]
    if (isDiscontinuity(e)) {
      lines.push({ kind: 'DISCO', index: i })
      continue
    }
    if (!isLeg(e)) continue
    if (e.missed && !endOfPlanAdded) {
      lines.push({ kind: 'END', text: '------END OF F-PLN------' })
      endOfPlanAdded = true
    }
    lines.push({ kind: 'LEG', index: i, leg: e, from: i === start && i < plan.activeLegIndex })
    if (e.hold) lines.push({ kind: 'HOLD', index: i, leg: e })
  }
  lines.push({ kind: 'END', text: endOfPlanAdded ? '---END OF ALTN F-PLN----' : '------END OF F-PLN------' })
  if (!endOfPlanAdded) lines.push({ kind: 'END', text: '---NO ALTN F-PLN-------' })
  return lines
}

type PlanSel = 'ACTIVE' | 'SEC'

const planOf = (state: FmsState, which: PlanSel): FlightPlan | undefined =>
  which === 'SEC' ? state.secondaryFlightPlan : displayedPlan(state)

const scrollOf = (state: FmsState): number => Number(state.currentPage.context.scroll ?? 0)

function visibleLine(state: FmsState, which: PlanSel, r: number): FplnLine | undefined {
  const plan = planOf(state, which)
  if (!plan) return undefined
  return fplnLines(plan)[scrollOf(state) + r - 1]
}

/** Mutable plan for edits from the F-PLN page (SEC edits go straight into the secondary plan). */
function editTarget(draft: Draft<FmsState>, ctx: HandlerContext, which: PlanSel, kind: 'ROUTE' | 'LAT_REV'): Draft<FlightPlan> {
  if (which === 'SEC') {
    if (!draft.secondaryFlightPlan) return entryError('NOT_ALLOWED')
    return draft.secondaryFlightPlan
  }
  return ctx.editPlan(kind)
}

function legLabel(leg: FlightPlanLeg, prevIsDisco: boolean): FmsLine {
  if (prevIsDisco) return {}
  let left = ''
  if (leg.via && leg.via !== 'DIRECT' && leg.segment === 'ENROUTE') left = ` ${leg.via}`
  else if (leg.legType === 'VA' || leg.legType === 'CA') left = ` H${fmtCourse(leg.courseMag).replace('°', '')}`
  else if (leg.calculatedTrack !== undefined) left = ` C${fmtCourse(trueToMag(leg.calculatedTrack, leg.waypoint.magVar))}`
  if (leg.segment === 'DEPARTURE' || leg.segment === 'ARRIVAL' || leg.segment === 'APPROACH') left = ` ${leg.via ?? left}`.slice(0, 10)
  return {
    left: [small(left, 'green')],
    right: [small(leg.calculatedDistance !== undefined ? `${fmtDistance(leg.calculatedDistance)}  ` : '', 'green')],
  }
}

function fplnRender(state: FmsState, ctx: RenderContext, which: PlanSel, v: AirbusVariant) {
  const plan = planOf(state, which)
  const mfd = v.display === 'AIRBUS_MFD'
  const title = which === 'SEC' ? abTitle(state, 'SEC F-PLN', { mfd, mfdName: 'SEC/F-PLN' }) : abTitle(state, '', { mfd, mfdName: 'F-PLN' })
  if (plan?.flightNumber) title.right = [span(plan.flightNumber)]
  if (!plan) return { title, rows: [row({}, { center: [span('NO SEC F-PLN')] })] }
  const lines = fplnLines(plan)
  const scroll = scrollOf(state)
  const prof = computeVnavProfile(plan, displayedPerformance(state), ctx.perf, ctx.nav)
  const trans = state.performance.transitionAltitudeFt ?? 18000
  const base = state.simulation.status === 'IDLE' ? state.simulation.simTimeMs : state.simulation.simTimeMs - state.simulation.elapsedSec * 1000
  const color = which === 'SEC' ? 'white' : routeColor(state)
  const rows: FmsRow[] = []
  for (let r = 0; r < 5; r++) {
    const ln = lines[scroll + r]
    const prev = lines[scroll + r - 1]
    if (!ln) {
      rows.push(row())
      continue
    }
    if (ln.kind === 'END') {
      rows.push(row({}, { left: [span(ln.text, 'white')] }))
      continue
    }
    if (ln.kind === 'DISCO') {
      rows.push(row({}, { left: [span('---F-PLN DISCONTINUITY--', 'white')] }, { L: { fieldId: 'FPLN.DISCONTINUITY', explainKey: 'discontinuity' } }))
      continue
    }
    if (ln.kind === 'HOLD') {
      const h = ln.leg.hold
      rows.push(row({ left: [small(` IN ${fmtCourse(h?.inboundCourse)}`, 'green')] }, { left: [span(`HOLD ${h?.turn ?? 'R'}`, color)] }, { L: { fieldId: 'FPLN.HOLD', explainKey: 'hold', legId: ln.leg.id } }))
      continue
    }
    const leg = ln.leg
    const pred = prof.legs.find((p) => p.legId === leg.id)
    const isTo = ln.index === plan.activeLegIndex
    const legColor: TextSpan['color'] = leg.missed ? 'cyan' : isTo && color === 'green' ? 'white' : color
    const lbl: FmsLine = r === 0 && ln.from ? { left: [small(' FROM')], right: [small('UTC   SPD/ALT  ')] } : legLabel(leg, prev?.kind === 'DISCO')
    const spd = leg.speedConstraint ? String(leg.speedConstraint.speedKt) : pred ? (pred.phase === 'CRUISE' ? fmtMach(state.performance.cruise.mach ?? ctx.perf.cruise.machCi0) : String(pred.speedKt)) : ' ---'
    const altText = leg.altitudeConstraint ? fmtAirbusAltConstraint(leg.altitudeConstraint, trans) : pred ? fmtAlt(pred.altitudeFt, trans) : '-----'
    rows.push(
      row(
        lbl,
        {
          left: [{ text: `${leg.waypoint.ident}${leg.overfly ? 'Δ' : ''}`, color: legColor, size: 'L', inverse: state.navigation.highlightedLegId === leg.id }],
          // Fixed columns under the "UTC   SPD/ALT" label: time(4) · speed(3)/ · altitude(6).
          right: [
            span(pred ? fmtHhmm(base + pred.etaMin * 60000) : '----', legColor, 'S'),
            span(' '),
            span(`${spd.trim().padStart(3, ' ')}/`, leg.speedConstraint ? 'magenta' : legColor, leg.speedConstraint ? 'L' : 'S'),
            span(altText.padStart(6, ' '), leg.altitudeConstraint ? 'magenta' : legColor, leg.altitudeConstraint ? 'L' : 'S'),
          ],
        },
        { L: { fieldId: 'FPLN.WAYPOINT', explainKey: 'fplnWaypoint', legId: leg.id }, R: { fieldId: 'FPLN.CONSTRAINT', explainKey: 'constraint', legId: leg.id } },
      ),
    )
  }
  if (which === 'ACTIVE' && hasTmpy(state)) {
    rows.push(row({}, { left: [span('<ERASE', 'amber')], right: [span('INSERT*', 'amber')] }))
  } else {
    const destLegs = plan.elements.filter((e): e is FlightPlanLeg => isLeg(e) && !e.missed)
    const dest = destLegs[destLegs.length - 1]
    const destPred = dest ? prof.legs.find((p) => p.legId === dest.id) : undefined
    rows.push(
      row(
        { left: [small(' DEST')], center: [small('UTC')], right: [small('DIST  EFOB')] },
        {
          left: [span(dest ? `${plan.destination ?? dest.waypoint.ident}${plan.arrivalRunway ?? ''}` : '----', 'white')],
          center: [span(destPred ? fmtHhmm(base + destPred.etaMin * 60000) : '----', 'green', 'S')],
          right: [span(`${Math.round(prof.totalDistanceNm || 0)}  ${prof.destinationFuelKg !== undefined ? fmtWeight(prof.destinationFuelKg) : '--.-'}`, 'green', 'S')],
        },
        { L: { fieldId: 'FPLN.DEST', explainKey: 'destination' } },
      ),
    )
  }
  return { title, rows, arrows: { up: true, down: true } }
}

/** Parses Airbus "SPD/ALT" constraint entries: "250/", "/+FL100", "250/-5000". */
function parseAirbusConstraint(input: string, maxFt: number) {
  const [s, a] = splitSlash(input)
  const out: { hasSpeed: boolean; hasAltitude: boolean; speed?: FlightPlanLeg['speedConstraint']; altitude?: FlightPlanLeg['altitudeConstraint'] } = {
    hasSpeed: s !== undefined,
    hasAltitude: a !== undefined,
  }
  if (!input.includes('/')) return undefined
  if (s !== undefined) {
    const kt = parseInteger(s, 100, 399)
    if (kt === undefined) return undefined
    out.speed = { type: 'AT_OR_BELOW', speedKt: kt }
  }
  if (a !== undefined) {
    const alt = parseAirbusAltitudeConstraint(a, maxFt)
    if (!alt) return undefined
    out.altitude = alt
  }
  return out.hasSpeed || out.hasAltitude ? out : undefined
}

function fplnLeft(which: PlanSel, r: number): LskHandler {
  return (draft, ctx) => {
    const ln = visibleLine(draft as FmsState, which, r)
    if (!ln || ln.kind === 'END') {
      if (ctx.scratchpad || ctx.deleteMode) return entryError('NOT_ALLOWED')
      return
    }
    if (ctx.deleteMode) {
      const plan = editTarget(draft, ctx, which, 'ROUTE')
      if (ln.kind === 'HOLD') {
        const leg = plan.elements[ln.index]
        if (isLeg(leg)) leg.hold = undefined
        return
      }
      deleteElement(plan, ctx.nextId, ln.index, { allowDiscontinuityDelete: true })
      if (which === 'SEC') finalizePlan(plan, ctx.now)
      ctx.fieldChanged('FPLN_CLR', ln.kind === 'LEG' ? ln.leg.waypoint.ident : 'DISCONTINUITY')
      return
    }
    if (!ctx.scratchpad) {
      if (ln.kind === 'LEG') {
        draft.navigation.highlightedLegId = ln.leg.id
        if (which === 'ACTIVE') ctx.openPage('LAT_REV', 1, { legId: ln.leg.id })
      } else if (ln.kind === 'HOLD' && which === 'ACTIVE') ctx.openPage('AB_HOLD', 1, { legId: ln.leg.id })
      return
    }
    if (ctx.scratchpad === 'Δ') {
      if (ln.kind !== 'LEG') return entryError('NOT_ALLOWED')
      const plan = editTarget(draft, ctx, which, 'ROUTE')
      const leg = plan.elements[ln.index]
      if (isLeg(leg)) leg.overfly = !leg.overfly
      return
    }
    if (ln.kind === 'HOLD') return entryError('NOT_ALLOWED')
    const plan = editTarget(draft, ctx, which, 'LAT_REV')
    const entry = ctx.scratchpad
    const downstream = findLegIndex(plan, entry, ln.index + (ln.kind === 'LEG' ? 1 : 0))
    if (downstream > ln.index) {
      trackActiveLeg(plan, () => {
        plan.elements.splice(ln.index, downstream - ln.index)
      })
    } else {
      const prev = plan.elements[ln.index - 1]
      const wp = resolveWaypointEntry(ctx, entry, isLeg(prev) ? prev.waypoint : undefined)
      insertWaypointBefore(plan, ctx.nextId, Math.max(1, ln.index), wp, ln.kind === 'LEG')
    }
    if (which === 'SEC') finalizePlan(plan, ctx.now)
    ctx.fieldChanged('FPLN_INSERT', entry)
  }
}

function fplnRight(which: PlanSel, r: number): LskHandler {
  return (draft, ctx) => {
    const ln = visibleLine(draft as FmsState, which, r)
    if (!ln || ln.kind !== 'LEG') {
      if (ctx.scratchpad || ctx.deleteMode) return entryError('NOT_ALLOWED')
      return
    }
    if (!ctx.scratchpad && !ctx.deleteMode) {
      if (which === 'ACTIVE') ctx.openPage('VERT_REV', 1, { legId: ln.leg.id })
      return
    }
    const plan = editTarget(draft, ctx, which, 'ROUTE')
    const leg = plan.elements[ln.index]
    if (!isLeg(leg)) return entryError('NOT_ALLOWED')
    if (ctx.deleteMode) {
      clearLegConstraints(leg)
      return
    }
    const c = parseAirbusConstraint(ctx.scratchpad, ctx.perf.maxCertifiedAltitudeFt)
    if (!c) return entryError('FORMAT_ERROR')
    setLegConstraints(leg, c)
    ctx.fieldChanged('CONSTRAINT', `${leg.waypoint.ident} ${ctx.scratchpad}`)
  }
}

function scrollBindings(which: PlanSel): KeyBinding[] {
  const scroll =
    (delta: number): LskHandler =>
    (draft) => {
      const plan = planOf(draft as FmsState, which)
      if (!plan) return
      const n = fplnLines(plan).length
      const cur = scrollOf(draft as FmsState)
      draft.currentPage.context.scroll = Math.max(0, Math.min(Math.max(0, n - 1), cur + delta))
    }
  return [
    { key: 'UP', handler: scroll(1) },
    { key: 'DOWN', handler: scroll(-1) },
  ]
}

export function fplnPage(v: AirbusVariant): FmsPageDefinition {
  const destLat: LskHandler = (draft, ctx) => {
    if (ctx.scratchpad) return entryError('NOT_ALLOWED')
    const plan = displayedPlan(draft as FmsState)
    const legs = plan.elements.filter((e): e is FlightPlanLeg => isLeg(e) && !e.missed)
    const dest = legs[legs.length - 1]
    if (!dest) return entryError('NOT_ALLOWED')
    ctx.openPage('LAT_REV', 1, { legId: dest.id })
  }
  const destVert: LskHandler = (draft, ctx) => {
    if (ctx.scratchpad) return entryError('NOT_ALLOWED')
    const plan = displayedPlan(draft as FmsState)
    const legs = plan.elements.filter((e): e is FlightPlanLeg => isLeg(e) && !e.missed)
    const dest = legs[legs.length - 1]
    if (dest) ctx.openPage('VERT_REV', 1, { legId: dest.id })
  }
  return {
    id: 'F_PLN',
    title: 'F-PLN',
    render: (state, ctx) => fplnRender(state, ctx, 'ACTIVE', v),
    leftLskHandlers: [1, 2, 3, 4, 5].map((r) => fplnLeft('ACTIVE', r)).concat([eraseOr(destLat)]),
    rightLskHandlers: [1, 2, 3, 4, 5].map((r) => fplnRight('ACTIVE', r)).concat([insertOr(destVert)]),
    keyBindings: scrollBindings('ACTIVE'),
  }
}

/** Scroll offset that brings the destination line to the top (AIRPORT key). */
export function destinationScroll(state: FmsState): number {
  const lines = fplnLines(displayedPlan(state))
  const plan = displayedPlan(state)
  const idx = lines.findIndex((l) => l.kind === 'LEG' && l.leg.waypoint.ident === plan.destination)
  const rw = lines.findIndex((l) => l.kind === 'LEG' && l.leg.waypoint.type === 'RUNWAY' && l.leg.segment === 'APPROACH')
  return Math.max(0, (idx >= 0 ? idx : rw >= 0 ? rw : lines.length - 2) - 3)
}

// ───────────────────────── LAT REV ─────────────────────────

export function latRevPage(): FmsPageDefinition {
  const target = (state: FmsState) => legById(state, state.currentPage.context.legId)
  const isOrigin = (state: FmsState): boolean => {
    const t = target(state)
    return !!t && t.leg.segment === 'ORIGIN'
  }
  const isDest = (state: FmsState): boolean => {
    const t = target(state)
    const plan = displayedPlan(state)
    return !!t && (t.leg.segment === 'DESTINATION' || (t.leg.waypoint.type === 'RUNWAY' && t.leg.segment === 'APPROACH') || t.leg.waypoint.ident === plan.destination)
  }

  const nextWpt: LskHandler = (draft, ctx) => {
    const t = target(draft as FmsState)
    if (!t || isDest(draft as FmsState)) return entryError('NOT_ALLOWED')
    if (!ctx.scratchpad) return entryError('FORMAT_ERROR')
    const plan = ctx.editPlan('LAT_REV')
    const idx = plan.elements.findIndex((e) => e.id === t.leg.id)
    if (idx < 0) return entryError('NOT_ALLOWED')
    const downstream = findLegIndex(plan, ctx.scratchpad, idx + 1)
    if (downstream > idx + 1) {
      connectToDownstream(plan, idx + 1, downstream)
    } else if (downstream !== idx + 1) {
      const wp = resolveWaypointEntry(ctx, ctx.scratchpad, t.leg.waypoint)
      insertWaypointBefore(plan, ctx.nextId, idx + 1, wp, true)
    }
    ctx.fieldChanged('NEXT_WPT', ctx.scratchpad)
  }

  const newDest: LskHandler = (draft, ctx) => {
    const t = target(draft as FmsState)
    if (!t) return entryError('NOT_ALLOWED')
    const ap = requireAirport(ctx, ctx.scratchpad)
    const plan = ctx.editPlan('LAT_REV')
    const idx = plan.elements.findIndex((e) => e.id === t.leg.id)
    if (idx < 0) return entryError('NOT_ALLOWED')
    trackActiveLeg(plan, () => {
      plan.elements.splice(idx + 1)
      plan.elements.push(makeLeg(ctx.nextId, airportWaypoint(ap), 'DESTINATION', { via: 'DIRECT' }))
    })
    plan.destination = ap.icao
    plan.star = undefined
    plan.approach = undefined
    plan.arrivalRunway = undefined
    ctx.fieldChanged('NEW_DEST', ap.icao)
  }

  return {
    id: 'LAT_REV',
    title: 'LAT REV',
    render: (state) => {
      const t = target(state)
      const origin = isOrigin(state)
      const dest = isDest(state)
      return {
        title: { center: [span('LAT REV ', 'white'), span('FROM ', 'white', 'S'), span(t?.leg.waypoint.ident ?? '', 'green')], left: hasTmpy(state) ? [span('TMPY', 'yellow', 'S')] : undefined },
        rows: [
          row({ center: [small(t ? fmtLatLonAirbus(t.leg.waypoint) : '', 'green')] }, { left: [span(origin ? '<DEPARTURE' : '')], right: [span(dest ? 'ARRIVAL>' : 'FIX INFO>')] }),
          row({}, { left: [span(!origin && !dest ? '<OFFSET' : '')] }),
          row(label(undefined, !dest ? 'NEXT WPT ' : ''), { left: [span(!origin && !dest ? '<HOLD' : '')], right: [span(!dest ? boxes(5) : '', 'amber')] }, { R: { fieldId: 'LATREV.NEXT_WPT', explainKey: 'nextWaypoint' } }),
          row(label(undefined, 'NEW DEST '), { right: [span(boxes(4), 'amber')] }, { R: { fieldId: 'LATREV.NEW_DEST', explainKey: 'newDestination' } }),
          row({}, { right: [span(!dest && !origin ? 'AIRWAYS>' : !dest ? 'AIRWAYS>' : '')] }),
          hasTmpy(state) ? row({}, { left: [span('<ERASE', 'amber')], right: [span('INSERT*', 'amber')] }) : row({}, { left: [span('<RETURN')] }),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (!isOrigin(draft as FmsState)) return entryError('NOT_ALLOWED')
        ctx.openPage('AB_DEPARTURES', 1, { mode: 'RWY' })
      },
      (draft, ctx) => {
        if (isOrigin(draft as FmsState) || isDest(draft as FmsState)) return entryError('NOT_ALLOWED')
        ctx.openPage('AB_OFFSET', 1, {})
      },
      (draft, ctx) => {
        const t = target(draft as FmsState)
        if (!t || isOrigin(draft as FmsState) || isDest(draft as FmsState)) return entryError('NOT_ALLOWED')
        ctx.openPage('AB_HOLD', 1, { legId: t.leg.id })
      },
      undefined,
      undefined,
      eraseOr(goTo('F_PLN')),
    ],
    rightLskHandlers: [
      (draft, ctx) => {
        if (isDest(draft as FmsState)) {
          ctx.openPage('AB_ARRIVALS', 1, { mode: 'APPR' })
          return
        }
        const t = target(draft as FmsState)
        if (!t) return entryError('NOT_ALLOWED')
        ctx.openPage('AB_FIX_INFO', 1, { ident: t.leg.waypoint.ident })
      },
      undefined,
      nextWpt,
      newDest,
      (draft, ctx) => {
        const t = target(draft as FmsState)
        if (!t || isDest(draft as FmsState)) return entryError('NOT_ALLOWED')
        ctx.openPage('AIRWAYS', 1, { fromLegId: t.leg.id })
      },
      insertOr(),
    ],
  }
}

// ───────────────────────── VERT REV ─────────────────────────

export function vertRevPage(): FmsPageDefinition {
  const target = (state: FmsState) => legById(state, state.currentPage.context.legId)
  const editLeg = (draft: Draft<FmsState>, ctx: HandlerContext): FlightPlanLeg => {
    const t = target(draft as FmsState)
    if (!t) return entryError('NOT_ALLOWED')
    const plan = ctx.editPlan('ROUTE')
    const leg = plan.elements.find((e) => e.id === t.leg.id)
    if (!isLeg(leg)) return entryError('NOT_ALLOWED')
    return leg
  }
  const isDescentSide = (state: FmsState): boolean => {
    const t = target(state)
    return !!t && (t.leg.segment === 'ARRIVAL' || t.leg.segment === 'APPROACH' || t.leg.segment === 'DESTINATION' || state.flightPhase === 'DESCENT')
  }
  return {
    id: 'VERT_REV',
    title: 'VERT REV',
    render: (state, ctx) => {
      const t = target(state)
      const prof = computeVnavProfile(displayedPlan(state), displayedPerformance(state), ctx.perf, ctx.nav)
      const pred = t ? prof.legs.find((p) => p.legId === t.leg.id) : undefined
      const des = isDescentSide(state)
      const lim = des ? state.performance.descent : state.performance.climb
      return {
        title: { center: [span('VERT REV '), span('AT ', 'white', 'S'), span(t?.leg.waypoint.ident ?? '', 'green')] },
        rows: [
          row({ left: [small(`EFOB=${pred?.fuelKg !== undefined ? fmtWeight(pred.fuelKg) : '--.-'}`, 'green')], right: [small('EXTRA=--.-', 'green')] }, {}),
          row(label(des ? 'DES SPD LIM' : 'CLB SPD LIM'), { left: [span(lim.speedRestrictionKt ? `${lim.speedRestrictionKt}/${fmtAlt(lim.speedRestrictionAltFt ?? 10000, 18000)}` : '---/-----', 'magenta')] }, { L: { fieldId: 'VERTREV.SPD_LIM', explainKey: 'speedRestriction' } }),
          row(label('SPD CSTR', 'ALT CSTR'), {
            left: [span(t?.leg.speedConstraint ? String(t.leg.speedConstraint.speedKt) : '[   ]', t?.leg.speedConstraint ? 'magenta' : 'cyan')],
            right: [span(t?.leg.altitudeConstraint ? fmtAirbusAltConstraint(t.leg.altitudeConstraint, state.performance.transitionAltitudeFt ?? 18000) : '[    ]', t?.leg.altitudeConstraint ? 'magenta' : 'cyan')],
          }, { L: { fieldId: 'VERTREV.SPD_CSTR', explainKey: 'constraint' }, R: { fieldId: 'VERTREV.ALT_CSTR', explainKey: 'constraint' } }),
          row(label('PRED SPD/ALT'), { left: [span(pred ? `${pred.speedKt}/${fmtAlt(pred.altitudeFt, state.performance.transitionAltitudeFt ?? 18000)}` : '---/-----', 'green', 'S')] }),
          row(),
          row({}, { left: [span('<RETURN')] }),
        ],
      }
    },
    leftLskHandlers: [
      undefined,
      (draft, ctx) => {
        const lim = isDescentSide(draft as FmsState) ? draft.performance.descent : draft.performance.climb
        if (ctx.deleteMode) {
          lim.speedRestrictionKt = undefined
          lim.speedRestrictionAltFt = undefined
          return
        }
        const [s, a] = splitSlash(ctx.scratchpad)
        const kt = s !== undefined ? parseInteger(s, 100, 340) : lim.speedRestrictionKt
        const alt = a !== undefined ? parseInteger(a.replace(/^FL/, ''), 10, 45000) : lim.speedRestrictionAltFt
        if (kt === undefined || alt === undefined) return entryError('FORMAT_ERROR')
        lim.speedRestrictionKt = kt
        lim.speedRestrictionAltFt = alt < 1000 ? alt * 100 : alt
      },
      (draft, ctx) => {
        const leg = editLeg(draft, ctx)
        if (ctx.deleteMode) {
          leg.speedConstraint = undefined
          return
        }
        const kt = parseInteger(ctx.scratchpad, 100, 399)
        if (kt === undefined) return entryError('ENTRY_OUT_OF_RANGE')
        leg.speedConstraint = { type: 'AT_OR_BELOW', speedKt: kt }
        leg.constraintSource = 'PILOT'
        ctx.fieldChanged('SPD_CSTR', `${leg.waypoint.ident} ${kt}`)
      },
      undefined,
      undefined,
      goTo('F_PLN'),
    ],
    rightLskHandlers: [
      undefined,
      undefined,
      (draft, ctx) => {
        const leg = editLeg(draft, ctx)
        if (ctx.deleteMode) {
          leg.altitudeConstraint = undefined
          return
        }
        const c = parseAirbusAltitudeConstraint(ctx.scratchpad, ctx.perf.maxCertifiedAltitudeFt)
        if (!c) return entryError('FORMAT_ERROR')
        leg.altitudeConstraint = c
        leg.constraintSource = 'PILOT'
        ctx.fieldChanged('ALT_CSTR', `${leg.waypoint.ident} ${ctx.scratchpad}`)
      },
    ],
  }
}

// ───────────────────────── AIRWAYS ─────────────────────────

interface AirwayRow {
  via?: string
  to?: string
}

function airwayRows(state: FmsState): AirwayRow[] {
  try {
    return JSON.parse(String(state.currentPage.context.rows ?? '[]')) as AirwayRow[]
  } catch {
    return []
  }
}

export function airwaysPage(): FmsPageDefinition {
  const fromIdentFor = (state: FmsState, r: number): string | undefined => {
    if (r === 0) return legById(state, state.currentPage.context.fromLegId)?.leg.waypoint.ident
    return airwayRows(state)[r - 1]?.to
  }
  const viaHandler =
    (r: number): LskHandler =>
    (draft, ctx) => {
      const rows = airwayRows(draft as FmsState)
      if (r > rows.length || (rows[r - 1]?.via === undefined && r !== rows.length && rows[r]?.via)) return entryError('NOT_ALLOWED')
      if (r < rows.length && rows[r]?.to) return entryError('NOT_ALLOWED')
      const from = fromIdentFor(draft as FmsState, r)
      if (!from) return entryError('NOT_ALLOWED')
      const via = ctx.scratchpad
      if (!ctx.nav.getAirway(via)) return entryError('NOT_IN_DATABASE')
      if (!airwayContains(ctx.nav, via, from)) return entryError('AIRWAY_NOT_CONNECTED')
      rows[r] = { via }
      draft.currentPage.context.rows = JSON.stringify(rows.slice(0, r + 1))
    }
  const toHandler =
    (r: number): LskHandler =>
    (draft, ctx) => {
      const rows = airwayRows(draft as FmsState)
      const cur = rows[r]
      if (!cur?.via || cur.to) return entryError('NOT_ALLOWED')
      const from = fromIdentFor(draft as FmsState, r)
      if (!from) return entryError('NOT_ALLOWED')
      const legsWp = expandAirway(ctx.nav, cur.via, from, ctx.scratchpad)
      const plan = ctx.editPlan('AIRWAYS')
      const fromIdx = findLegIndex(plan, from, 0)
      if (fromIdx < 0) return entryError('NOT_ALLOWED')
      const newLegs = legsWp.map((w) => makeLeg(ctx.nextId, w, 'ENROUTE', { via: cur.via }))
      const downstream = findLegIndex(plan, ctx.scratchpad, fromIdx + 1)
      trackActiveLeg(plan, () => {
        if (downstream > fromIdx) {
          plan.elements.splice(fromIdx + 1, downstream - fromIdx, ...newLegs)
        } else {
          const items: FlightPlanElement[] = [...newLegs, makeDiscontinuity(ctx.nextId, 'ENROUTE')]
          plan.elements.splice(fromIdx + 1, 0, ...items)
        }
      })
      rows[r] = { via: cur.via, to: ctx.scratchpad }
      draft.currentPage.context.rows = JSON.stringify(rows)
      ctx.fieldChanged('AIRWAY', `${cur.via} ${ctx.scratchpad}`)
    }
  return {
    id: 'AIRWAYS',
    title: 'AIRWAYS',
    render: (state) => {
      const rows = airwayRows(state)
      const from = fromIdentFor(state, 0)
      const out: FmsRow[] = []
      for (let i = 0; i < 5; i++) {
        const r = rows[i]
        const editable = i === rows.length || (i === rows.length - 1 && !rows[i]?.to)
        out.push(
          row(i === 0 ? label('VIA', 'TO') : {}, {
            left: [span(r?.via ?? (editable ? '[   ]' : ''), r?.via ? 'yellow' : 'cyan')],
            right: [span(r?.to ?? (r?.via ? boxes(5) : editable ? '[   ]' : ''), r?.to ? 'yellow' : r?.via ? 'amber' : 'cyan')],
          }, { L: { fieldId: 'AIRWAYS.VIA', explainKey: 'via' }, R: { fieldId: 'AIRWAYS.TO', explainKey: 'to' } }),
        )
      }
      out.push(hasTmpy(state) ? row({}, { left: [span('<ERASE', 'amber')], right: [span('INSERT*', 'amber')] }) : row({}, { left: [span('<RETURN')] }))
      return { title: { center: [span('AIRWAYS '), span('FROM ', 'white', 'S'), span(from ?? '', 'green')], left: hasTmpy(state) ? [span('TMPY', 'yellow', 'S')] : undefined }, rows: out }
    },
    leftLskHandlers: [0, 1, 2, 3, 4].map(viaHandler).concat([eraseOr(goTo('F_PLN'))]),
    rightLskHandlers: [0, 1, 2, 3, 4].map(toHandler).concat([insertOr()]),
  }
}

// ───────────────────────── DEPARTURES / ARRIVALS ─────────────────────────

type ListEntry = { label: string; detail?: string; apply: (draft: Draft<FmsState>, ctx: HandlerContext) => void }

function listOffset(state: FmsState): number {
  return Number(state.currentPage.context.offset ?? 0)
}

function listBindings(modes: string[]): KeyBinding[] {
  const mode =
    (delta: number): LskHandler =>
    (draft) => {
      const cur = modes.indexOf(String(draft.currentPage.context.mode ?? modes[0]))
      const next = modes[Math.max(0, Math.min(modes.length - 1, cur + delta))]
      draft.currentPage.context.mode = next ?? modes[0] ?? ''
      draft.currentPage.context.offset = 0
    }
  const scroll =
    (delta: number): LskHandler =>
    (draft) => {
      draft.currentPage.context.offset = Math.max(0, listOffset(draft as FmsState) + delta)
    }
  return [
    { key: 'NEXT_PAGE', handler: mode(1) },
    { key: 'PREV_PAGE', handler: mode(-1) },
    { key: 'UP', handler: scroll(1) },
    { key: 'DOWN', handler: scroll(-1) },
  ]
}

function departureEntries(state: FmsState, ctx: RenderContext | HandlerContext): ListEntry[] {
  const plan = displayedPlan(state)
  const ap = plan.origin ? ctx.nav.searchAirport(plan.origin) : undefined
  if (!ap) return []
  const mode = String(state.currentPage.context.mode ?? 'RWY')
  const next = (m: string) => (d: Draft<FmsState>) => {
    d.currentPage.context.mode = m
    d.currentPage.context.offset = 0
  }
  if (mode === 'RWY') {
    return ap.runways.map((r) => ({
      label: r.ident,
      detail: `${Math.round(r.lengthFt * 0.3048)}M ${String(r.headingMag).padStart(3, '0')}°`,
      apply: (d, c) => {
        opSetDepartureRunway(c, r.ident, 'DEPARTURE')
        next('SID')(d)
      },
    }))
  }
  if (mode === 'SID') {
    const list: ListEntry[] = ctx.nav
      .getDepartures(ap.icao)
      .filter((p) => !plan.departureRunway || procedureRunways(p, ap).includes(plan.departureRunway))
      .map((p) => ({
        label: p.name,
        apply: (d, c) => {
          opSetProcedure(c, 'SID', p.id, undefined, 'DEPARTURE')
          next(p.transitions.length ? 'TRANS' : 'SID')(d)
        },
      }))
    list.push({ label: 'NO SID', apply: (_d, c) => opSetProcedure(c, 'SID', null, undefined, 'DEPARTURE') })
    return list
  }
  const sid = plan.sid ? ctx.nav.getProcedure(plan.sid.id) : undefined
  const list: ListEntry[] = (sid?.transitions ?? []).map((t) => ({
    label: t.name,
    apply: (_d, c) => {
      if (plan.sid) opSetProcedure(c, 'SID', plan.sid.id, t.name, 'DEPARTURE')
    },
  }))
  list.push({ label: 'NO TRANS', apply: (_d, c) => plan.sid && opSetProcedure(c, 'SID', plan.sid.id, undefined, 'DEPARTURE') })
  return list
}

function arrivalEntries(state: FmsState, ctx: RenderContext | HandlerContext): ListEntry[] {
  const plan = displayedPlan(state)
  const ap = plan.destination ? ctx.nav.searchAirport(plan.destination) : undefined
  if (!ap) return []
  const mode = String(state.currentPage.context.mode ?? 'APPR')
  const next = (m: string) => (d: Draft<FmsState>) => {
    d.currentPage.context.mode = m
    d.currentPage.context.offset = 0
  }
  if (mode === 'APPR') {
    return ctx.nav.getApproaches(ap.icao).map((p) => {
      const rw = ap.runways.find((r) => r.ident === p.runways[0])
      return {
        label: p.name,
        detail: rw ? `${Math.round(rw.lengthFt * 0.3048)}M ${rw.ilsFrequency?.toFixed(2) ?? ''}` : undefined,
        apply: (d, c) => {
          opSetProcedure(c, 'APPROACH', p.id, undefined, 'ARRIVAL')
          next(p.transitions.length ? 'VIA' : 'STAR')(d)
        },
      }
    })
  }
  if (mode === 'VIA') {
    const app = plan.approach ? ctx.nav.getProcedure(plan.approach.id) : undefined
    const list: ListEntry[] = (app?.transitions ?? []).map((t) => ({
      label: t.name,
      apply: (d, c) => {
        if (plan.approach) opSetProcedure(c, 'APPROACH', plan.approach.id, t.name, 'ARRIVAL')
        next('STAR')(d)
      },
    }))
    list.push({ label: 'NO VIA', apply: (d, c) => {
      if (plan.approach) opSetProcedure(c, 'APPROACH', plan.approach.id, undefined, 'ARRIVAL')
      next('STAR')(d)
    } })
    return list
  }
  if (mode === 'STAR') {
    const app = plan.approach ? ctx.nav.getProcedure(plan.approach.id) : undefined
    const list: ListEntry[] = ctx.nav
      .getArrivals(ap.icao)
      .filter((p) => !app || p.runways.length === 0 || p.runways.some((r) => app.runways.includes(r)))
      .map((p) => ({
        label: p.name,
        apply: (d, c) => {
          opSetProcedure(c, 'STAR', p.id, undefined, 'ARRIVAL')
          next(p.transitions.length ? 'TRANS' : 'STAR')(d)
        },
      }))
    list.push({ label: 'NO STAR', apply: (_d, c) => opSetProcedure(c, 'STAR', null, undefined, 'ARRIVAL') })
    return list
  }
  const star = plan.star ? ctx.nav.getProcedure(plan.star.id) : undefined
  const list: ListEntry[] = (star?.transitions ?? []).map((t) => ({
    label: t.name,
    apply: (_d, c) => {
      if (plan.star) opSetProcedure(c, 'STAR', plan.star.id, t.name, 'ARRIVAL')
    },
  }))
  list.push({ label: 'NO TRANS', apply: (_d, c) => plan.star && opSetProcedure(c, 'STAR', plan.star.id, undefined, 'ARRIVAL') })
  return list
}

function procListPage(id: string, kind: 'DEP' | 'ARR', modes: string[]): FmsPageDefinition {
  const entries = (state: FmsState, ctx: RenderContext | HandlerContext) =>
    kind === 'DEP' ? departureEntries(state, ctx) : arrivalEntries(state, ctx)
  const select =
    (r: number): LskHandler =>
    (draft, ctx) => {
      if (ctx.scratchpad || ctx.deleteMode) return entryError('NOT_ALLOWED')
      const e = entries(draft as FmsState, ctx)[listOffset(draft as FmsState) + r - 2]
      if (!e) return
      e.apply(draft, ctx)
    }
  return {
    id,
    title: kind === 'DEP' ? 'DEPARTURES' : 'ARRIVAL',
    render: (state, ctx) => {
      const plan = displayedPlan(state)
      const mode = String(state.currentPage.context.mode ?? modes[0])
      const list = entries(state, ctx)
      const off = listOffset(state)
      const c = hasTmpy(state) ? 'yellow' : 'green'
      const header =
        kind === 'DEP'
          ? row(label('RWY', 'TRANS', 'SID'), { left: [span(plan.departureRunway ?? '---', c)], center: [span(plan.sid?.name ?? '------', c)], right: [span(plan.sid?.transition ?? '------', c)] })
          : row(label('APPR', 'STAR  TRANS', 'VIA'), {
              left: [span(plan.approach?.name ?? '------', c)],
              center: [span(plan.approach?.transition ?? '----', c)],
              right: [span(`${plan.star?.name ?? '-------'} ${plan.star?.transition ?? '-----'}`, c)],
            })
      const titleText = kind === 'DEP' ? `DEPARTURES FROM ${plan.origin ?? ''}` : `ARRIVAL TO ${plan.destination ?? ''}`
      const modeLabel: Record<string, string> = { RWY: 'AVAILABLE RUNWAYS', SID: 'SIDS', TRANS: 'TRANS', APPR: 'APPR AVAILABLE', VIA: 'APPR VIAS', STAR: 'STARS' }
      const rows: FmsRow[] = [header]
      for (let i = 0; i < 4; i++) {
        const e = list[off + i]
        rows.push(row(i === 0 ? { center: [small(modeLabel[mode] ?? mode)] } : {}, e ? { left: [span(`<${e.label}`, 'cyan')], right: e.detail ? [span(e.detail, 'cyan', 'S')] : undefined } : {}))
      }
      rows.push(hasTmpy(state) ? row({}, { left: [span('<ERASE', 'amber')], right: [span('INSERT*', 'amber')] }) : row({}, { left: [span('<RETURN')] }))
      return { title: { center: [span(titleText)], left: hasTmpy(state) ? [span('TMPY', 'yellow', 'S')] : undefined }, rows, arrows: { left: modes.indexOf(mode) > 0, right: modes.indexOf(mode) < modes.length - 1, up: true, down: true } }
    },
    leftLskHandlers: [undefined, select(2), select(3), select(4), select(5), eraseOr(goTo('F_PLN'))],
    rightLskHandlers: [undefined, undefined, undefined, undefined, undefined, insertOr()],
    keyBindings: listBindings(modes),
  }
}

export const abDeparturesPage = (): FmsPageDefinition => procListPage('AB_DEPARTURES', 'DEP', ['RWY', 'SID', 'TRANS'])
export const abArrivalsPage = (): FmsPageDefinition => procListPage('AB_ARRIVALS', 'ARR', ['APPR', 'VIA', 'STAR', 'TRANS'])

// ───────────────────────── HOLD ─────────────────────────

export function abHoldPage(): FmsPageDefinition {
  const holdLeg = (draft: Draft<FmsState>, ctx: HandlerContext): FlightPlanLeg => {
    const id = draft.currentPage.context.legId
    const plan = ctx.editPlan('HOLD')
    const leg = plan.elements.find((e) => e.id === id)
    if (!isLeg(leg)) return entryError('NOT_ALLOWED')
    leg.hold ??= defaultHoldFor(leg, draft.position.altitudeFt || 10000)
    return leg
  }
  return {
    id: 'AB_HOLD',
    title: 'HOLD',
    onOpen: (draft, ctx) => {
      const t = legById(draft as FmsState, draft.currentPage.context.legId)
      if (t && !t.leg.hold) holdLeg(draft, ctx)
    },
    render: (state) => {
      const t = legById(state, state.currentPage.context.legId)
      const h = t?.leg.hold
      const c = hasTmpy(state) ? 'yellow' : 'cyan'
      const gs = 220
      const dist = h?.legDistanceNm ?? ((h?.legTimeMin ?? 1) * gs) / 60
      return {
        title: { center: [span('HOLD '), span('AT ', 'white', 'S'), span(t?.leg.waypoint.ident ?? '', 'green')], left: hasTmpy(state) ? [span('TMPY', 'yellow', 'S')] : undefined },
        rows: [
          row(label('INB CRS', h?.source === 'PROCEDURE' ? 'DATABASE' : 'COMPUTED'), { left: [span(fmtCourse(h?.inboundCourse), c)] }, { L: { fieldId: 'ABHOLD.INB_CRS', explainKey: 'holdInbound' } }),
          row(label('TURN'), { left: [span(h?.turn ?? 'R', c)] }, { L: { fieldId: 'ABHOLD.TURN' } }),
          row(label('TIME/DIST'), { left: [span(`${(h?.legTimeMin ?? dist / (gs / 60)).toFixed(1)}/${dist.toFixed(1)}`, c)] }, { L: { fieldId: 'ABHOLD.TIME_DIST', explainKey: 'holdLegTime' } }),
          row(label('LAST EXIT', 'UTC  FUEL'), { right: [span('----  --.-', 'green', 'S')] }),
          row(),
          hasTmpy(state) ? row({}, { left: [span('<ERASE', 'amber')], right: [span('INSERT*', 'amber')] }) : row({}, { left: [span('<RETURN')] }),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        const leg = holdLeg(draft, ctx)
        const c = parseCourse(ctx.scratchpad)
        if (c === undefined || !leg.hold) return entryError('FORMAT_ERROR')
        leg.hold.inboundCourse = c
        leg.hold.source = 'PILOT'
      },
      (draft, ctx) => {
        const leg = holdLeg(draft, ctx)
        if ((ctx.scratchpad !== 'L' && ctx.scratchpad !== 'R') || !leg.hold) return entryError('FORMAT_ERROR')
        leg.hold.turn = ctx.scratchpad
      },
      (draft, ctx) => {
        const leg = holdLeg(draft, ctx)
        if (!leg.hold) return entryError('NOT_ALLOWED')
        const [t, d] = splitSlash(ctx.scratchpad)
        if (t !== undefined) {
          const time = parseDecimal(t, 0.5, 9.9)
          if (time === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          leg.hold.legTimeMin = time
          leg.hold.legDistanceNm = undefined
        } else if (d !== undefined) {
          const dist = parseDecimal(d, 1, 99.9)
          if (dist === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          leg.hold.legDistanceNm = dist
        } else return entryError('FORMAT_ERROR')
      },
      undefined,
      undefined,
      eraseOr(goTo('F_PLN')),
    ],
    rightLskHandlers: [undefined, undefined, undefined, undefined, undefined, insertOr()],
  }
}

// ───────────────────────── DIR TO ─────────────────────────

export function dirToPage(): FmsPageDefinition {
  const downstream = (state: FmsState): FlightPlanLeg[] => {
    const plan = state.activeFlightPlan
    return plan.elements.slice(plan.activeLegIndex).filter((e): e is FlightPlanLeg => isLeg(e) && !e.missed)
  }
  const pick =
    (r: number): LskHandler =>
    (draft, ctx) => {
      if (ctx.scratchpad || ctx.deleteMode) return entryError('NOT_ALLOWED')
      const off = Number(draft.currentPage.context.offset ?? 0)
      const leg = downstream(draft as FmsState)[off + r - 2]
      if (!leg) return
      opDirectTo(draft, ctx, leg.waypoint.ident)
      draft.currentPage.context.target = leg.waypoint.ident
    }
  return {
    id: 'DIR_TO',
    title: 'DIR TO',
    render: (state) => {
      const list = downstream(state)
      const off = Number(state.currentPage.context.offset ?? 0)
      const target = typeof state.currentPage.context.target === 'string' ? state.currentPage.context.target : undefined
      const rows: FmsRow[] = [row(label(' WAYPOINT', 'UTC   DIST '), { left: [span(target ? `${target}` : '[     ]', target ? 'yellow' : 'cyan')] }, { L: { fieldId: 'DIRTO.WAYPOINT', explainKey: 'directTo' } })]
      for (let i = 0; i < 4; i++) {
        const leg = list[off + i]
        rows.push(row(i === 0 ? label(' F-PLN WPTS') : {}, leg ? { left: [span(`<${leg.waypoint.ident}`, 'cyan')] } : {}))
      }
      rows.push(hasTmpy(state) ? row({}, { left: [span('<ERASE', 'amber')], right: [span('DIR TO*', 'amber')] }) : row())
      return { title: { center: [span('DIR TO')], left: hasTmpy(state) ? [span('TMPY', 'yellow', 'S')] : undefined }, rows, arrows: { up: true, down: true } }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (!ctx.scratchpad) return entryError('FORMAT_ERROR')
        opDirectTo(draft, ctx, ctx.scratchpad)
        draft.currentPage.context.target = ctx.scratchpad
      },
      pick(2),
      pick(3),
      pick(4),
      pick(5),
      eraseOr(),
    ],
    rightLskHandlers: [undefined, undefined, undefined, undefined, undefined, insertOr()],
    keyBindings: [
      { key: 'UP', handler: (d) => void (d.currentPage.context.offset = Number(d.currentPage.context.offset ?? 0) + 1) },
      { key: 'DOWN', handler: (d) => void (d.currentPage.context.offset = Math.max(0, Number(d.currentPage.context.offset ?? 0) - 1)) },
    ],
  }
}

// ───────────────────────── SECONDARY F-PLN ─────────────────────────

export function secIndexPage(v: AirbusVariant): FmsPageDefinition {
  return {
    id: 'SEC_INDEX',
    title: 'SEC INDEX',
    render: (state) => {
      const sec = state.secondaryFlightPlan
      return {
        title: abTitle(state, 'SEC INDEX', { mfd: v.display === 'AIRBUS_MFD', mfdName: 'SEC INDEX' }),
        rows: [
          row({}, { left: [span('<COPY ACTIVE')], right: [span(sec ? 'ACTIVATE SEC*' : '', 'amber')] }),
          row({}, { left: [span(sec ? '<SEC F-PLN' : '')] }),
          row({}, { left: [span(sec ? '<DELETE SEC' : '')] }),
          row(label('SEC ROUTE'), { left: [span(sec ? `${sec.origin ?? '----'}/${sec.destination ?? '----'}` : 'NONE', 'cyan')] }),
          row(),
          row(),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (ctx.scratchpad) return entryError('NOT_ALLOWED')
        const copy = clonePlan(draft.activeFlightPlan as FlightPlan)
        draft.secondaryFlightPlan = { ...copy, id: `${copy.id}-sec`, activated: true }
        ctx.fieldChanged('SEC_COPY', 'ACTIVE')
      },
      (draft, ctx) => {
        if (!draft.secondaryFlightPlan) return entryError('NOT_ALLOWED')
        ctx.openPage('SEC_F_PLN')
      },
      (draft, ctx) => {
        if (!draft.secondaryFlightPlan) return entryError('NOT_ALLOWED')
        draft.secondaryFlightPlan = undefined
        ctx.fieldChanged('SEC_DELETE', null)
      },
    ],
    rightLskHandlers: [
      (draft, ctx) => {
        const sec = draft.secondaryFlightPlan
        if (!sec) return entryError('NOT_ALLOWED')
        if (draft.modifiedFlightPlan) return entryError('TEMPORARY_PENDING')
        const old = draft.activeFlightPlan
        draft.activeFlightPlan = { ...sec, id: old.id, activated: true }
        draft.secondaryFlightPlan = { ...old, id: `${old.id}-sec` }
        ctx.emit({ type: 'INSERT', detail: 'ACTIVATE_SEC' })
      },
    ],
  }
}

export function secFplnPage(v: AirbusVariant): FmsPageDefinition {
  return {
    id: 'SEC_F_PLN',
    title: 'SEC F-PLN',
    render: (state, ctx) => fplnRender(state, ctx, 'SEC', v),
    leftLskHandlers: [1, 2, 3, 4, 5].map((r) => fplnLeft('SEC', r)).concat([goTo('SEC_INDEX')]),
    rightLskHandlers: [1, 2, 3, 4, 5].map((r) => fplnRight('SEC', r)),
    keyBindings: scrollBindings('SEC'),
  }
}
