import { useMemo } from 'react'
import type { DisplayCell, DisplayGrid, FieldBinding, FmsColor, LskSide } from '@aerofms/core'

const COLOR_CLASS: Record<FmsColor, string> = {
  white: 'text-cdu-white',
  green: 'text-cdu-green',
  cyan: 'text-cdu-cyan',
  magenta: 'text-cdu-magenta',
  amber: 'text-cdu-amber',
  yellow: 'text-cdu-yellow',
  red: 'text-cdu-red',
  gray: 'text-cdu-gray',
  blue: 'text-cdu-blue',
}

interface Run {
  text: string
  color: FmsColor
  size: 'L' | 'S'
  inverse: boolean
}

/** Glyphs missing from IBM Plex Mono; drawn one cell at a time so a fallback font cannot shift the grid. */
const OUTSIDE_FONT = new Set(['□', 'Δ'])

function runs(cells: DisplayCell[]): Run[] {
  const out: Run[] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    const single = OUTSIDE_FONT.has(c.ch)
    if (!single && last && !OUTSIDE_FONT.has(last.text) && last.color === c.color && last.size === c.size && last.inverse === c.inverse) last.text += c.ch
    else out.push({ text: c.ch, color: c.color, size: c.size, inverse: c.inverse })
  }
  return out
}

export interface CduDisplayProps {
  grid: DisplayGrid
  rowHeight: number
  fontSize: number
  onLineClick?: (lineIndex: number, fields: Partial<Record<LskSide, FieldBinding>> | undefined) => void
  highlightedLegId?: string
  explainMode?: boolean
  ariaLabel: string
}

/** Renders the composed CDU character grid. Lines are real text (selectable, screen-reader friendly). */
export function CduDisplay({ grid, rowHeight, fontSize, onLineClick, highlightedLegId, explainMode, ariaLabel }: CduDisplayProps) {
  const lines = useMemo(() => grid.lines.map((l) => ({ ...l, runs: runs(l.cells) })), [grid])
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className="cdu-font select-none overflow-hidden rounded-sm bg-cdu-screen px-[0.35em] leading-none"
      style={{ fontSize }}
    >
      {lines.map((line, i) => {
        const legId = line.fields?.L?.legId ?? line.fields?.R?.legId
        const clickable = !!onLineClick && line.kind === 'data' && (explainMode ? !!(line.fields?.L || line.fields?.R) : !!legId)
        const highlighted = legId !== undefined && legId === highlightedLegId
        return (
          <div
            key={i}
            className={`flex items-center whitespace-pre ${clickable ? 'cursor-pointer hover:bg-white/5' : ''} ${highlighted ? 'bg-cdu-yellow/10' : ''} ${line.kind === 'scratchpad' ? 'border-t border-white/5' : ''}`}
            style={{ height: rowHeight }}
            onClick={clickable ? () => onLineClick?.(i, line.fields) : undefined}
            aria-label={line.text.trim() || undefined}
          >
            {line.runs.map((r, j) => (
              <span
                key={j}
                className={`${COLOR_CLASS[r.color]} ${r.inverse ? 'bg-cdu-white/85 !text-cdu-screen' : ''}`}
                // Width is in the run's own em, so small runs are scaled back to the full-size column grid.
                style={{
                  fontSize: r.size === 'S' ? '0.78em' : '1em',
                  width: `${(r.text.length * 0.6) / (r.size === 'S' ? 0.78 : 1)}em`,
                  display: 'inline-block',
                  letterSpacing: 0,
                  ...(OUTSIDE_FONT.has(r.text) ? { textAlign: 'center' as const, overflow: 'hidden' } : {}),
                }}
              >
                {r.text}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}
