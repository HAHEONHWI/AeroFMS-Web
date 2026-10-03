import type { Draft } from 'immer'
import type { FmsState } from '../state/types'

export const SCRATCHPAD_MAX = 22

const CHAR_KEYS = new Set([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
  '.',
  '/',
  '-',
  '+',
])

/** Maps a key id to the character it types, or undefined for function keys. */
export function keyToChar(key: string): string | undefined {
  if (key === 'SP') return ' '
  if (CHAR_KEYS.has(key)) return key
  return undefined
}

/** Clears a displayed message, restoring the text that was in the scratchpad before it. */
export function dismissMessage(draft: Draft<FmsState>): boolean {
  const msg = draft.scratchpad.message
  if (!msg) return false
  draft.scratchpad.text = msg.restoreText ?? draft.scratchpad.text
  draft.scratchpad.message = undefined
  return true
}

export function appendChar(draft: Draft<FmsState>, ch: string, maxLength = SCRATCHPAD_MAX): void {
  dismissMessage(draft)
  if (draft.scratchpad.deleteMode) {
    draft.scratchpad.deleteMode = false
    draft.scratchpad.text = ''
  }
  if (draft.scratchpad.text.length >= maxLength) return
  draft.scratchpad.text += ch
}

export interface ClearBehavior {
  /** Airbus: CLR on an empty scratchpad produces the CLR deletion token. */
  emptyClearCreatesDeleteToken: boolean
}

export function clearShort(draft: Draft<FmsState>, behavior: ClearBehavior): void {
  if (dismissMessage(draft)) return
  if (draft.scratchpad.deleteMode) {
    draft.scratchpad.deleteMode = false
    return
  }
  if (draft.scratchpad.text.length > 0) {
    draft.scratchpad.text = draft.scratchpad.text.slice(0, -1)
    return
  }
  if (behavior.emptyClearCreatesDeleteToken) draft.scratchpad.deleteMode = true
}

export function clearAll(draft: Draft<FmsState>): void {
  draft.scratchpad.message = undefined
  draft.scratchpad.deleteMode = false
  draft.scratchpad.text = ''
}

/** Boeing DEL key: only valid with an empty scratchpad. */
export function deleteKey(draft: Draft<FmsState>): boolean {
  dismissMessage(draft)
  if (draft.scratchpad.text.length > 0 || draft.scratchpad.deleteMode) return false
  draft.scratchpad.deleteMode = true
  return true
}

/** Airbus +/- key: toggles a trailing sign, otherwise types '-'. */
export function plusMinus(draft: Draft<FmsState>): void {
  dismissMessage(draft)
  const t = draft.scratchpad.text
  if (t.endsWith('-')) draft.scratchpad.text = `${t.slice(0, -1)}+`
  else if (t.endsWith('+')) draft.scratchpad.text = `${t.slice(0, -1)}-`
  else if (t.length < SCRATCHPAD_MAX) draft.scratchpad.text = `${t}-`
}

export function setScratchpad(draft: Draft<FmsState>, text: string): void {
  draft.scratchpad.message = undefined
  draft.scratchpad.deleteMode = false
  draft.scratchpad.text = text.slice(0, SCRATCHPAD_MAX)
}

export function showMessage(draft: Draft<FmsState>, code: string, text: string): void {
  const restore = draft.scratchpad.message?.restoreText ?? draft.scratchpad.text
  draft.scratchpad.message = { code, text, restoreText: restore }
}
