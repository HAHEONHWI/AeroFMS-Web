import type { KeyDefinition, KeypadSection } from '@aerofms/core'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** 5-column alpha block followed by the given extra keys. */
export function alphaSection(extra: Array<Pick<KeyDefinition, 'id' | 'label' | 'role'>>): KeypadSection {
  const keys: KeyDefinition[] = LETTERS.map((l, i) => ({ id: l, label: l, role: 'char', row: Math.floor(i / 5), col: i % 5 }))
  let idx = LETTERS.length
  for (const e of extra) {
    keys.push({ ...e, row: Math.floor(idx / 5), col: idx % 5 })
    idx++
  }
  return { id: 'alpha', columns: 5, keys }
}

export function numericSection(lastRow: Array<Pick<KeyDefinition, 'id' | 'label' | 'role'>>): KeypadSection {
  const keys: KeyDefinition[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n, i) => ({
    id: n,
    label: n,
    role: 'char',
    row: Math.floor(i / 3),
    col: i % 3,
  }))
  lastRow.forEach((k, i) => keys.push({ ...k, row: 3, col: i }))
  return { id: 'numeric', columns: 3, keys }
}

export function functionSection(rows: Array<Array<Pick<KeyDefinition, 'id' | 'label' | 'role' | 'light'> | null>>, columns: number): KeypadSection {
  const keys: KeyDefinition[] = []
  rows.forEach((r, row) =>
    r.forEach((k, col) => {
      if (k) keys.push({ ...k, row, col })
    }),
  )
  return { id: 'function', columns, keys }
}
