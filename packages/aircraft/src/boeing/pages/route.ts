import {
  airwayContains,
  clonePlan,
  deleteRouteEntry,
  deriveRouteEntries,
  displayedPlan,
  entryError,
  lastEnrouteAnchor,
  opAppendRoute,
  opSetDepartureRunway,
  opSetDestination,
  opSetOrigin,
  opSetProcedure,
  parseFlightNumber,
  procedureRunways,
  replaceRouteEntry,
  resolveWaypointEntry,
  row,
  small,
  span,
} from '@aerofms/core'
import type { FmsPageDefinition, FmsRow, FmsState, HandlerContext, LskHandler, RouteEntry } from '@aerofms/core'
import type { Airport, Procedure } from '@aerofms/shared'
import { boxes, dashes } from '../../common/format'
import { eraseOr, eraseOrNavigate, goTo, rteTitle } from '../helpers'

const ROWS_PER_PAGE = 5

function routeRows(state: FmsState): Array<RouteEntry | 'PENDING' | 'EMPTY'> {
  const plan = displayedPlan(state)
  const entries: Array<RouteEntry | 'PENDING' | 'EMPTY'> = deriveRouteEntries(plan)
  if (plan.pendingVia) entries.push('PENDING')
  entries.push('EMPTY')
  return entries
}

function rtePageCount(state: FmsState): number {
  return 1 + Math.ceil(routeRows(state).length / ROWS_PER_PAGE)
}

function rowAt(state: FmsState, subPage: number, lskRow: number): RouteEntry | 'PENDING' | 'EMPTY' | undefined {
  return routeRows(state)[(subPage - 2) * ROWS_PER_PAGE + (lskRow - 1)]
}

