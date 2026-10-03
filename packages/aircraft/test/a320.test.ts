import { describe, expect, it } from 'vitest'
import { Pilot } from './harness'

const clearAll = (p: Pilot) => p.dispatch({ type: 'KEY_LONG', key: 'CLR' })

function lineIndexOf(p: Pilot, re: RegExp): number {
  return p.screen().findIndex((l, i) => i > 0 && i % 2 === 0 && i < 12 && re.test(l))
}

/** Scrolls the F-PLN (↑) until a line matches. */
function scrollTo(p: Pilot, re: RegExp): number {
  let idx = lineIndexOf(p, re)
  for (let i = 0; idx < 0 && i < 40; i++) {
    p.key('UP')
    idx = lineIndexOf(p, re)
  }
  return idx
}

describe('Airbus A320neo MCDU', () => {
  it('uses CLR token, FORMAT ERROR / NOT IN DATABASE messages', () => {
    const p = new Pilot('A320-NEO')
    expect(p.state.currentPage.pageId).toBe('MCDU_MENU')
    p.key('INIT')
    p.enter('RKSS', '1R') // missing "/"
    expect(p.scratchpad).toBe('FORMAT ERROR')
    clearAll(p)
    p.enter('RKSS/ZZZZ', '1R')
    expect(p.scratchpad).toBe('NOT IN DATABASE')
    clearAll(p)
    p.key('CLR')
    expect(p.scratchpad).toBe('CLR')
  })

  it('programs RKSS → RJTT with departure, airways, arrival through the TEMPORARY flight plan', () => {
    const p = new Pilot('A320-NEO')
    p.key('INIT')
    p.enter('RKSS/RJTT', '1R')
    expect(p.state.activeFlightPlan.origin).toBe('RKSS')
    expect(p.state.activeFlightPlan.destination).toBe('RJTT')
    p.enter('JJA1203', '3L')
    p.enter('25', '5L')
    p.enter('FL370', '6L')
    expect(p.state.performance.cruiseAltitudeFt).toBe(37000)
    p.lsk('3R') // IRS INIT
    p.lsk('6R') // ALIGN ON REF
    expect(p.state.position.initialized).toBe(true)

    // F-PLN → LAT REV at origin → DEPARTURE
    p.key('F_PLN')
    expect(p.screen()[2]).toContain('RKSS')
    p.lsk('1L')
    expect(p.state.currentPage.pageId).toBe('LAT_REV')
    p.lsk('1L')
    expect(p.state.currentPage.pageId).toBe('AB_DEPARTURES')
    const rw = lineIndexOf(p, /<32R/)
    p.lsk(`${rw / 2}L` as '2L')
    expect(p.state.modifiedFlightPlan?.departureRunway).toBe('32R')
    expect(p.state.activeFlightPlan.departureRunway).toBeUndefined() // still temporary
    expect(p.screen()[12]).toContain('INSERT*')
    const sid = lineIndexOf(p, /<OSN1E/)
    p.lsk(`${sid / 2}L` as '2L')
    expect(p.state.modifiedFlightPlan?.sid?.name).toBe('OSN1E')
    p.lsk('6R') // INSERT*
    expect(p.state.modifiedFlightPlan).toBeUndefined()
    expect(p.state.activeFlightPlan.sid?.name).toBe('OSN1E')

    // LAT REV at OSN → AIRWAYS Y722 TOPAX, G597 MIHOU, Y20 CREAM
    p.key('F_PLN')
    const osn = scrollTo(p, /^OSN/)
    expect(osn).toBeGreaterThan(0)
    p.lsk(`${osn / 2}L` as '1L')
    p.lsk('5R')
    expect(p.state.currentPage.pageId).toBe('AIRWAYS')
    p.enter('Y722', '1L')
    p.enter('TOPAX', '1R')
    p.enter('G597', '2L')
    p.enter('MIHOU', '2R')
    p.enter('Y20', '3L')
    p.enter('CREAM', '3R')
    p.enter('Y711', '4L')
    expect(p.scratchpad).toBe('NO INTERSECTION FOUND')
    clearAll(p)
    p.lsk('6R')
    const legs = p.legIdents()
    expect(legs.slice(legs.indexOf('OSN'), legs.indexOf('CREAM') + 1)).toEqual([
      'OSN', 'SOSDO', 'MAKET', 'TOPAX', 'ANDOL', 'LANAT', 'GOKUR', 'MIHOU', 'SHTLE', 'TAITO', 'OSHMA', 'CREAM',
    ])
    expect(legs).toContain('--DISCO--')

    // LAT REV at destination → ARRIVAL: approach, via, STAR
    p.key('AIRPORT')
    const dest = lineIndexOf(p, /^RJTT/)
    p.lsk(`${dest / 2}L` as '1L')
    expect(p.state.currentPage.pageId).toBe('LAT_REV')
    p.lsk('1R')
    expect(p.state.currentPage.pageId).toBe('AB_ARRIVALS')
    p.lsk(`${lineIndexOf(p, /<ILS34R/) / 2}L` as '2L')
    p.lsk(`${lineIndexOf(p, /<UMUKI/) / 2}L` as '2L')
    p.lsk(`${lineIndexOf(p, /<CREAM1A/) / 2}L` as '2L')
    expect(p.state.modifiedFlightPlan?.approach?.name).toBe('ILS34R')
    expect(p.state.modifiedFlightPlan?.star?.name).toBe('CREAM1A')
    p.lsk('6R')
    const final = p.legIdents()
    expect(final).toContain('RW34R')
    // CREAM1A starts at CREAM, so the airway joins the arrival without a discontinuity.
    expect(final).not.toContain('--DISCO--')
    expect(final.indexOf('CREAM')).toBeLessThan(final.indexOf('UMUKI'))

    // CLR on a waypoint replaces it with a discontinuity (direct edit, no TMPY); CLR on the discontinuity removes it.
    p.key('F_PLN')
    const taito = scrollTo(p, /^TAITO/)
    p.key('CLR')
    p.lsk(`${taito / 2}L` as '1L')
    expect(p.state.modifiedFlightPlan).toBeUndefined()
    expect(p.legIdents()).not.toContain('TAITO')
    expect(p.legIdents()).toContain('--DISCO--')
    const disco = scrollTo(p, /DISCONTINUITY/)
    p.key('CLR')
    p.lsk(`${disco / 2}L` as '1L')
    expect(p.legIdents()).not.toContain('--DISCO--')
  })

  it('DIR TO creates a temporary plan and INSERT activates it', () => {
    const p = new Pilot('A320-NEO')
    p.key('INIT')
    p.enter('RKSS/RKPK', '1R')
    p.dispatch({ type: 'COMMAND', command: { kind: 'APPEND_ROUTE', via: 'DIRECT', to: 'OSN' } })
    p.dispatch({ type: 'COMMAND', command: { kind: 'APPEND_ROUTE', via: 'Y722', to: 'KALOD' } })
    p.key('DIR')
    p.enter('TOPAX', '1L')
    expect(p.state.modifiedFlightPlan).toBeDefined()
    expect(p.legIdents('mod')).toContain('T-P')
    p.lsk('6R')
    const plan = p.state.activeFlightPlan
    const active = plan.elements[plan.activeLegIndex]
    expect(active?.kind === 'LEG' && active.waypoint.ident).toBe('TOPAX')
  })
})
