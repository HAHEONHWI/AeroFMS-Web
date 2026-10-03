import { describe, expect, it } from 'vitest'
import {
  parseAirbusAltitudeConstraint,
  parseAltitude,
  parseBoeingAltitudeConstraint,
  parseCostIndex,
  parseCruiseAltitude,
  parseLatLon,
  parsePlaceBearingDistance,
  parseQnhHpa,
  parseRunwayIdent,
  parseSpeed,
  parseSpeedAltitudeConstraint,
  parseTemperatureC,
  parseWeightKg,
  parseWind,
} from '../src'

describe('entry validation', () => {
  it('parses cruise altitudes in every accepted format', () => {
    expect(parseCruiseAltitude('FL350', 41000)).toBe(35000)
    expect(parseCruiseAltitude('350', 41000)).toBe(35000)
    expect(parseCruiseAltitude('35000', 41000)).toBe(35000)
    expect(parseCruiseAltitude('FL999', 41000)).toBeUndefined()
    expect(parseCruiseAltitude('FL430', 41000)).toBeUndefined()
    expect(parseCruiseAltitude('ABC', 41000)).toBeUndefined()
    expect(parseAltitude('5000')).toBe(5000)
  })

  it('parses speeds and mach', () => {
    expect(parseSpeed('250')).toEqual({ kind: 'IAS', kt: 250 })
    expect(parseSpeed('.78')).toEqual({ kind: 'MACH', mach: 0.78 })
    expect(parseSpeed('0.785')).toEqual({ kind: 'MACH', mach: 0.785 })
    expect(parseSpeed('99')).toBeUndefined()
    expect(parseSpeed('.99')).toBeUndefined()
  })

  it('parses Boeing and Airbus altitude constraints', () => {
    expect(parseBoeingAltitudeConstraint('FL240B')).toEqual({ type: 'AT_OR_BELOW', altitudeFt: 24000 })
    expect(parseBoeingAltitudeConstraint('5000A')).toEqual({ type: 'AT_OR_ABOVE', altitudeFt: 5000 })
    expect(parseBoeingAltitudeConstraint('220A240B')).toEqual({ type: 'BETWEEN', altitudeFt: 24000, altitude2Ft: 22000 })
    expect(parseAirbusAltitudeConstraint('+FL100')).toEqual({ type: 'AT_OR_ABOVE', altitudeFt: 10000 })
    expect(parseAirbusAltitudeConstraint('-5000')).toEqual({ type: 'AT_OR_BELOW', altitudeFt: 5000 })
    expect(parseSpeedAltitudeConstraint('250/10000')).toMatchObject({ speed: { speedKt: 250 }, altitude: { altitudeFt: 10000, type: 'AT' } })
    expect(parseSpeedAltitudeConstraint('/FL240B')).toMatchObject({ hasSpeed: false, altitude: { type: 'AT_OR_BELOW' } })
    expect(parseSpeedAltitudeConstraint('2500/')).toBeUndefined()
  })

  it('parses weights, temperatures, wind, runway, QNH, CI', () => {
    expect(parseWeightKg('61.5')).toBe(61500)
    expect(parseWeightKg('61500')).toBe(61500)
    expect(parseWeightKg('-1')).toBeUndefined()
    expect(parseTemperatureC('-5')).toBe(-5)
    expect(parseTemperatureC('+30')).toBe(30)
    expect(parseTemperatureC('59F')).toBe(15)
    expect(parseWind('270/45')).toEqual({ dir: 270, kt: 45 })
    expect(parseWind('400/45')).toBeUndefined()
    expect(parseRunwayIdent('RW33L')).toBe('33L')
    expect(parseRunwayIdent('7')).toBe('07')
    expect(parseRunwayIdent('37')).toBeUndefined()
    expect(parseQnhHpa('1013')).toBe(1013)
    expect(parseQnhHpa('29.92')).toBe(1013)
    expect(parseCostIndex('30', { min: 0, max: 500 })).toBe(30)
    expect(parseCostIndex('600', { min: 0, max: 500 })).toBeUndefined()
  })

  it('parses lat/lon and place-bearing-distance', () => {
    const p = parseLatLon('N3728.5E12626.4')
    expect(p?.lat).toBeCloseTo(37.475, 3)
    expect(p?.lon).toBeCloseTo(126.44, 2)
    expect(parseLatLon('N9128.5E12626.4')).toBeUndefined()
    expect(parsePlaceBearingDistance('OSN090/20')).toEqual({ ident: 'OSN', bearing: 90, distanceNm: 20 })
  })
})