export function rtePage(): FmsPageDefinition {
  const viaHandler =
    (r: number): LskHandler =>
    (draft, ctx) => {
      if (ctx.subPage < 2) return
      const entry = rowAt(draft as FmsState, ctx.subPage, r)
      if (!entry) return entryError('INVALID_ENTRY')
      const plan = ctx.editPlan('ROUTE')
      if (ctx.deleteMode) {
        if (entry === 'PENDING') {
          plan.pendingVia = undefined
          return
        }
        if (entry === 'EMPTY') return entryError('INVALID_DELETE')
        if (entry.kind === 'SID') return opSetProcedure(ctx, 'SID', null)
        if (entry.kind === 'STAR') return opSetProcedure(ctx, 'STAR', null)
        deleteRouteEntry(plan, { nav: ctx.nav, ids: ctx.nextId }, entry)
        ctx.fieldChanged('ROUTE_DELETE', entry.to)
        return
      }
      if (!ctx.scratchpad) return entryError('INVALID_ENTRY')
      const via = ctx.scratchpad === 'DIRECT' || ctx.scratchpad === 'DCT' ? 'DIRECT' : ctx.scratchpad
      if (via !== 'DIRECT' && !ctx.nav.getAirway(via)) return entryError('NOT_IN_DATABASE')
      if (entry === 'EMPTY' || entry === 'PENDING') {
        const anchor = lastEnrouteAnchor(plan)
        if (!plan.origin || !anchor.leg) return entryError('INVALID_ENTRY')
        if (via !== 'DIRECT' && !airwayContains(ctx.nav, via, anchor.leg.waypoint.ident)) return entryError('INVALID_ENTRY')
        plan.pendingVia = via
        ctx.fieldChanged('VIA', via)
        return
      }
      if (entry.kind === 'SID' || entry.kind === 'STAR') return entryError('INVALID_ENTRY')
      const to = resolveWaypointEntry(ctx, entry.to)
      replaceRouteEntry(plan, { nav: ctx.nav, ids: ctx.nextId }, entry, via, to)
      ctx.fieldChanged('VIA', via)
    }

  const toHandler =
    (r: number): LskHandler =>
    (draft, ctx) => {
      if (ctx.subPage < 2) return
      const entry = rowAt(draft as FmsState, ctx.subPage, r)
      if (!entry) return entryError('INVALID_ENTRY')
      if (ctx.deleteMode) {
        if (entry === 'EMPTY' || entry === 'PENDING') return entryError('INVALID_DELETE')
        if (entry.kind === 'SID' || entry.kind === 'STAR') return entryError('INVALID_DELETE')
        deleteRouteEntry(ctx.editPlan('ROUTE'), { nav: ctx.nav, ids: ctx.nextId }, entry)
        return
      }
      if (!ctx.scratchpad) {
        if (entry === 'EMPTY' || entry === 'PENDING') return
        draft.scratchpad.text = entry.to
        return
      }
      if (entry === 'EMPTY' || entry === 'PENDING') {
        const plan = ctx.editPlan('ROUTE')
        const via = plan.pendingVia ?? 'DIRECT'
        plan.pendingVia = undefined
        opAppendRoute(ctx, via, ctx.scratchpad)
        return
      }
      if (entry.kind === 'SID' || entry.kind === 'STAR') return entryError('INVALID_ENTRY')
      const plan = ctx.editPlan('ROUTE')
      replaceRouteEntry(plan, { nav: ctx.nav, ids: ctx.nextId }, entry, entry.via, resolveWaypointEntry(ctx, ctx.scratchpad))
      ctx.fieldChanged('TO', ctx.scratchpad)
    }

  const page1Left: Array<LskHandler | undefined> = [
    (draft, ctx) => {
      if (ctx.deleteMode) return entryError('INVALID_DELETE')
      opSetOrigin(draft, ctx, ctx.scratchpad)
    },
    (_draft, ctx) => {
      const plan = ctx.editPlan('ROUTE')
      if (ctx.deleteMode) {
        plan.companyRoute = undefined
        return
      }
      // Company routes are stored flight plans; the simulator has no airline database.
      if (!/^[A-Z0-9]{1,10}$/.test(ctx.scratchpad)) entryError('INVALID_ENTRY')
      entryError('NOT_IN_DATABASE')
    },
    (_draft, ctx) => {
      if (ctx.deleteMode) return entryError('INVALID_DELETE')
      opSetDepartureRunway(ctx, ctx.scratchpad)
    },
    undefined,
    undefined,
    eraseOrNavigate(),
  ]
  const page1Right: Array<LskHandler | undefined> = [
    (draft, ctx) => {
      if (ctx.deleteMode) return entryError('INVALID_DELETE')
      opSetDestination(draft, ctx, ctx.scratchpad)
    },
    (_draft, ctx) => {
      const plan = ctx.editPlan('ROUTE')
      if (ctx.deleteMode) {
        plan.flightNumber = undefined
        return
      }
      const fn = parseFlightNumber(ctx.scratchpad)
      if (!fn) return entryError('INVALID_ENTRY')
      plan.flightNumber = fn
      ctx.fieldChanged('FLT_NO', fn)
    },
    undefined,
    undefined,
    undefined,
    activateOrPerf,
  ]

  const dispatch =
    (side: 'L' | 'R', r: number): LskHandler =>
    (draft, ctx) => {
      if (ctx.subPage === 1) {
        if (!ctx.scratchpad && !ctx.deleteMode && r < 6) {
          // Empty scratchpad: line select copies the field into the scratchpad.
          const plan = displayedPlan(draft as FmsState)
          const value = side === 'L' ? [plan.origin, plan.companyRoute, plan.departureRunway][r - 1] : [plan.destination, plan.flightNumber][r - 1]
          if (value) draft.scratchpad.text = value
          return
        }
        const h = side === 'L' ? page1Left[r - 1] : page1Right[r - 1]
        if (!h) return ctx.scratchpad ? entryError('INVALID_ENTRY') : undefined
        return h(draft, ctx)
      }
      if (r === 6) {
        const h = side === 'L' ? page1Left[5] : page1Right[5]
        return h?.(draft, ctx)
      }
      return side === 'L' ? viaHandler(r)(draft, ctx) : toHandler(r)(draft, ctx)
    }

  return {
    id: 'RTE',
    title: 'RTE',
    pageCount: (s) => rtePageCount(s),
    render: (state, ctx) => {
      const plan = displayedPlan(state)
      const sixth = eraseOr(state, undefined, !plan.activated && !state.modifiedFlightPlan ? 'ACTIVATE>' : 'PERF INIT>')
      if (ctx.subPage === 1) {
        return {
          title: rteTitle(state, ''),
          rows: [
            row(
              { left: [small('ORIGIN')], right: [small('DEST')] },
              { left: [span(plan.origin ?? boxes(4))], right: [span(plan.destination ?? boxes(4))] },
              { L: { fieldId: 'RTE.ORIGIN', explainKey: 'origin' }, R: { fieldId: 'RTE.DEST', explainKey: 'destination' } },
            ),
            row(
              { left: [small('CO ROUTE')], right: [small('FLT NO.')] },
              { left: [span(plan.companyRoute ?? dashes(10))], right: [span(plan.flightNumber ?? dashes(8))] },
              { L: { fieldId: 'RTE.CO_ROUTE', explainKey: 'companyRoute' }, R: { fieldId: 'RTE.FLT_NO', explainKey: 'flightNumber' } },
            ),
            row(
              { left: [small('RUNWAY')] },
              { left: [span(plan.departureRunway ? `RW${plan.departureRunway}` : dashes(5))] },
              { L: { fieldId: 'RTE.RUNWAY', explainKey: 'departureRunway' } },
            ),
            row(),
            row(),
            sixth,
          ],
        }
      }
      const rows = routeRows(state)
      const start = (ctx.subPage - 2) * ROWS_PER_PAGE
      const out: FmsRow[] = []
      for (let i = 0; i < ROWS_PER_PAGE; i++) {
        const e = rows[start + i]
        const label = i === 0 ? { left: [small('VIA')], right: [small('TO')] } : {}
        if (!e) {
          out.push(row(label))
          continue
        }
        if (e === 'EMPTY') {
          out.push(row(label, { left: [span(dashes(5))], right: [span(dashes(5))] }, { L: { fieldId: 'RTE.VIA', explainKey: 'via' }, R: { fieldId: 'RTE.TO', explainKey: 'to' } }))
          continue
        }
        if (e === 'PENDING') {
          out.push(row(label, { left: [span(plan.pendingVia ?? '')], right: [span(boxes(5))] }, { L: { fieldId: 'RTE.VIA' }, R: { fieldId: 'RTE.TO' } }))
          continue
        }
        out.push(
          row(label, { left: [span(e.via)], right: [span(e.to)] }, { L: { fieldId: 'RTE.VIA', explainKey: 'via', legId: e.legIds[0] }, R: { fieldId: 'RTE.TO', explainKey: 'to', legId: e.legIds[e.legIds.length - 1] } }),
        )
      }
      out.push(sixth)
      return { title: rteTitle(state, ''), rows: out }
    },
    leftLskHandlers: [1, 2, 3, 4, 5, 6].map((r) => dispatch('L', r)),
    rightLskHandlers: [1, 2, 3, 4, 5, 6].map((r) => dispatch('R', r)),
  }
}

