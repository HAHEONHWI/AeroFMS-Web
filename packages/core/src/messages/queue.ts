import type { Draft } from 'immer'
import type { FmsState } from '../state/types'
import type { MessageCatalog, MessageCode } from './codes'

/** Adds an alert/advisory message once (duplicate codes are not re-queued while unacknowledged). */
export function postMessage(
  draft: Draft<FmsState>,
  code: MessageCode,
  catalog: MessageCatalog,
  nextId: () => string,
  now: number,
  kind: 'ALERT' | 'ADVISORY' = 'ADVISORY',
): boolean {
  if (draft.messages.some((m) => m.code === code && !m.acknowledged)) return false
  draft.messages.push({ id: nextId(), code, text: catalog[code], kind, createdAt: now, acknowledged: false })
  if (draft.messages.length > 20) draft.messages.splice(0, draft.messages.length - 20)
  return true
}

/** Removes a condition-based message when the condition clears. */
export function clearMessage(draft: Draft<FmsState>, code: MessageCode): void {
  const idx = draft.messages.findIndex((m) => m.code === code)
  if (idx >= 0) draft.messages.splice(idx, 1)
}

export function pendingMessages(state: FmsState): FmsState['messages'] {
  return state.messages.filter((m) => !m.acknowledged)
}
