import {
  computeVnavProfile,
  cruiseFuelFlowKgH,
  displayedPlan,
  entryError,
  grossWeightKg,
  opSetCostIndex,
  opSetCruiseAltitude,
  opSetDestination,
  opSetOrigin,
  parseDecimal,
  parseFlightNumber,
  parseInteger,
  parseTemperatureC,
  parseWeightKg,
  requireAirport,
  row,
  span,
  splitSlash,
} from '@aerofms/core'
import type { FmsPageDefinition, FmsState, HandlerContext, LskHandler, RenderContext } from '@aerofms/core'
import { boxes, fmtFl, fmtHhmm, fmtLatLonAirbus, fmtWeight } from '../../common/format'
import { abTitle, goTo, label } from '../helpers'
import type { AirbusVariant } from '../variant'

const AB_BOX = (n: number): string => boxes(n)

/** Final reserve: 30 min holding at 1500 ft (training approximation). */
export function finalReserveKg(state: FmsState, ctx: RenderContext | HandlerContext, minutes = 30): number {
  const gw = grossWeightKg(state.performance) ?? ctx.perf.oewKg + 20000
  return Math.round((cruiseFuelFlowKgH(ctx.perf, gw * 0.85, 5000) * 0.75 * minutes) / 60 / 10) * 10
}

function fuelFigures(state: FmsState, ctx: RenderContext | HandlerContext) {
  const plan = displayedPlan(state)
  const prof = computeVnavProfile(plan, state.performance, ctx.perf, ctx.nav)
  const taxi = state.performance.taxiFuelKg ?? 200
  const trip = prof.tripFuelKg
  const rteRsv = trip !== undefined ? Math.round((trip * 0.05) / 10) * 10 : undefined
  const finalKg = finalReserveKg(state, ctx, Number(state.currentPage.context.finalTime ?? 30))
  const minDestFob = state.performance.reserveFuelKg ?? finalKg
  const block = state.performance.fuelKg
  const extra = block !== undefined && trip !== undefined ? block - taxi - trip - (rteRsv ?? 0) - minDestFob : undefined
  return { prof, taxi, trip, rteRsv, finalKg, minDestFob, block, extra }
}

