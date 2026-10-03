import { isValidCondition } from '../conditions'
import type { Scenario } from '../model'

const AIRCRAFT_ID = /^[A-Z0-9-]{3,16}$/

/**
 * Validates a user-created or downloaded scenario before it is stored or run.
 * Only literal text is allowed in user content (no i18n keys, no executable code).
 */
export function validateScenario(raw: unknown): { ok: true; scenario: Scenario } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'NOT_OBJECT' }
  const s = raw as Partial<Scenario>
  const textOk = (t: unknown, max: number): boolean =>
    typeof t === 'object' && t !== null && 'text' in t && typeof (t as { text: unknown }).text === 'string' && (t as { text: string }).text.length <= max
  if (typeof s.id !== 'string' || s.id.length > 64) return { ok: false, error: 'ID' }
  if (!textOk(s.title, 120)) return { ok: false, error: 'TITLE' }
  if (!textOk(s.description, 2000)) return { ok: false, error: 'DESCRIPTION' }
  if (typeof s.aircraftId !== 'string' || !AIRCRAFT_ID.test(s.aircraftId)) return { ok: false, error: 'AIRCRAFT' }
  if (!['EASY', 'MEDIUM', 'HARD'].includes(String(s.difficulty))) return { ok: false, error: 'DIFFICULTY' }
  if (!['ko', 'en'].includes(String(s.language))) return { ok: false, error: 'LANGUAGE' }
  if (!['PRIVATE', 'UNLISTED', 'PUBLIC'].includes(String(s.visibility))) return { ok: false, error: 'VISIBILITY' }
  if (!Array.isArray(s.objectives) || s.objectives.length === 0 || s.objectives.length > 30) return { ok: false, error: 'OBJECTIVES' }
  for (const o of s.objectives) {
    if (!o || typeof o.id !== 'string' || !textOk(o.text, 200) || !isValidCondition(o.condition) || typeof o.points !== 'number' || o.points < 0 || o.points > 100) {
      return { ok: false, error: 'OBJECTIVE' }
    }
  }
  if (!Array.isArray(s.hints) || s.hints.length > 10 || !s.hints.every((h) => textOk(h, 300))) return { ok: false, error: 'HINTS' }
  if (!Array.isArray(s.setup) || s.setup.length > 40) return { ok: false, error: 'SETUP' }
  const allowed = new Set(['SET_ORIGIN', 'SET_DESTINATION', 'SET_DEPARTURE_RUNWAY', 'SET_POSITION_FROM_AIRPORT', 'APPEND_ROUTE', 'SET_SID', 'SET_STAR', 'SET_APPROACH', 'SET_CRUISE_ALTITUDE', 'SET_COST_INDEX', 'SET_ZFW', 'SET_FUEL', 'SET_RESERVES', 'SET_FLIGHT_NUMBER', 'ACTIVATE_ROUTE'])
  if (!s.setup.every((c) => c && typeof c === 'object' && allowed.has(String((c as { kind: unknown }).kind)))) return { ok: false, error: 'SETUP_COMMAND' }
  return { ok: true, scenario: { ...(s as Scenario), builtIn: false, version: 1 } }
}
