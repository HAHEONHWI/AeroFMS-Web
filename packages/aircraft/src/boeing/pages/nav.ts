import { bearingDeg, distanceNm, isLeg } from '@aerofms/shared'
import type { FlightPlanLeg } from '@aerofms/shared'
import {
  computeVnavProfile,
  defaultHoldFor,
  directTo,
  displayedPerformance,
  displayedPlan,
  entryError,
  findLegIndex,
  insertWaypointBefore,
  parseCourse,
  parseDecimal,
  parseInboundCourseTurn,
  parseInteger,
  presentPosition,
  resolveWaypointEntry,
  row,
  small,
  span,
  splitSlash,
  trueToMag,
  parseAltitude,
} from '@aerofms/core'
import type { FmsPageDefinition, FmsState, HandlerContext, LskHandler, RenderContext } from '@aerofms/core'
import type { Draft } from 'immer'
import { boxes, dashes, fmtAlt, fmtCourse, fmtDistance, fmtWeight, fmtZulu } from '../../common/format'
import { eraseOr, separatorLabel } from '../helpers'

// ───────────────────────── PROGRESS ─────────────────────────

function etaFor(state: FmsState, ctx: RenderContext, leg: FlightPlanLeg | undefined): { eta: string; fuel: string; dtg: string } {
  if (!leg) return { eta: '', fuel: '', dtg: '' }
  const plan = displayedPlan(state)
  const prof = computeVnavProfile(plan, displayedPerformance(state), ctx.perf, ctx.nav)
  const pred = prof.legs.find((p) => p.legId === leg.id)
  const pos = state.position.aircraft
  const active = plan.elements[plan.activeLegIndex]
  let dtg: number | undefined
  if (isLeg(active) && active.cumulativeDistance !== undefined && leg.cumulativeDistance !== undefined) {
    const toActive = pos ? distanceNm(pos, active.waypoint) : (active.calculatedDistance ?? 0)
    dtg = toActive + (leg.cumulativeDistance - active.cumulativeDistance)
  }
  const gs = Math.max(state.position.groundSpeedKt, 120)
  const running = state.simulation.status !== 'IDLE'
  const etaMs = running && dtg !== undefined ? state.simulation.simTimeMs + (dtg / gs) * 3600000 : pred ? state.simulation.simTimeMs + pred.etaMin * 60000 : undefined
  const fuelKg = running && pred?.fuelKg !== undefined && state.performance.fuelKg !== undefined
    ? pred.fuelKg - (state.performance.fuelKg - state.simulation.fuelKg)
    : pred?.fuelKg
  return { eta: fmtZulu(etaMs, false), fuel: fuelKg !== undefined ? fmtWeight(fuelKg) : '', dtg: dtg !== undefined ? fmtDistance(dtg) : '' }
}

