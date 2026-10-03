import { describe, expect, it } from 'vitest'
import { briefingFromForm, builderCondition, createUserScenario, generateObjectives, parseCruiseInput, validateScenario } from '../src'

describe('scenario builder', () => {
  it('parses cruise input', () => {
    expect(parseCruiseInput('FL350')).toBe(35000)
    expect(parseCruiseInput('350')).toBe(35000)
    expect(parseCruiseInput('35000')).toBe(35000)
    expect(parseCruiseInput('abc')).toBeUndefined()
  })

  it('generates objectives and a valid scenario', () => {
    const form = { title: 'RKSI-RKPC', description: '', aircraftId: 'B737-800', difficulty: 'EASY' as const, language: 'en' as const, visibility: 'PRIVATE' as const, origin: 'rksi', destination: 'rkpc', route: 'BULTI Y711 OSN', cruise: 'FL330' }
    const b = briefingFromForm(form)
    expect(b.origin).toBe('RKSI')
    const objs = generateObjectives(b, 'en', (x) => x === 'Y711')
    const route = objs.find((o) => o.condition.kind === 'ROUTE_CONTAINS')
    expect(route?.condition).toEqual({ kind: 'ROUTE_CONTAINS', idents: ['BULTI', 'OSN'] })
    expect(builderCondition('PERF_CRZ', 'FL330')).toEqual({ kind: 'PERF', field: 'cruiseAltitudeFt', equals: 33000 })
    const v = validateScenario(createUserScenario(form, objs, ['  use LEGS ', '']))
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.scenario.hints).toHaveLength(1)
  })
})
