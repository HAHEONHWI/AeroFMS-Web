import { randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Human friendly share code AERO-XXXXX (no ambiguous characters). */
export function generateShareCode(): string {
  let s = ''
  for (let i = 0; i < 5; i++) s += ALPHABET[randomInt(ALPHABET.length)]
  return `AERO-${s}`
}

export const SHARE_CODE_PATTERN = /^AERO-[A-HJ-NP-Z2-9]{5}$/