export function progressPage(): FmsPageDefinition {
  return {
    id: 'PROG',
    title: 'PROGRESS',
    pageCount: () => 2,
    render: (state, ctx) => {
      const plan = displayedPlan(state)
      const fn = plan.flightNumber ?? ''
      if (ctx.subPage === 2) {
        const g = state.guidance
        const xtk = g.crossTrackNm
        return {
          title: { center: [span(`${fn} PROGRESS`.trim())] },
          rows: [
            row({ left: [small('HEADWIND')], right: [small('CROSSWIND')] }, { left: [span(`${state.simulation.windKt ? Math.round(state.simulation.windKt * Math.cos(((state.simulation.windDir - state.position.trackTrue) * Math.PI) / 180)) : 0}KT`)], right: [span(`${state.simulation.windKt ? Math.abs(Math.round(state.simulation.windKt * Math.sin(((state.simulation.windDir - state.position.trackTrue) * Math.PI) / 180))) : 0}KT`)] }),
            row({ left: [small('WIND')], right: [small('SAT')] }, { left: [span(`${String(Math.round(state.simulation.windDir)).padStart(3, '0')}°/${Math.round(state.simulation.windKt)}`)], right: [span(`${Math.round(15 - 1.98 * Math.min(36089, state.position.altitudeFt) / 1000)}°C`)] }),
            row({ left: [small('XTK ERROR')], right: [small('VERT DEV')] }, { left: [span(`${xtk < 0 ? 'L' : 'R'}${Math.abs(xtk).toFixed(2)}NM`)], right: [span(`${Math.round(state.position.altitudeFt - state.simulation.targetAltitudeFt)}`)] }),
            row({ left: [small('TAS')], right: [small('FUEL USED')] }, { left: [span(`${Math.round(state.simulation.trueAirspeedKt)}KT`)], right: [span(fmtWeight(state.simulation.fuelUsedKg))] }),
            row({ left: [small('FUEL QTY')] }, { left: [span(fmtWeight(state.simulation.fuelKg || state.performance.fuelKg))] }),
            row(),
          ],
        }
      }
      const active = plan.elements[plan.activeLegIndex]
      let next: FlightPlanLeg | undefined
      for (let i = plan.activeLegIndex + 1; i < plan.elements.length; i++) {
        const e = plan.elements[i]
        if (isLeg(e) && !e.missed) {
          next = e
          break
        }
      }
      const legs = plan.elements.filter((e): e is FlightPlanLeg => isLeg(e) && !e.missed)
      const dest = legs[legs.length - 1]
      const a = etaFor(state, ctx, isLeg(active) ? active : undefined)
      const n = etaFor(state, ctx, next)
      const d = etaFor(state, ctx, dest)
      const prof = computeVnavProfile(plan, displayedPerformance(state), ctx.perf, ctx.nav)
      const flown = state.simulation.status === 'IDLE' ? 0 : prof.totalDistanceNm - state.guidance.distanceToDestinationNm
      const toTod = prof.topOfDescent ? prof.topOfDescent.distanceNm - flown : undefined
      const toToc = prof.topOfClimb ? prof.topOfClimb.distanceNm - flown : undefined
      return {
        title: { center: [span(`${fn} PROGRESS`.trim())] },
        rows: [
          row({ left: [small('TO')], center: [small('DTG')], right: [small('ETA   FUEL')] }, { left: [span(isLeg(active) ? active.waypoint.ident : '', 'magenta')], center: [span(a.dtg)], right: [span(`${a.eta} ${a.fuel}`)] }, { L: { fieldId: 'PROG.TO', explainKey: 'progress' } }),
          row({ left: [small('NEXT')] }, { left: [span(next?.waypoint.ident ?? '')], center: [span(n.dtg)], right: [span(next ? `${n.eta} ${n.fuel}` : '')] }),
          row({ left: [small('DEST')] }, { left: [span(plan.destination ?? '')], center: [span(d.dtg)], right: [span(dest ? `${d.eta} ${d.fuel}` : '')] }),
          row(
            { left: [small(toToc !== undefined && toToc > 0 ? 'TO T/C' : 'TO T/D')] },
            { left: [span(toToc !== undefined && toToc > 0 ? `${fmtDistance(toToc)}NM` : toTod !== undefined && toTod > 0 ? `${fmtDistance(toTod)}NM` : '----NM')] },
          ),
          row({ left: [small('LNAV')], right: [small('VNAV')] }, { left: [span(state.guidance.lnav, state.guidance.lnav === 'ACTIVE' ? 'green' : 'white')], right: [span(state.guidance.vnav, state.guidance.vnav === 'ACTIVE' ? 'green' : 'white')] }),
          row(separatorLabel(), { right: [span(state.modifiedFlightPlan ? '' : '')] }),
        ],
      }
    },
    leftLskHandlers: [],
    rightLskHandlers: [],
  }
}

// ───────────────────────── FIX INFO ─────────────────────────