/** RTE 6R: ACTIVATE> (inactive route) or PERF INIT> */
const activateOrPerf: LskHandler = (draft, ctx) => {
  const plan = draft.activeFlightPlan
  if (!plan.activated && !draft.modifiedFlightPlan) {
    if (ctx.scratchpad) return entryError('INVALID_ENTRY')
    if (!plan.origin || !plan.destination) return entryError('INVALID_ENTRY')
    draft.modifiedFlightPlan = { ...clonePlan(plan as never), activated: true }
    draft.modificationKind = 'ACTIVATE'
    ctx.fieldChanged('ACTIVATE', 'RTE 1')
    return
  }
  ctx.openPage('PERF_INIT')
}
activateOrPerf.keepsScratchpad = true

// ───────────────────────── DEP/ARR ─────────────────────────

export function depArrIndexPage(): FmsPageDefinition {
  return {
    id: 'DEP_ARR_INDEX',
    title: 'DEP/ARR INDEX',
    render: (state) => {
      const plan = displayedPlan(state)
      return {
        title: { center: [span('DEP/ARR INDEX')] },
        rows: [
          row({ center: [small('RTE 1')] }, { left: [span(plan.origin ? '<DEP' : '')], center: [span(plan.origin ?? '')], right: [span(plan.origin ? 'ARR>' : '')] }),
          row({}, { center: [span(plan.destination ?? '')], right: [span(plan.destination ? 'ARR>' : '')] }),
          row(),
          row(),
          row(),
          row(),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (!draft.activeFlightPlan.origin && !draft.modifiedFlightPlan?.origin) return entryError('INVALID_ENTRY')
        ctx.openPage('DEPARTURES')
      },
    ],
    rightLskHandlers: [
      (draft, ctx) => {
        const plan = displayedPlan(draft as FmsState)
        if (!plan.origin) return entryError('INVALID_ENTRY')
        ctx.openPage('ARRIVALS', 1, { airport: plan.origin })
      },
      (draft, ctx) => {
        const plan = displayedPlan(draft as FmsState)
        if (!plan.destination) return entryError('INVALID_ENTRY')
        ctx.openPage('ARRIVALS', 1, { airport: plan.destination })
      },
    ],
  }
}

type ListItem =
  | { kind: 'PROC'; proc: Procedure }
  | { kind: 'TRANS'; name: string }
  | { kind: 'RWY'; ident: string }
  | { kind: 'HEADER'; text: string }

function selectedTag(selected: boolean, active: boolean): string {
  if (!selected) return ''
  return active ? '<ACT>' : '<SEL>'
}

function departureLists(state: FmsState, ap: Airport, nav: HandlerContext['nav']): { left: ListItem[]; right: ListItem[] } {
  const plan = displayedPlan(state)
  const sids = nav.getDepartures(ap.icao)
  const left: ListItem[] = []
  if (plan.sid) {
    const sel = sids.find((p) => p.id === plan.sid?.id)
    if (sel) {
      left.push({ kind: 'PROC', proc: sel })
      if (sel.transitions.length) {
        left.push({ kind: 'HEADER', text: 'TRANS' })
        const t = plan.sid.transition
        for (const tr of sel.transitions) if (!t || t === tr.name) left.push({ kind: 'TRANS', name: tr.name })
      }
    }
  } else {
    for (const p of sids) if (!plan.departureRunway || procedureRunways(p, ap).includes(plan.departureRunway)) left.push({ kind: 'PROC', proc: p })
  }
  const right: ListItem[] = []
  const sidProc = plan.sid ? sids.find((p) => p.id === plan.sid?.id) : undefined
  for (const r of ap.runways) {
    if (plan.departureRunway && plan.departureRunway !== r.ident) continue
    if (sidProc && !procedureRunways(sidProc, ap).includes(r.ident)) continue
    right.push({ kind: 'RWY', ident: r.ident })
  }
  return { left, right }
}

function arrivalLists(state: FmsState, ap: Airport, nav: HandlerContext['nav']): { left: ListItem[]; right: ListItem[] } {
  const plan = displayedPlan(state)
  const isDest = plan.destination === ap.icao
  const stars = nav.getArrivals(ap.icao)
  const apps = nav.getApproaches(ap.icao)
  const left: ListItem[] = []
  const selStar = isDest && plan.star ? stars.find((p) => p.id === plan.star?.id) : undefined
  const selApp = isDest && plan.approach ? apps.find((p) => p.id === plan.approach?.id) : undefined
  if (selStar) {
    left.push({ kind: 'PROC', proc: selStar })
    if (selStar.transitions.length) {
      left.push({ kind: 'HEADER', text: 'TRANS' })
      for (const tr of selStar.transitions) if (!plan.star?.transition || plan.star.transition === tr.name) left.push({ kind: 'TRANS', name: tr.name })
    }
  } else {
    for (const p of stars) if (!selApp || p.runways.some((r) => selApp.runways.includes(r))) left.push({ kind: 'PROC', proc: p })
  }
  const right: ListItem[] = []
  if (selApp) {
    right.push({ kind: 'PROC', proc: selApp })
    if (selApp.transitions.length) {
      right.push({ kind: 'HEADER', text: 'TRANS' })
      for (const tr of selApp.transitions) if (!plan.approach?.transition || plan.approach.transition === tr.name) right.push({ kind: 'TRANS', name: tr.name })
    }
  } else {
    for (const p of apps) if (!selStar || selStar.runways.length === 0 || p.runways.some((r) => selStar.runways.includes(r))) right.push({ kind: 'PROC', proc: p })
  }
  return { left, right }
}

function listPageCount(l: ListItem[], r: ListItem[]): number {
  return Math.max(1, Math.ceil(Math.max(l.length, r.length) / 5))
}

function renderList(
  state: FmsState,
  title: string,
  headers: [string, string],
  lists: { left: ListItem[]; right: ListItem[] },
  subPage: number,
  isSelected: (item: ListItem, side: 'L' | 'R') => boolean,
): ReturnType<FmsPageDefinition['render']> {
  const start = (subPage - 1) * 5
  const rows: FmsRow[] = []
  for (let i = 0; i < 5; i++) {
    const l = lists.left[start + i]
    const r = lists.right[start + i]
    const label = i === 0 ? { left: [small(headers[0])], center: [small('RTE 1')], right: [small(headers[1])] } : {}
    const fmt = (item: ListItem | undefined, side: 'L' | 'R'): string => {
      if (!item) return ''
      const tag = selectedTag(isSelected(item, side), !!state.activeFlightPlan.activated && !state.modifiedFlightPlan)
      const text = item.kind === 'PROC' ? item.proc.name : item.kind === 'TRANS' ? item.name : item.kind === 'RWY' ? item.ident : ''
      return side === 'L' ? `${text}${tag ? ` ${tag}` : ''}` : `${tag ? `${tag} ` : ''}${text}`
    }
    const headerL = l?.kind === 'HEADER'
    const headerR = r?.kind === 'HEADER'
    rows.push(
      row(
        headerL || headerR
          ? { left: headerL ? [small(' TRANS')] : label.left, right: headerR ? [small('TRANS ')] : label.right }
          : label,
        { left: headerL ? [] : [span(fmt(l, 'L'))], right: headerR ? [] : [span(fmt(r, 'R'))] },
      ),
    )
  }
  rows.push(eraseOr(state, '<INDEX', 'ROUTE>'))
  return { title: { center: [span(title)] }, rows }
}

export function departuresPage(): FmsPageDefinition {
  const airportOf = (state: FmsState, nav: HandlerContext['nav']): Airport | undefined => {
    const icao = displayedPlan(state).origin
    return icao ? nav.searchAirport(icao) : undefined
  }
  const select =
    (side: 'L' | 'R', r: number): LskHandler =>
    (draft, ctx) => {
      const ap = airportOf(draft as FmsState, ctx.nav)
      if (!ap) return entryError('INVALID_ENTRY')
      if (ctx.scratchpad && !ctx.deleteMode) return entryError('INVALID_ENTRY')
      const lists = departureLists(draft as FmsState, ap, ctx.nav)
      const item = (side === 'L' ? lists.left : lists.right)[(ctx.subPage - 1) * 5 + r - 1]
      if (!item || item.kind === 'HEADER') return
      const plan = displayedPlan(draft as FmsState)
      if (item.kind === 'PROC') {
        const deselect = plan.sid?.id === item.proc.id
        opSetProcedure(ctx, 'SID', deselect ? null : item.proc.id, undefined, 'DEPARTURE')
      } else if (item.kind === 'TRANS') {
        if (!plan.sid) return entryError('INVALID_ENTRY')
        const deselect = plan.sid.transition === item.name
        opSetProcedure(ctx, 'SID', plan.sid.id, deselect ? undefined : item.name, 'DEPARTURE')
      } else if (item.kind === 'RWY') {
        opSetDepartureRunway(ctx, item.ident, 'DEPARTURE')
      }
      draft.currentPage.subPage = 1
    }
  return {
    id: 'DEPARTURES',
    title: 'DEPARTURES',
    pageCount: (state, ctx) => {
      const ap = airportOf(state, ctx.nav)
      if (!ap) return 1
      const l = departureLists(state, ap, ctx.nav)
      return listPageCount(l.left, l.right)
    },
    render: (state, ctx) => {
      const ap = airportOf(state, ctx.nav)
      if (!ap) return { title: { center: [span('DEPARTURES')] }, rows: [] }
      const plan = displayedPlan(state)
      return renderList(state, `${ap.icao} DEPARTURES`, ['SIDS', 'RUNWAYS'], departureLists(state, ap, ctx.nav), ctx.subPage, (item) =>
        item.kind === 'PROC'
          ? plan.sid?.id === item.proc.id
          : item.kind === 'TRANS'
            ? plan.sid?.transition === item.name
            : item.kind === 'RWY'
              ? plan.departureRunway === item.ident
              : false,
      )
    },
    leftLskHandlers: [1, 2, 3, 4, 5].map((r) => select('L', r)).concat([eraseOrNavigate('DEP_ARR_INDEX')]),
    rightLskHandlers: [1, 2, 3, 4, 5].map((r) => select('R', r)).concat([goTo('RTE', 2)]),
  }
}

export function arrivalsPage(): FmsPageDefinition {
  const airportOf = (state: FmsState, nav: HandlerContext['nav']): Airport | undefined => {
    const icao = typeof state.currentPage.context.airport === 'string' ? state.currentPage.context.airport : displayedPlan(state).destination
    return icao ? nav.searchAirport(icao) : undefined
  }
  const select =
    (side: 'L' | 'R', r: number): LskHandler =>
    (draft, ctx) => {
      const ap = airportOf(draft as FmsState, ctx.nav)
      if (!ap) return entryError('INVALID_ENTRY')
      if (ctx.scratchpad && !ctx.deleteMode) return entryError('INVALID_ENTRY')
      const plan = displayedPlan(draft as FmsState)
      if (plan.destination !== ap.icao) return entryError('INVALID_ENTRY')
      const lists = arrivalLists(draft as FmsState, ap, ctx.nav)
      const item = (side === 'L' ? lists.left : lists.right)[(ctx.subPage - 1) * 5 + r - 1]
      if (!item || item.kind === 'HEADER') return
      if (side === 'L') {
        if (item.kind === 'PROC') opSetProcedure(ctx, 'STAR', plan.star?.id === item.proc.id ? null : item.proc.id, undefined, 'ARRIVAL')
        else if (item.kind === 'TRANS' && plan.star)
          opSetProcedure(ctx, 'STAR', plan.star.id, plan.star.transition === item.name ? undefined : item.name, 'ARRIVAL')
      } else {
        if (item.kind === 'PROC') opSetProcedure(ctx, 'APPROACH', plan.approach?.id === item.proc.id ? null : item.proc.id, undefined, 'ARRIVAL')
        else if (item.kind === 'TRANS' && plan.approach)
          opSetProcedure(ctx, 'APPROACH', plan.approach.id, plan.approach.transition === item.name ? undefined : item.name, 'ARRIVAL')
      }
      draft.currentPage.subPage = 1
    }
  return {
    id: 'ARRIVALS',
    title: 'ARRIVALS',
    pageCount: (state, ctx) => {
      const ap = airportOf(state, ctx.nav)
      if (!ap) return 1
      const l = arrivalLists(state, ap, ctx.nav)
      return listPageCount(l.left, l.right)
    },
    render: (state, ctx) => {
      const ap = airportOf(state, ctx.nav)
      if (!ap) return { title: { center: [span('ARRIVALS')] }, rows: [] }
      const plan = displayedPlan(state)
      return renderList(state, `${ap.icao} ARRIVALS`, ['STARS', 'APPROACHES'], arrivalLists(state, ap, ctx.nav), ctx.subPage, (item, side) => {
        if (side === 'L') return item.kind === 'PROC' ? plan.star?.id === item.proc.id : item.kind === 'TRANS' ? plan.star?.transition === item.name : false
        return item.kind === 'PROC' ? plan.approach?.id === item.proc.id : item.kind === 'TRANS' ? plan.approach?.transition === item.name : false
      })
    },
    leftLskHandlers: [1, 2, 3, 4, 5].map((r) => select('L', r)).concat([eraseOrNavigate('DEP_ARR_INDEX')]),
    rightLskHandlers: [1, 2, 3, 4, 5].map((r) => select('R', r)).concat([goTo('RTE', 2)]),
  }
}

