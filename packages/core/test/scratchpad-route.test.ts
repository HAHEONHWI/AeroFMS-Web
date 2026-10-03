import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { buildDemoDataset, InMemoryNavigationProvider } from '@aerofms/navigation'
import {
  appendChar,
  appendRouteEntry,
  clearShort,
  createEmptyFlightPlan,
  createInitialFmsState,
  deleteElement,
  deriveRouteEntries,
  directTo,
  expandAirway,
  finalizePlan,
  plusMinus,
  setDestinationLeg,
  setOrigin,
} from '../src'
import type { FlightPlan } from '@aerofms/shared'

const nav = new InMemoryNavigationProvider(buildDemoDataset())
let n = 0
const ids = () => `id${n++}`

function base() {
  return createInitialFmsState({
    aircraft: { aircraftId: 'X', adapterId: 'X', manufacturer: 'BOEING', model: 'X', fmsType: 'X', engine: 'X' },
    sessionId: 's',
    name: 's',
    now: 0,
    nav,
    defaultPageId: 'IDENT',
  })
}

describe('scratchpad', () => {
  it('appends, clears, toggles sign and handles delete token', () => {
    let s = base()
    s = produce(s, (d) => {
      appendChar(d, 'A')
      appendChar(d, 'B')
    })
    expect(s.scratchpad.text).toBe('AB')
    s = produce(s, (d) => clearShort(d, { emptyClearCreatesDeleteToken: true }))
    expect(s.scratchpad.text).toBe('A')
    s = produce(s, (d) => {
      clearShort(d, { emptyClearCreatesDeleteToken: true })
      clearShort(d, { emptyClearCreatesDeleteToken: true })
    })
    expect(s.scratchpad.deleteMode).toBe(true)
    s = produce(s, (d) => appendChar(d, '5'))
    expect(s.scratchpad).toMatchObject({ text: '5', deleteMode: false })
    s = produce(s, (d) => {
      plusMinus(d)
      plusMinus(d)
    })
    expect(s.scratchpad.text).toBe('5+')
  })
})

describe('route engine', () => {
  function plan(): FlightPlan {
    const p = createEmptyFlightPlan('p', 0)
    setOrigin(p, nav.searchAirport('RKSI')!, ids)
    setDestinationLeg(p, nav.searchAirport('RKPK')!, ids)
    finalizePlan(p, 0)
    return p
  }

  it('expands airways in both directions', () => {
    expect(expandAirway(nav, 'Y722', 'OSN', 'TOPAX').map((w) => w.ident)).toEqual(['SOSDO', 'MAKET', 'TOPAX'])
    expect(expandAirway(nav, 'Y722', 'KALOD', 'SOSDO').map((w) => w.ident)).toEqual(['TOPAX', 'MAKET', 'SOSDO'])
    expect(() => expandAirway(nav, 'Y722', 'BULTI', 'OSN')).toThrow()
  })

  it('keeps a real discontinuity element until closed and derives RTE rows', () => {
    const p = plan()
    appendRouteEntry(p, { nav, ids }, 'DIRECT', nav.findWaypoint('BULTI')!)
    appendRouteEntry(p, { nav, ids }, 'Y711', nav.findWaypoint('OSN')!)
    finalizePlan(p, 0)
    expect(p.elements.map((e) => (e.kind === 'LEG' ? e.waypoint.ident : 'DISCO'))).toEqual(['RKSI', 'BULTI', 'NODLI', 'OSN', 'DISCO', 'RKPK'])
    expect(deriveRouteEntries(p).map((e) => `${e.via} ${e.to}`)).toEqual(['DIRECT BULTI', 'Y711 OSN'])
    // Geometry: distance is not computed across the discontinuity
    const rkpk = p.elements[5]
    expect(rkpk?.kind === 'LEG' && rkpk.calculatedDistance).toBeUndefined()
    deleteElement(p, ids, 2, { allowDiscontinuityDelete: false })
    finalizePlan(p, 0)
    expect(p.elements.map((e) => (e.kind === 'LEG' ? e.waypoint.ident : 'DISCO'))).toEqual(['RKSI', 'BULTI', 'DISCO', 'OSN', 'DISCO', 'RKPK'])
  })

  it('direct-to skips legs and inserts a turn point at present position', () => {
    const p = plan()
    appendRouteEntry(p, { nav, ids }, 'DIRECT', nav.findWaypoint('BULTI')!)
    appendRouteEntry(p, { nav, ids }, 'Y711', nav.findWaypoint('OSN')!)
    finalizePlan(p, 0)
    directTo(p, ids, { index: 3 }, { lat: 37.4, lon: 126.6 }, 'T-P')
    finalizePlan(p, 0)
    const active = p.elements[p.activeLegIndex]
    expect(active?.kind === 'LEG' && active.waypoint.ident).toBe('OSN')
    expect(p.elements.map((e) => (e.kind === 'LEG' ? e.waypoint.ident : 'DISCO')).slice(0, 3)).toEqual(['RKSI', 'T-P', 'OSN'])
  })
})
