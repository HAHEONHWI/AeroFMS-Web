let counter = 0

/** Generates a collision-resistant id without depending on platform crypto availability. */
export function createId(prefix = ''): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  if (g.crypto?.randomUUID) return prefix + g.crypto.randomUUID()
  counter = (counter + 1) % 1_000_000
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}${Date.now().toString(36)}-${counter.toString(36)}-${rand}`
}

/**
 * Deterministic id factory. The FMS reducer uses this so that replaying the same
 * action log reproduces identical element ids.
 */
export function deterministicId(seed: string, n: number): string {
  let h = 2166136261
  const s = `${seed}:${n}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `e${(h >>> 0).toString(36)}${n.toString(36)}`
}

const SHARE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Human friendly share code, e.g. AERO-7K2P9 */
export function createShareCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 5; i++) code += SHARE_ALPHABET[Math.floor(random() * SHARE_ALPHABET.length)]
  return `AERO-${code}`
}

export const SHARE_CODE_PATTERN = /^AERO-[A-HJ-NP-Z2-9]{5}$/