export function initPage(v: AirbusVariant): FmsPageDefinition {
  const mfd = v.display === 'AIRBUS_MFD'
  const initA = (state: FmsState, ctx: RenderContext) => {
    const plan = displayedPlan(state)
    const p = state.performance
    const ref = plan.origin ? ctx.nav.searchAirport(plan.origin) : undefined
    const pos = state.position.irsPosition ?? (ref ? { lat: ref.lat, lon: ref.lon } : undefined)
    const ll = pos ? fmtLatLonAirbus(pos).split('/') : undefined
    return {
      title: abTitle(state, 'INIT', { mfd, mfdName: 'INIT' }),
      arrows: { right: state.flightPhase === 'PREFLIGHT' },
      rows: [
        row(label('CO RTE', 'FROM/TO  '), { left: [span(plan.companyRoute ?? AB_BOX(10), plan.companyRoute ? 'cyan' : 'amber')], right: [span(plan.origin && plan.destination ? `${plan.origin}/${plan.destination}` : `${AB_BOX(4)}/${AB_BOX(4)}`, plan.origin ? 'cyan' : 'amber')] }, { L: { fieldId: 'INIT.CO_RTE', explainKey: 'companyRoute' }, R: { fieldId: 'INIT.FROM_TO', explainKey: 'fromTo' } }),
        row(label('ALTN/CO RTE', 'INIT '), { left: [span(plan.alternate ? `${plan.alternate}/NONE` : '----/----------', plan.alternate ? 'cyan' : 'white')], right: [span(state.position.initialized ? '' : 'REQUEST*', 'amber')] }, { L: { fieldId: 'INIT.ALTN', explainKey: 'alternate' } }),
        row(label('FLT NBR'), { left: [span(plan.flightNumber ?? AB_BOX(8), plan.flightNumber ? 'cyan' : 'amber')], right: [span('IRS INIT>')] }, { L: { fieldId: 'INIT.FLT_NBR', explainKey: 'flightNumber' } }),
        row(label('LAT', 'LONG'), { left: [span(ll?.[0] ?? '----.--', 'cyan')], right: [span(ll?.[1] ?? '-----.--', 'cyan')] }),
        row(label('COST INDEX', 'WIND/TEMP'), { left: [span(p.costIndex !== undefined ? String(p.costIndex) : AB_BOX(3), p.costIndex !== undefined ? 'cyan' : 'amber')], right: [span(p.cruiseWindKt !== undefined ? `${String(p.cruiseWindDir ?? 0).padStart(3, '0')}°/${String(p.cruiseWindKt).padStart(3, '0')}` : '---°/---', 'cyan')] }, { L: { fieldId: 'INIT.COST_INDEX', explainKey: 'costIndex' }, R: { fieldId: 'INIT.WIND', explainKey: 'cruiseWind' } }),
        row(label('CRZ FL/TEMP', 'TROPO'), { left: [span(p.cruiseAltitudeFt ? `${fmtFl(p.cruiseAltitudeFt)}/${p.isaDevC !== undefined ? `${Math.round(15 - 1.98 * Math.min(36089, p.cruiseAltitudeFt) / 1000 + p.isaDevC)}°` : '---°'}` : `${AB_BOX(5)}/---°`, p.cruiseAltitudeFt ? 'cyan' : 'amber')], right: [span('36090', 'cyan', 'S')] }, { L: { fieldId: 'INIT.CRZ_FL', explainKey: 'cruiseAltitude' } }),
      ],
    }
  }

  const initB = (state: FmsState, ctx: RenderContext) => {
    const p = state.performance
    const f = fuelFigures(state, ctx)
    const gw = grossWeightKg(p)
    const tow = gw !== undefined ? gw - f.taxi : undefined
    const lw = tow !== undefined && f.trip !== undefined ? tow - f.trip : undefined
    const t = (min: number | undefined): string => (min === undefined ? '----' : `${String(Math.floor(min / 60)).padStart(2, '0')}${String(Math.round(min % 60)).padStart(2, '0')}`)
    return {
      title: abTitle(state, 'INIT', { mfd, mfdName: 'FUEL&LOAD' }),
      arrows: { left: true },
      rows: [
        row(label('TAXI', 'ZFW/ZFWCG'), { left: [span(fmtWeight(f.taxi), 'cyan', p.taxiFuelKg ? 'L' : 'S')], right: [span(p.zfwKg !== undefined ? `${fmtWeight(p.zfwKg)}/${(p.zfwCgPercent ?? v.defaultZfwCg).toFixed(1)}` : `${AB_BOX(4)}/${AB_BOX(4)}`, p.zfwKg ? 'cyan' : 'amber')] }, { L: { fieldId: 'INIT_B.TAXI', explainKey: 'taxiFuel' }, R: { fieldId: 'INIT_B.ZFW', explainKey: 'zfw' } }),
        row(label('TRIP/TIME', 'BLOCK'), { left: [span(f.trip !== undefined ? `${fmtWeight(f.trip)}/${t(f.prof.tripTimeMin)}` : '---.-/----', 'green')], right: [span(f.block !== undefined ? fmtWeight(f.block) : AB_BOX(4), f.block !== undefined ? 'cyan' : 'amber')] }, { R: { fieldId: 'INIT_B.BLOCK', explainKey: 'blockFuel' } }),
        row(label('RTE RSV/%'), { left: [span(f.rteRsv !== undefined ? `${fmtWeight(f.rteRsv)}/5.0` : '---.-/5.0', 'cyan', 'S')] }),
        row(label('ALTN/TIME', 'TOW/LW'), { left: [span('---.-/----')], right: [span(tow !== undefined ? `${fmtWeight(tow)}/${lw !== undefined ? fmtWeight(lw) : '---.-'}` : '---.-/---.-', 'green')] }),
        row(label('FINAL/TIME', 'TRIP WIND'), { left: [span(`${fmtWeight(f.finalKg)}/${String(state.currentPage.context.finalTime ?? 30).padStart(4, '0')}`, 'cyan', 'S')], right: [span(`HD${String(p.cruiseWindKt ?? 0).padStart(3, '0')}`, 'cyan')] }, { L: { fieldId: 'INIT_B.FINAL', explainKey: 'finalReserve' } }),
        row(label('MIN DEST FOB', 'EXTRA/TIME'), { left: [span(fmtWeight(f.minDestFob), 'cyan', p.reserveFuelKg !== undefined ? 'L' : 'S')], right: [span(f.extra !== undefined ? `${fmtWeight(f.extra)}/${t(f.extra / (ctx.perf.fuelFlow.cruiseKgH / 60))}` : '---.-/----', 'green')] }, { L: { fieldId: 'INIT_B.MIN_DEST_FOB', explainKey: 'reserves' } }),
      ],
    }
  }

  const sub = (ctx: HandlerContext): number => ctx.subPage

  const left: Array<LskHandler | undefined> = [
    (draft, ctx) => {
      if (sub(ctx) === 2) {
        if (ctx.deleteMode) {
          draft.performance.taxiFuelKg = undefined
          return
        }
        const kg = parseWeightKg(ctx.scratchpad, 0, 2000)
        if (kg === undefined) return entryError('ENTRY_OUT_OF_RANGE')
        draft.performance.taxiFuelKg = kg
        return
      }
      if (ctx.deleteMode) return entryError('NOT_ALLOWED')
      entryError('NOT_IN_DATABASE')
    },
    (_draft, ctx) => {
      if (sub(ctx) === 2) return entryError('NOT_ALLOWED')
      const plan = ctx.editPlan('ROUTE')
      if (ctx.deleteMode) {
        plan.alternate = undefined
        return
      }
      const [altn] = splitSlash(ctx.scratchpad)
      const ap = requireAirport(ctx, altn ?? '')
      plan.alternate = ap.icao
      ctx.fieldChanged('ALTN', ap.icao)
    },
    (_draft, ctx) => {
      if (sub(ctx) === 2) return entryError('NOT_ALLOWED')
      const plan = ctx.editPlan('ROUTE')
      if (ctx.deleteMode) {
        plan.flightNumber = undefined
        return
      }
      const fn = parseFlightNumber(ctx.scratchpad)
      if (!fn) return entryError('FORMAT_ERROR')
      plan.flightNumber = fn
      ctx.fieldChanged('FLT_NBR', fn)
    },
    undefined,
    (draft, ctx) => {
      if (sub(ctx) === 2) {
        const m = parseInteger(ctx.scratchpad.replace('/', ''), 0, 90)
        if (m === undefined) return entryError('ENTRY_OUT_OF_RANGE')
        draft.currentPage.context.finalTime = m
        return
      }
      if (ctx.deleteMode) {
        draft.performance.costIndex = undefined
        return
      }
      opSetCostIndex(draft, ctx, ctx.scratchpad)
    },
    (draft, ctx) => {
      if (sub(ctx) === 2) {
        if (ctx.deleteMode) {
          draft.performance.reserveFuelKg = undefined
          return
        }
        const kg = parseWeightKg(ctx.scratchpad, 0, ctx.perf.maxFuelKg / 2)
        if (kg === undefined) return entryError('ENTRY_OUT_OF_RANGE')
        draft.performance.reserveFuelKg = kg
        ctx.fieldChanged('MIN_DEST_FOB', kg)
        return
      }
      if (ctx.deleteMode) return entryError('NOT_ALLOWED')
      const [fl, temp] = splitSlash(ctx.scratchpad)
      if (fl !== undefined) opSetCruiseAltitude(draft, ctx, fl)
      if (temp !== undefined) {
        const t = parseTemperatureC(temp, -80, 20)
        if (t === undefined || draft.performance.cruiseAltitudeFt === undefined) return entryError('ENTRY_OUT_OF_RANGE')
        draft.performance.isaDevC = Math.round(t - (15 - 1.98 * Math.min(36089, draft.performance.cruiseAltitudeFt) / 1000))
      }
    },
  ]

  const right: Array<LskHandler | undefined> = [
    (draft, ctx) => {
      if (sub(ctx) === 2) {
        if (ctx.deleteMode) return entryError('NOT_ALLOWED')
        const [zfw, cg] = splitSlash(ctx.scratchpad)
        if (zfw !== undefined) {
          const kg = parseWeightKg(zfw, ctx.perf.oewKg, ctx.perf.mzfwKg * 1.05)
          if (kg === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          draft.performance.zfwKg = kg
          ctx.fieldChanged('ZFW', kg)
        }
        if (cg !== undefined) {
          const c = parseDecimal(cg, 8, 45)
          if (c === undefined) return entryError('ENTRY_OUT_OF_RANGE')
          draft.performance.zfwCgPercent = c
        } else if (draft.performance.zfwCgPercent === undefined) draft.performance.zfwCgPercent = v.defaultZfwCg
        return
      }
      if (ctx.deleteMode) return entryError('NOT_ALLOWED')
      const [from, to] = splitSlash(ctx.scratchpad)
      if (!from || !to) return entryError('FORMAT_ERROR')
      opSetOrigin(draft, ctx, from)
      opSetDestination(draft, ctx, to)
      const ap = ctx.nav.searchAirport(from)
      if (ap) draft.position.refAirport = ap.icao
    },
    (draft, ctx) => {
      if (sub(ctx) === 2) {
        if (ctx.deleteMode) return entryError('NOT_ALLOWED')
        const kg = parseWeightKg(ctx.scratchpad, 0, ctx.perf.maxFuelKg)
        if (kg === undefined) return entryError('ENTRY_OUT_OF_RANGE')
        draft.performance.fuelKg = kg
        if (draft.simulation.status === 'IDLE') draft.simulation.fuelKg = kg
        ctx.fieldChanged('BLOCK', kg)
        return
      }
      // INIT REQUEST*: datalink not simulated – align IRS on the airport reference instead.
      if (draft.position.initialized) return
      const origin = displayedPlan(draft as FmsState).origin
      if (!origin) return entryError('NOT_ALLOWED')
      const ap = requireAirport(ctx, origin)
      draft.position.irsPosition = { lat: ap.lat, lon: ap.lon }
      draft.position.initialized = true
      if (draft.simulation.status === 'IDLE') draft.position.aircraft = { lat: ap.lat, lon: ap.lon }
      ctx.fieldChanged('IRS_ALIGN', ap.icao)
    },
    (_draft, ctx) => {
      if (sub(ctx) === 2) return entryError('NOT_ALLOWED')
      if (ctx.scratchpad) return entryError('NOT_ALLOWED')
      ctx.openPage('IRS_INIT')
    },
    undefined,
    (draft, ctx) => {
      if (sub(ctx) === 2) {
        const m = /^(HD|TL)?(\d{1,3})$/.exec(ctx.scratchpad)
        if (!m) return entryError('FORMAT_ERROR')
        draft.performance.cruiseWindKt = Number(m[2]) * (m[1] === 'TL' ? -1 : 1)
        return
      }
      const w = /^(\d{1,3})\/(\d{1,3})$/.exec(ctx.scratchpad)
      if (!w) return entryError('FORMAT_ERROR')
      draft.performance.cruiseWindDir = Number(w[1]) % 360
      draft.performance.cruiseWindKt = Number(w[2])
    },
    undefined,
  ]

  return {
    id: 'INIT',
    title: 'INIT',
    pageCount: (state) => (state.flightPhase === 'PREFLIGHT' ? 2 : 1),
    render: (state, ctx) => (ctx.subPage === 2 ? initB(state, ctx) : initA(state, ctx)),
    leftLskHandlers: left,
    rightLskHandlers: right,
  }
}

export function irsInitPage(v: AirbusVariant): FmsPageDefinition {
  return {
    id: 'IRS_INIT',
    title: 'IRS INIT',
    render: (state, ctx) => {
      const plan = displayedPlan(state)
      const ref = plan.origin ? ctx.nav.searchAirport(plan.origin) : undefined
      const ll = ref ? fmtLatLonAirbus(ref).split('/') : undefined
      const st = state.position.initialized ? 'ALIGNED' : 'ALIGN'
      return {
        title: abTitle(state, 'IRS INIT', { mfd: v.display === 'AIRBUS_MFD', mfdName: 'IRS' }),
        rows: [
          row(label('REFERENCE', 'GPS POSITION'), { left: [span(ref ? `${ref.icao}` : '----', 'green')], right: [span(ref ? `${ll?.[0]}` : '', 'green')] }),
          row(label('LAT', 'LONG'), { left: [span(ll?.[0] ?? '----', 'cyan')], right: [span(ll?.[1] ?? '----', 'cyan')] }),
          row(label('IRS1'), { left: [span(`${st} ON REF`, state.position.initialized ? 'green' : 'white')] }),
          row(label('IRS2'), { left: [span(`${st} ON REF`, state.position.initialized ? 'green' : 'white')] }),
          row(label('IRS3'), { left: [span(`${st} ON REF`, state.position.initialized ? 'green' : 'white')] }),
          row({}, { left: [span('<RETURN')], right: [span(state.position.initialized ? '' : 'ALIGN ON REF*', 'amber')] }),
        ],
      }
    },
    leftLskHandlers: [undefined, undefined, undefined, undefined, undefined, goTo('INIT')],
    rightLskHandlers: [
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (draft, ctx) => {
        const origin = displayedPlan(draft as FmsState).origin
        if (!origin) return entryError('NOT_ALLOWED')
        const ap = requireAirport(ctx, origin)
        draft.position.irsPosition = { lat: ap.lat, lon: ap.lon }
        draft.position.refAirport = ap.icao
        draft.position.initialized = true
        if (draft.simulation.status === 'IDLE') draft.position.aircraft = { lat: ap.lat, lon: ap.lon }
        ctx.fieldChanged('IRS_ALIGN', ap.icao)
      },
    ],
  }
}

export function fuelPredPage(v: AirbusVariant): FmsPageDefinition {
  return {
    id: 'FUEL_PRED',
    title: 'FUEL PRED',
    render: (state, ctx) => {
      const plan = displayedPlan(state)
      const f = fuelFigures(state, ctx)
      const gw = grossWeightKg(state.performance)
      const fob = state.simulation.status === 'IDLE' ? state.performance.fuelKg : state.simulation.fuelKg
      const destEfob = f.prof.destinationFuelKg !== undefined && state.simulation.status !== 'IDLE' && state.performance.fuelKg !== undefined
        ? f.prof.destinationFuelKg - (state.performance.fuelKg - state.simulation.fuelKg)
        : f.prof.destinationFuelKg
      const utc = f.prof.valid ? fmtHhmm(state.simulation.simTimeMs + f.prof.tripTimeMin * 60000) : '----'
      return {
        title: abTitle(state, 'FUEL PRED', { mfd: v.display === 'AIRBUS_MFD', mfdName: 'FUEL&LOAD' }),
        rows: [
          row(label('AT', 'EFOB', 'UTC'), { left: [span(plan.destination ?? '----', 'green')], center: [span(utc, 'green')], right: [span(destEfob !== undefined ? fmtWeight(destEfob) : '---.-', destEfob !== undefined && destEfob < f.minDestFob ? 'amber' : 'green')] }),
          row({}, { left: [span(plan.alternate ?? '----', 'green')], right: [span('---.-', 'green')] }),
          row(label('', 'GW/CG'), { right: [span(gw !== undefined ? `${fmtWeight(gw)}/${(state.performance.zfwCgPercent ?? v.defaultZfwCg).toFixed(1)}` : '---.-/--.-', 'green')] }),
          row(label('RTE RSV/%', 'FOB'), { left: [span(f.rteRsv !== undefined ? `${fmtWeight(f.rteRsv)}/5.0` : '---.-/5.0', 'cyan')], right: [span(fob !== undefined ? fmtWeight(fob) : '---.-', 'green')] }),
          row(label('FINAL/TIME', 'CRZTEMP'), { left: [span(`${fmtWeight(f.finalKg)}/0030`, 'cyan')], right: [span(state.performance.cruiseAltitudeFt ? `${Math.round(15 - 1.98 * Math.min(36089, state.performance.cruiseAltitudeFt) / 1000 + (state.performance.isaDevC ?? 0))}°` : '---°', 'cyan')] }),
          row(label('MIN DEST FOB', 'EXTRA/TIME'), { left: [span(fmtWeight(f.minDestFob), 'cyan')], right: [span(f.extra !== undefined ? `${fmtWeight(f.extra)}` : '---.-', 'green')] }),
        ],
      }
    },
    leftLskHandlers: [undefined, undefined, undefined, undefined, undefined, (draft, ctx) => {
      if (ctx.deleteMode) {
        draft.performance.reserveFuelKg = undefined
        return
      }
      const kg = parseWeightKg(ctx.scratchpad, 0, ctx.perf.maxFuelKg / 2)
      if (kg === undefined) return entryError('ENTRY_OUT_OF_RANGE')
      draft.performance.reserveFuelKg = kg
    }],
    rightLskHandlers: [],
  }
}

/** Shared DATA INDEX / A/C STATUS / POSITION MONITOR pages. */
export function dataPages(v: AirbusVariant): FmsPageDefinition[] {
  const mfd = v.display === 'AIRBUS_MFD'
  return [
    {
      id: 'DATA_INDEX',
      title: 'DATA INDEX',
      render: (state) => ({
        title: abTitle(state, 'DATA INDEX', { mfd, mfdName: 'DATA' }),
        rows: [
          row(label('POSITION'), { left: [span('<MONITOR')], right: [span('WAYPOINTS>')] }),
          row(label('IRS'), { left: [span('<MONITOR')], right: [span('NAVAIDS>')] }),
          row(label(), { left: [span('<A/C STATUS')], right: [span('RUNWAYS>')] }),
          row(),
          row(),
          row(),
        ],
      }),
      leftLskHandlers: [goTo('POSITION_MONITOR'), goTo('IRS_INIT'), goTo('AC_STATUS')],
      rightLskHandlers: [goTo('NAV_LOOKUP', 1, { kind: 'WPT' }), goTo('NAV_LOOKUP', 1, { kind: 'NAVAID' }), goTo('NAV_LOOKUP', 1, { kind: 'RWY' })],
    },
    {
      id: 'AC_STATUS',
      title: 'A/C STATUS',
      render: (state, ctx) => ({
        title: abTitle(state, v.definition.model, { mfd, mfdName: 'STATUS' }),
        rows: [
          row(label('ENG'), { left: [span(v.engineLabel, 'green')] }),
          row(label('ACTIVE NAV DATA BASE'), { left: [span(state.navigation.navDbCycle, 'cyan')] }),
          row(label('SECOND NAV DATA BASE'), { left: [span('NONE', 'cyan')] }),
          row(label('CHG CODE', 'IDLE/PERF'), { left: [span('[ ]', 'cyan')], right: [span('+0.0/+0.0', 'green')] }),
          row(label('OPT FL / MAX FL'), { left: [span((() => {
            const gw = grossWeightKg(state.performance)
            return gw !== undefined ? `${fmtFl(Math.min(ctx.perf.maxCertifiedAltitudeFt, ctx.perf.optimumAltitude.heavyAltFt))}/${fmtFl(ctx.perf.maxCertifiedAltitudeFt)}` : `---/${fmtFl(ctx.perf.maxCertifiedAltitudeFt)}`
          })(), 'green')] }),
          row({}, { left: [span('<RETURN')] }),
        ],
      }),
      leftLskHandlers: [undefined, undefined, undefined, undefined, undefined, goTo('DATA_INDEX')],
      rightLskHandlers: [],
    },
    {
      id: 'POSITION_MONITOR',
      title: 'POSITION MONITOR',
      render: (state) => {
        const p = state.position.aircraft
        const s = p ? fmtLatLonAirbus(p) : '----.--/-----.--'
        return {
          title: abTitle(state, 'POSITION MONITOR', { mfd, mfdName: 'POSITION' }),
          rows: [
            row(label('FMGC1'), { left: [span(s, 'green')] }),
            row(label('FMGC2'), { left: [span(s, 'green')] }),
            row(label('GPIRS'), { left: [span(s, 'green')] }),
            row(label('MIX IRS'), { left: [span(state.position.initialized ? s : '----', 'green')] }),
            row(label('IRS1   IRS2   IRS3'), { left: [span(state.position.initialized ? 'NAV    NAV    NAV' : 'ALIGN  ALIGN  ALIGN', 'green')] }),
            row({}, { left: [span('<RETURN')] }),
          ],
        }
      },
      leftLskHandlers: [undefined, undefined, undefined, undefined, undefined, goTo('DATA_INDEX')],
      rightLskHandlers: [],
    },
    {
      id: 'NAV_LOOKUP',
      title: 'DATA LOOKUP',
      render: (state, ctx) => {
        const kind = String(state.currentPage.context.kind ?? 'WPT')
        const ident = typeof state.currentPage.context.ident === 'string' ? state.currentPage.context.ident : undefined
        const titleText = kind === 'NAVAID' ? 'NAVAID' : kind === 'RWY' ? 'RUNWAY' : 'WAYPOINT'
        let rows = [row(label('IDENT'), { left: [span(ident ?? boxes(kind === 'RWY' ? 7 : 5), ident ? 'cyan' : 'amber')] })]
        if (ident && kind === 'RWY') {
          const ap = ctx.nav.searchAirport(ident.slice(0, 4))
          const rw = ap?.runways.find((r) => r.ident === ident.slice(4).replace(/^RW/, ''))
          if (rw) {
            rows = rows.concat([
              row(label('LAT/LONG'), { left: [span(fmtLatLonAirbus(rw), 'green')] }),
              row(label('LENGTH', 'CRS'), { left: [span(`${Math.round(rw.lengthFt * 0.3048)}M`, 'green')], right: [span(`${String(rw.headingMag).padStart(3, '0')}°`, 'green')] }),
              row(label('ELV', 'LS IDENT/FREQ'), { left: [span(`${rw.elevationFt}`, 'green')], right: [span(rw.ilsFrequency ? rw.ilsFrequency.toFixed(2) : '---', 'green')] }),
            ])
          }
        } else if (ident) {
          const w = kind === 'NAVAID' ? ctx.nav.getNavaid(ident) : ctx.nav.findWaypoint(ident)
          if (w) {
            rows = rows.concat([
              row(label('LAT/LONG'), { left: [span(fmtLatLonAirbus(w), 'green')] }),
              row(label(kind === 'NAVAID' ? 'FREQ' : 'TYPE', 'AIRWAYS'), { left: [span(w.frequency ? w.frequency.toFixed(w.type === 'NDB' ? 0 : 2) : w.type, 'green')], right: [span(ctx.nav.airwaysThrough(w.ident).join(' ').slice(0, 12), 'green')] }),
            ])
          }
        }
        while (rows.length < 5) rows.push(row())
        rows.push(row({}, { left: [span('<RETURN')] }))
        return { title: abTitle(state, titleText, { mfd, mfdName: 'DATA' }), rows }
      },
      leftLskHandlers: [
        (draft, ctx) => {
          if (!ctx.scratchpad) return entryError('FORMAT_ERROR')
          const kind = String(draft.currentPage.context.kind ?? 'WPT')
          const s = ctx.scratchpad
          const ok =
            kind === 'RWY'
              ? !!ctx.nav.getRunway(s.slice(0, 4), s.slice(4))
              : kind === 'NAVAID'
                ? !!ctx.nav.getNavaid(s)
                : !!ctx.nav.findWaypoint(s)
          if (!ok) return entryError('NOT_IN_DATABASE')
          draft.currentPage.context.ident = s
        },
        undefined,
        undefined,
        undefined,
        undefined,
        goTo('DATA_INDEX'),
      ],
      rightLskHandlers: [],
    },
  ]
}
