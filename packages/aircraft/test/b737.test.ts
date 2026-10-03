import { describe, expect, it } from 'vitest'
import { Pilot } from './harness'

function programRksiRkpk(p: Pilot) {
  p.key('INIT_REF')
  expect(p.state.currentPage.pageId).toBe('POS_INIT')
  p.enter('RKSI', '2L')
  expect(p.state.position.refAirport).toBe('RKSI')
  p.lsk('2R') // copy airport position to scratchpad
  expect(p.scratchpad).toMatch(/^N37/)
  p.lsk('4R')
  expect(p.state.position.initialized).toBe(true)
  p.lsk('6R') // ROUTE>
  expect(p.state.currentPage.pageId).toBe('RTE')
  p.enter('RKSI', '1L')
  p.enter('RKPK', '1R')
  p.enter('KE1101', '2R')
  p.enter('33L', '3L')
  expect(p.state.activeFlightPlan.origin).toBe('RKSI')
  expect(p.state.activeFlightPlan.destination).toBe('RKPK')
  expect(p.state.activeFlightPlan.departureRunway).toBe('33L')
}

describe('Boeing 737-800 FMC', () => {
  it('rejects invalid entries with INVALID ENTRY / NOT IN DATA BASE and restores the scratchpad', () => {
    const p = new Pilot('B737-800')
    p.key('RTE')
    p.enter('ZZZZ', '1L')
    expect(p.scratchpad).toBe('NOT IN DATA BASE')
    p.key('CLR')
    expect(p.scratchpad).toBe('ZZZZ')
    p.key('CLR')
    expect(p.scratchpad).toBe('ZZZ')
    p.dispatch({ type: 'KEY_LONG', key: 'CLR' })
    expect(p.scratchpad).toBe('')
    p.enter('12', '1L')
    expect(p.scratchpad).toBe('INVALID ENTRY')
  })

  it('programs RKSI → RKPK with SID, airways, STAR and approach, then activates with EXEC', () => {
    const p = new Pilot('B737-800')
    programRksiRkpk(p)
    // RTE page 2: VIA/TO
    p.key('NEXT_PAGE')
    expect(p.state.currentPage.subPage).toBe(2)
    p.enter('BULTI', '1R')
    p.enter('Y711', '2L')
    p.enter('OSN', '2R')
    p.enter('Y722', '3L')
    p.enter('KALOD', '3R')
    expect(p.legIdents()).toEqual(['RW33L', 'BULTI', 'NODLI', 'OSN', 'SOSDO', 'MAKET', 'TOPAX', 'KALOD', '--DISCO--', 'RKPK'])
    // Unknown airway / airway not containing previous fix
    p.enter('Y999', '4L')
    expect(p.scratchpad).toBe('NOT IN DATA BASE')
    p.dispatch({ type: 'KEY_LONG', key: 'CLR' })
    p.enter('Y781', '4L')
    expect(p.scratchpad).toBe('INVALID ENTRY')
    p.dispatch({ type: 'KEY_LONG', key: 'CLR' })

    // DEP/ARR → departures: select SID BULTI1J (runway already 33L)
    p.key('DEP_ARR')
    p.lsk('1L')
    expect(p.state.currentPage.pageId).toBe('DEPARTURES')
    const screen = p.screen().join('\n')
    expect(screen).toContain('BULTI1J')
    expect(screen).not.toContain('BULTI1K') // filtered by runway 33L
    p.lsk('1L') // BULTI1J
    expect(p.state.activeFlightPlan.sid?.name).toBe('BULTI1J')
    // SID ends at BULTI → merged with the route's first waypoint
    expect(p.legIdents().slice(0, 6)).toEqual(['RW33L', '(1600)', 'SIDOK', 'NOLDA', 'BULTI', 'NODLI'])

    // Arrivals at RKPK: STAR KALOD1A + ILS36L
    p.key('DEP_ARR')
    p.lsk('2R')
    expect(p.state.currentPage.pageId).toBe('ARRIVALS')
    const arr = p.screen().join('\n')
    expect(arr).toContain('KALOD1A')
    expect(arr).toContain('ILS36L')
    p.lsk('1L') // KALOD1A
    expect(p.state.activeFlightPlan.star?.name).toBe('KALOD1A')
    // approaches now filtered to 36L/36R
    const after = p.screen().join('\n')
    expect(after).toContain('ILS36L')
    expect(after).not.toContain('ILS18R')
    const rows = p.screen()
    const appRow = rows.findIndex((l) => l.includes('ILS36L'))
    const lsk = `${appRow / 2}R` as '1R'
    p.lsk(lsk)
    expect(p.state.activeFlightPlan.approach?.name).toBe('ILS36L')
    expect(p.legIdents()).toContain('--DISCO--') // no approach transition yet → STAR/approach not connected
    const transRow = p.screen().findIndex((l, i) => i > 0 && i % 2 === 0 && /DOTOL\s*$/.test(l))
    p.lsk(`${transRow / 2}R` as '1R')
    expect(p.state.activeFlightPlan.approach?.transition).toBe('DOTOL')
    const idents = p.legIdents()
    expect(idents).toContain('DOTOL')
    expect(idents).toContain('RW36L')
    expect(idents).not.toContain('--DISCO--')
    expect(idents.indexOf('KALOD')).toBeLessThan(idents.indexOf('GUMDO'))

    // ACTIVATE + EXEC
    p.key('RTE')
    p.lsk('6R')
    expect(p.state.modifiedFlightPlan).toBeDefined()
    expect(p.engine.adapter.isExecPending(p.state)).toBe(true)
    p.key('EXEC')
    expect(p.state.activeFlightPlan.activated).toBe(true)
    expect(p.state.modifiedFlightPlan).toBeUndefined()
    expect(p.screen()[0]).toContain('ACT')
  })

  it('creates MOD on active route changes, resolves discontinuities and supports ERASE', () => {
    const p = new Pilot('B737-800')
    programRksiRkpk(p)
    p.key('NEXT_PAGE')
    p.enter('BULTI', '1R')
    p.enter('Y711', '2L')
    p.enter('OSN', '2R')
    p.key('RTE')
    p.lsk('6R')
    p.key('EXEC')
    expect(p.legIdents()).toEqual(['RW33L', 'BULTI', 'NODLI', 'OSN', '--DISCO--', 'RKPK'])

    // LEGS: discontinuity row → enter destination to close it
    p.key('LEGS')
    const scr = p.screen()
    expect(scr.join('\n')).toContain('□□□□□')
    // delete NODLI → becomes discontinuity (MOD)
    p.key('DEL')
    p.lsk('2L')
    expect(p.state.modifiedFlightPlan).toBeDefined()
    expect(p.legIdents('mod')).toEqual(['RW33L', 'BULTI', '--DISCO--', 'OSN', '--DISCO--', 'RKPK'])
    expect(p.screen()[0]).toContain('MOD')
    // ERASE restores active
    p.lsk('6L')
    expect(p.state.modifiedFlightPlan).toBeUndefined()
    // Close discontinuity: copy RKPK? Enter it into the boxes on row 4
    p.enter('RKPK', '4L')
    expect(p.legIdents('mod')).toEqual(['RW33L', 'BULTI', 'NODLI', 'OSN', 'RKPK'])
    p.key('EXEC')
    expect(p.legIdents()).toEqual(['RW33L', 'BULTI', 'NODLI', 'OSN', 'RKPK'])
    // DELETE on a discontinuity is not allowed on Boeing
    p.enter('KALOD', '3L') // insert KALOD before OSN → disco after KALOD
    expect(p.legIdents('mod')).toEqual(['RW33L', 'BULTI', 'NODLI', 'KALOD', '--DISCO--', 'OSN', 'RKPK'])
    p.key('DEL')
    p.lsk('4L')
    expect(p.scratchpad).toBe('INVALID DELETE')
  })

  it('validates PERF INIT entries and computes takeoff speeds', () => {
    const p = new Pilot('B737-800')
    p.key('INIT_REF')
    p.key('INIT_REF')
    p.dispatch({ type: 'OPEN_PAGE', pageId: 'PERF_INIT' })
    p.enter('61.5', '3L')
    expect(p.state.performance.zfwKg).toBe(61500)
    p.enter('8.2', '2L')
    expect(p.state.performance.fuelKg).toBe(8200)
    p.enter('2.5', '4L')
    p.enter('30', '5L')
    p.enter('FL350', '1R')
    expect(p.state.performance.cruiseAltitudeFt).toBe(35000)
    p.enter('FL999', '1R')
    expect(p.scratchpad).toBe('INVALID ENTRY')
    p.dispatch({ type: 'KEY_LONG', key: 'CLR' })
    p.enter('600', '5L')
    expect(p.scratchpad).toBe('INVALID ENTRY')
    p.dispatch({ type: 'KEY_LONG', key: 'CLR' })
    p.dispatch({ type: 'OPEN_PAGE', pageId: 'TAKEOFF_REF' })
    p.enter('5', '1L')
    p.lsk('1R') // accept QRH V1
    expect(p.state.performance.takeoff.v1).toBeGreaterThan(120)
    p.enter('7', '1L')
    expect(p.scratchpad).toBe('INVALID ENTRY')
  })
})