export function fixPage(): FmsPageDefinition {
  const MAX_FIX_PAGES = 2
  const entryIndex = (ctx: HandlerContext): number => ctx.subPage - 1
  const rowHandler =
    (r: number): LskHandler =>
    (draft, ctx) => {
      const f = draft.navigation.fixInfo[entryIndex(ctx)]
      if (!f) return entryError('INVALID_ENTRY')
      const items = [...f.radials.map((x) => ({ k: 'R' as const, v: x })), ...f.distancesNm.map((x) => ({ k: 'D' as const, v: x }))]
      const existing = items[r - 2]
      if (ctx.deleteMode) {
        if (!existing) return entryError('INVALID_DELETE')
        if (existing.k === 'R') f.radials = f.radials.filter((x) => x !== existing.v)
        else f.distancesNm = f.distancesNm.filter((x) => x !== existing.v)
        return
      }
      const [rad, dis] = splitSlash(ctx.scratchpad)
      if (rad !== undefined && dis === undefined) {
        const c = parseCourse(rad)
        if (c === undefined) return entryError('INVALID_ENTRY')
        if (f.radials.length + f.distancesNm.length >= 3) return entryError('INVALID_ENTRY')
        f.radials.push(c)
      } else if (dis !== undefined && rad === undefined) {
        const d = parseDecimal(dis, 0.1, 700)
        if (d === undefined) return entryError('INVALID_ENTRY')
        if (f.radials.length + f.distancesNm.length >= 3) return entryError('INVALID_ENTRY')
        f.distancesNm.push(d)
      } else return entryError('INVALID_ENTRY')
      ctx.fieldChanged('FIX_RAD_DIS', ctx.scratchpad)
    }
  return {
    id: 'FIX',
    title: 'FIX INFO',
    pageCount: () => MAX_FIX_PAGES,
    render: (state, ctx) => {
      const f = state.navigation.fixInfo[ctx.subPage - 1]
      const pos = state.position.aircraft
      const radDis = f && pos ? `${fmtCourse(trueToMag(bearingDeg(f.ref, pos), f.ref.magVar))}/${fmtDistance(distanceNm(f.ref, pos))}` : ''
      const items = f ? [...f.radials.map((x) => `${String(x).padStart(3, '0')}/`), ...f.distancesNm.map((x) => `/${x}`)] : []
      return {
        title: { center: [span('FIX INFO')] },
        rows: [
          row({ left: [small('FIX')], right: [small('RAD/DIS FR')] }, { left: [span(f?.ref.ident ?? boxes(5))], right: [span(radDis, 'green')] }, { L: { fieldId: 'FIX.REF', explainKey: 'fixInfo' } }),
          ...[0, 1, 2].map((i) =>
            row(i === 0 ? { left: [small('RAD/DIS')] } : {}, { left: [span(items[i] ?? (f ? dashes(3) + '/' + dashes(3) : ''))] }, { L: { fieldId: 'FIX.RAD_DIS', explainKey: 'fixInfo' } }),
          ),
          row(),
          row(separatorLabel(), { left: [span(f ? '<ERASE FIX' : '')] }),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        const idx = entryIndex(ctx)
        if (ctx.deleteMode) {
          draft.navigation.fixInfo.splice(idx, 1)
          return
        }
        const wp = resolveWaypointEntry(ctx, ctx.scratchpad, draft.position.aircraft ?? undefined)
        const entry = { ref: wp, radials: [] as number[], distancesNm: [] as number[], abeam: false }
        if (draft.navigation.fixInfo[idx]) draft.navigation.fixInfo[idx] = entry
        else if (idx <= draft.navigation.fixInfo.length) draft.navigation.fixInfo.splice(idx, 0, entry)
        else draft.navigation.fixInfo.push(entry)
        ctx.fieldChanged('FIX', wp.ident)
      },
      rowHandler(2),
      rowHandler(3),
      rowHandler(4),
      undefined,
      (draft, ctx) => {
        if (ctx.scratchpad) return entryError('INVALID_ENTRY')
        draft.navigation.fixInfo.splice(entryIndex(ctx), 1)
      },
    ],
    rightLskHandlers: [],
  }
}

// ───────────────────────── HOLD ─────────────────────────

function holdLegs(state: FmsState): Array<{ index: number; leg: FlightPlanLeg }> {
  const plan = displayedPlan(state)
  const out: Array<{ index: number; leg: FlightPlanLeg }> = []
  plan.elements.forEach((e, index) => {
    if (isLeg(e) && e.hold && !e.missed) out.push({ index, leg: e })
  })
  return out
}

function currentHold(state: FmsState, subPage: number): { index: number; leg: FlightPlanLeg } | undefined {
  if (state.currentPage.context.newHold) return undefined
  return holdLegs(state)[subPage - 1]
}

function editHoldLeg(draft: Draft<FmsState>, ctx: HandlerContext): FlightPlanLeg {
  const target = currentHold(draft as FmsState, ctx.subPage)
  if (!target) return entryError('INVALID_ENTRY')
  const plan = ctx.editPlan('HOLD')
  const leg = plan.elements.find((e) => e.id === target.leg.id)
  if (!isLeg(leg) || !leg.hold) return entryError('INVALID_ENTRY')
  return leg
}

export function holdPage(): FmsPageDefinition {
  const holdAt: LskHandler = (draft, ctx) => {
    const target = currentHold(draft as FmsState, ctx.subPage)
    if (target) {
      if (draft.modifiedFlightPlan) {
        draft.modifiedFlightPlan = undefined
        draft.modificationKind = undefined
        ctx.emit({ type: 'ERASE', detail: 'DISCARD' })
        return
      }
      // <NEXT HOLD
      if (ctx.scratchpad) return entryError('INVALID_ENTRY')
      draft.currentPage.context.newHold = true
      return
    }
    if (!ctx.scratchpad) return entryError('INVALID_ENTRY')
    const plan = ctx.editPlan('HOLD')
    const idx = findLegIndex(plan, ctx.scratchpad, Math.max(1, plan.activeLegIndex))
    if (idx >= 0) {
      const leg = plan.elements[idx]
      if (!isLeg(leg)) return entryError('INVALID_ENTRY')
      leg.hold = defaultHoldFor(leg, draft.position.altitudeFt || draft.performance.cruiseAltitudeFt || 10000)
    } else {
      const wp = resolveWaypointEntry(ctx, ctx.scratchpad, draft.position.aircraft ?? undefined)
      const at = Math.max(1, plan.activeLegIndex)
      const leg = insertWaypointBefore(plan, ctx.nextId, at, wp, true)
      const inserted = plan.elements.find((e) => e.id === leg.id)
      if (isLeg(inserted)) inserted.hold = { ...defaultHoldFor(inserted, draft.position.altitudeFt || 10000) }
    }
    draft.currentPage.context.newHold = false
    ctx.fieldChanged('HOLD_AT', ctx.scratchpad)
  }
  const ppos: LskHandler = (draft, ctx) => {
    const target = currentHold(draft as FmsState, ctx.subPage)
    if (target) {
      // EXIT HOLD
      const plan = ctx.editPlan('HOLD')
      const leg = plan.elements.find((e) => e.id === target.leg.id)
      if (!isLeg(leg) || !leg.hold) return entryError('INVALID_ENTRY')
      leg.hold.exitArmed = true
      ctx.fieldChanged('EXIT_HOLD', leg.waypoint.ident)
      return
    }
    if (ctx.scratchpad) return entryError('INVALID_ENTRY')
    const plan = ctx.editPlan('HOLD')
    const pos = presentPosition(draft as FmsState, plan)
    if (!pos) return entryError('NO_ACTIVE_ROUTE')
    directTo(plan, ctx.nextId, { waypoint: { ident: 'PPOS', lat: pos.lat, lon: pos.lon, type: 'TURN_POINT' } }, pos, ctx.adapter.turnPointIdent)
    const leg = plan.elements[plan.activeLegIndex]
    if (isLeg(leg)) {
      leg.hold = { inboundCourse: Math.round(trueToMag(draft.position.trackTrue)), turn: 'R', legTimeMin: draft.position.altitudeFt > 14000 ? 1.5 : 1, exitArmed: false, source: 'PILOT' }
    }
    // Remove the discontinuity inserted after PPOS so the route continues after the hold.
    const after = plan.elements[plan.activeLegIndex + 1]
    if (after?.kind === 'DISCONTINUITY') plan.elements.splice(plan.activeLegIndex + 1, 1)
    ctx.fieldChanged('HOLD_AT', 'PPOS')
  }

  return {
    id: 'HOLD',
    title: 'HOLD',
    onOpen: (draft) => {
      draft.currentPage.context.newHold = holdLegs(draft as FmsState).length === 0
    },
    pageCount: (state) => Math.max(1, holdLegs(state).length),
    render: (state, ctx) => {
      const target = currentHold(state, ctx.subPage)
      const titlePrefix = state.modifiedFlightPlan ? 'MOD ' : state.activeFlightPlan.activated ? 'ACT ' : ''
      if (!target) {
        return {
          title: { center: [span(`${titlePrefix}RTE 1 HOLD`)] },
          rows: [row(), row(), row(), row(), row(), row({ left: [small('HOLD AT')], right: [small('HOLD AT')] }, { left: [span(boxes(5))], right: [span('PPOS>')] }, { L: { fieldId: 'HOLD.HOLD_AT', explainKey: 'hold' } })],
        }
      }
      const h = target.leg.hold
      const trans = state.performance.transitionAltitudeFt ?? 18000
      const best = Math.round(210 + (state.position.altitudeFt > 14000 ? 20 : 0))
      return {
        title: { center: [span(`${titlePrefix}RTE 1 HOLD`)] },
        rows: [
          row({ left: [small('FIX')], right: [small('SPD/TGT ALT')] }, { left: [span(target.leg.waypoint.ident)], right: [span(`${h?.speedKt ?? '---'}/${h?.altitudeFt !== undefined ? fmtAlt(h.altitudeFt, trans) : dashes(5)}`)] }, { L: { fieldId: 'HOLD.FIX', explainKey: 'hold' }, R: { fieldId: 'HOLD.SPD_ALT' } }),
          row({ left: [small('QUAD/RADIAL')], right: [small('FIX ETA')] }, { left: [span('--/---')], right: [span(etaFor(state, ctx, target.leg).eta || '----z')] }),
          row({ left: [small('INBD CRS/DIR')], right: [small('EFC TIME')] }, { left: [span(`${fmtCourse(h?.inboundCourse)}/${h?.turn === 'L' ? 'L' : 'R'} TURN`)], right: [span(h?.efc ? `${h.efc}z` : '----z')] }, { L: { fieldId: 'HOLD.INBD', explainKey: 'holdInbound' }, R: { fieldId: 'HOLD.EFC' } }),
          row({ left: [small('LEG TIME')], right: [small('BEST SPEED')] }, { left: [span(h?.legDistanceNm ? '-.-' : `${(h?.legTimeMin ?? 1).toFixed(1)} MIN`)], right: [span(`${best}KT`)] }, { L: { fieldId: 'HOLD.LEG_TIME', explainKey: 'holdLegTime' } }),
          row({ left: [small('LEG DIST')] }, { left: [span(h?.legDistanceNm ? `${h.legDistanceNm.toFixed(1)} NM` : '--.-')] }, { L: { fieldId: 'HOLD.LEG_DIST' } }),
          eraseOr(state, '<NEXT HOLD', h?.exitArmed ? 'EXIT ARMED' : 'EXIT HOLD>'),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (!ctx.deleteMode) return entryError('INVALID_ENTRY')
        const leg = editHoldLeg(draft, ctx)
        leg.hold = undefined
        ctx.fieldChanged('HOLD_DELETED', leg.waypoint.ident)
      },
      undefined,
      (draft, ctx) => {
        const leg = editHoldLeg(draft, ctx)
        const p = parseInboundCourseTurn(ctx.scratchpad)
        if (!p || !leg.hold) return entryError('INVALID_ENTRY')
        if (p.course !== undefined) leg.hold.inboundCourse = p.course
        if (p.turn) leg.hold.turn = p.turn
        ctx.fieldChanged('HOLD_INBD', ctx.scratchpad)
      },
      (draft, ctx) => {
        const leg = editHoldLeg(draft, ctx)
        const t = parseDecimal(ctx.scratchpad, 0.5, 9.9)
        if (t === undefined || !leg.hold) return entryError('INVALID_ENTRY')
        leg.hold.legTimeMin = t
        leg.hold.legDistanceNm = undefined
      },
      (draft, ctx) => {
        const leg = editHoldLeg(draft, ctx)
        const d = parseDecimal(ctx.scratchpad, 1, 99.9)
        if (d === undefined || !leg.hold) return entryError('INVALID_ENTRY')
        leg.hold.legDistanceNm = d
      },
      holdAt,
    ],
    rightLskHandlers: [
      (draft, ctx) => {
        const leg = editHoldLeg(draft, ctx)
        if (!leg.hold) return entryError('INVALID_ENTRY')
        if (ctx.deleteMode) {
          leg.hold.speedKt = undefined
          leg.hold.altitudeFt = undefined
          return
        }
        const [s, a] = splitSlash(ctx.scratchpad)
        if (s !== undefined) {
          const kt = parseInteger(s, 150, 300)
          if (kt === undefined) return entryError('INVALID_ENTRY')
          leg.hold.speedKt = kt
        }
        if (a !== undefined) {
          const ft = parseAltitude(a, ctx.perf.maxCertifiedAltitudeFt)
          if (ft === undefined) return entryError('INVALID_ENTRY')
          leg.hold.altitudeFt = ft
        }
      },
      undefined,
      (draft, ctx) => {
        const leg = editHoldLeg(draft, ctx)
        if (!leg.hold) return entryError('INVALID_ENTRY')
        if (ctx.deleteMode) {
          leg.hold.efc = undefined
          return
        }
        if (!/^([01]\d|2[0-3])[0-5]\d$/.test(ctx.scratchpad)) return entryError('INVALID_ENTRY')
        leg.hold.efc = ctx.scratchpad
      },
      undefined,
      undefined,
      ppos,
    ],
  }
}

// ───────────────────────── 777/787 extras ─────────────────────────

export function altnPage(): FmsPageDefinition {
  const candidates = (state: FmsState, ctx: RenderContext | HandlerContext) => {
    const dest = displayedPlan(state).destination
    const ap = dest ? ctx.nav.searchAirport(dest) : undefined
    if (!ap) return []
    return ctx.nav
      .allAirports()
      .filter((a) => a.icao !== ap.icao)
      .map((a) => ({ a, d: distanceNm(ap, a) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, 4)
  }
  const select =
    (i: number): LskHandler =>
    (draft, ctx) => {
      const c = candidates(draft as FmsState, ctx)[i]
      if (!c || ctx.scratchpad) return entryError('INVALID_ENTRY')
      const plan = ctx.editPlan('ROUTE')
      plan.alternate = plan.alternate === c.a.icao ? undefined : c.a.icao
      ctx.fieldChanged('ALTN', plan.alternate ?? null)
    }
  return {
    id: 'ALTN',
    title: 'ALTN',
    render: (state, ctx) => {
      const list = candidates(state, ctx)
      const sel = displayedPlan(state).alternate
      const prof = computeVnavProfile(displayedPlan(state), displayedPerformance(state), ctx.perf, ctx.nav)
      return {
        title: { center: [span('ALTN LIST')] },
        rows: [
          ...[0, 1, 2, 3].map((i) => {
            const c = list[i]
            if (!c) return row()
            const fuel = prof.destinationFuelKg !== undefined ? fmtWeight(prof.destinationFuelKg - (c.d / 450) * ctx.perf.fuelFlow.cruiseKgH) : '--.-'
            return row(i === 0 ? { left: [small('ALTN')], right: [small('DIST  FUEL')] } : {}, {
              left: [span(c.a.icao), span(sel === c.a.icao ? ' <SEL>' : '', 'green', 'S')],
              right: [span(`${Math.round(c.d)}  ${fuel}`)],
            })
          }),
          row(),
          eraseOr(state, undefined, undefined),
        ],
      }
    },
    leftLskHandlers: [select(0), select(1), select(2), select(3), undefined, (draft, ctx) => {
      if (!draft.modifiedFlightPlan) return entryError('INVALID_ENTRY')
      draft.modifiedFlightPlan = undefined
      draft.modificationKind = undefined
      ctx.emit({ type: 'ERASE', detail: 'DISCARD' })
    }],
    rightLskHandlers: [],
  }
}

export function navRadioPage(): FmsPageDefinition {
  const setVor =
    (side: 'vor1' | 'vor2'): LskHandler =>
    (draft, ctx) => {
      if (ctx.deleteMode) {
        draft.navigation.radios[side] = undefined
        return
      }
      const freq = parseDecimal(ctx.scratchpad, 108, 117.95, 2)
      if (freq !== undefined) {
        draft.navigation.radios[side] = { frequency: freq, manual: true }
        return
      }
      const navaid = ctx.nav.getNavaid(ctx.scratchpad, draft.position.aircraft ?? undefined)
      if (!navaid || navaid.type === 'NDB') return entryError('NOT_IN_DATABASE')
      draft.navigation.radios[side] = { ident: navaid.ident, frequency: navaid.frequency, manual: true }
      ctx.fieldChanged(side.toUpperCase(), navaid.ident)
    }
  const setCrs =
    (side: 'vor1' | 'vor2'): LskHandler =>
    (draft, ctx) => {
      const c = parseCourse(ctx.scratchpad)
      const r = draft.navigation.radios[side]
      if (c === undefined || !r) return entryError('INVALID_ENTRY')
      r.course = c
    }
  return {
    id: 'NAV_RAD',
    title: 'NAV RADIO',
    render: (state, ctx) => {
      const r = state.navigation.radios
      const plan = displayedPlan(state)
      const ap = plan.destination ? ctx.nav.searchAirport(plan.destination) : undefined
      const rw = ap && plan.arrivalRunway ? ap.runways.find((x) => x.ident === plan.arrivalRunway) : undefined
      const v = (x: typeof r.vor1): string => (x ? `${x.frequency?.toFixed(2) ?? ''}${x.manual ? 'M' : 'A'} ${x.ident ?? ''}` : '---.--')
      return {
        title: { center: [span('NAV RADIO')] },
        rows: [
          row({ left: [small('VOR L')], right: [small('VOR R')] }, { left: [span(v(r.vor1))], right: [span(v(r.vor2))] }),
          row({ left: [small('CRS')], right: [small('CRS')] }, { left: [span(r.vor1?.course !== undefined ? fmtCourse(r.vor1.course) : '---')], right: [span(r.vor2?.course !== undefined ? fmtCourse(r.vor2.course) : '---')] }),
          row({ left: [small('ADF L')] }, { left: [span(r.adf1 ? String(r.adf1) : '---')] }),
          row({ left: [small('ILS-GLS')] }, { left: [span(rw?.ilsFrequency ? `${rw.ilsFrequency.toFixed(2)}/${fmtCourse(rw.ilsCourse)}` : 'PARK')] }),
          row(),
          row(),
        ],
      }
    },
    leftLskHandlers: [
      setVor('vor1'),
      setCrs('vor1'),
      (draft, ctx) => {
        const f = parseInteger(ctx.scratchpad, 190, 1750)
        if (f === undefined) return entryError('INVALID_ENTRY')
        draft.navigation.radios.adf1 = f
      },
    ],
    rightLskHandlers: [setVor('vor2'), setCrs('vor2')],
  }
}

/** Datalink is not simulated: the page shows the real "NO COMM" state of an unconnected datalink. */
export function fmcCommPage(): FmsPageDefinition {
  return {
    id: 'FMC_COMM',
    title: 'FMC COMM',
    render: () => ({
      title: { center: [span('FMC COMM')] },
      rows: [row(), row({}, { center: [span('DATA LINK', 'white')] }), row({}, { center: [span('NO COMM', 'amber')] }), row(), row(), row()],
    }),
    leftLskHandlers: [],
    rightLskHandlers: [],
  }
}
