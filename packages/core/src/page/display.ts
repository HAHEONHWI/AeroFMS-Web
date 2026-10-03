import type { FieldBinding, FmsColor, FmsLine, FmsPageContent, FmsTextSize, LskSide, TextSpan } from './types'

export interface DisplayCell {
  ch: string
  color: FmsColor
  size: FmsTextSize
  inverse: boolean
}

export interface DisplayLine {
  cells: DisplayCell[]
  /** Plain text of the line (screen readers, tests). */
  text: string
  /** For data lines: field bound to the left/right line select key. */
  fields?: Partial<Record<LskSide, FieldBinding>>
  kind: 'title' | 'label' | 'data' | 'scratchpad'
}

export interface DisplayGrid {
  columns: number
  lines: DisplayLine[]
}

const blank = (): DisplayCell => ({ ch: ' ', color: 'white', size: 'L', inverse: false })

function spansLength(spans: TextSpan[] | undefined): number {
  return (spans ?? []).reduce((n, s) => n + s.text.length, 0)
}

function writeSpans(cells: DisplayCell[], start: number, spans: TextSpan[] | undefined, defaultSize: FmsTextSize): void {
  let col = start
  for (const s of spans ?? []) {
    for (const ch of s.text) {
      if (col >= 0 && col < cells.length) {
        cells[col] = { ch, color: s.color ?? 'white', size: s.size ?? defaultSize, inverse: s.inverse ?? false }
      }
      col++
    }
  }
}

export function composeLine(line: FmsLine, columns: number, defaultSize: FmsTextSize): DisplayCell[] {
  const cells = Array.from({ length: columns }, blank)
  writeSpans(cells, 0, line.left, defaultSize)
  const cLen = spansLength(line.center)
  if (cLen) writeSpans(cells, Math.max(0, Math.floor((columns - cLen) / 2)), line.center, defaultSize)
  const rLen = spansLength(line.right)
  if (rLen) writeSpans(cells, columns - rLen, line.right, defaultSize)
  return cells
}

const toText = (cells: DisplayCell[]): string => cells.map((c) => c.ch).join('')

/** Composes a rendered page plus scratchpad into a fixed character grid (title + 6×2 + scratchpad). */
export function composeDisplay(
  page: FmsPageContent,
  scratchpad: { text: string; color: FmsColor },
  columns = 24,
): DisplayGrid {
  const lines: DisplayLine[] = []
  const titleLine: FmsLine = { ...page.title }
  if (page.pageNumber && page.pageNumber.total > 0) {
    titleLine.right = [
      ...(page.title.right ?? []),
      { text: `${page.pageNumber.current}/${page.pageNumber.total}`, color: 'white', size: 'S' },
    ]
  }
  const titleCells = composeLine(titleLine, columns, 'L')
  lines.push({ cells: titleCells, text: toText(titleCells), kind: 'title' })
  for (const r of page.rows) {
    const label = composeLine(r.label, columns, 'S')
    lines.push({ cells: label, text: toText(label), kind: 'label' })
    const data = composeLine(r.data, columns, 'L')
    lines.push({ cells: data, text: toText(data), kind: 'data', fields: r.fields })
  }
  const sp = composeLine({ left: [{ text: scratchpad.text, color: scratchpad.color, size: 'L' }] }, columns, 'L')
  lines.push({ cells: sp, text: toText(sp), kind: 'scratchpad' })
  return { columns, lines }
}
