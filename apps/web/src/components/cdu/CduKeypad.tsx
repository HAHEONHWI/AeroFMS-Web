import { useRef } from 'react'
import type { KeyDefinition, KeypadLayout } from '@aerofms/core'
import { useTranslation } from 'react-i18next'

interface Props {
  layout: KeypadLayout
  onKey: (key: string, long: boolean) => void
  execLit: boolean
  highlightKeys?: string[]
  compact?: boolean
}

function KeyButton({ k, onKey, lit, highlighted, airbus }: { k: KeyDefinition; onKey: Props['onKey']; lit: boolean; highlighted: boolean; airbus: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const longFired = useRef(false)
  const isFn = k.role === 'page' || k.role === 'exec' || k.role === 'navigation' || k.role === 'function'
  const start = () => {
    longFired.current = false
    if (k.id === 'CLR') {
      timer.current = setTimeout(() => {
        longFired.current = true
        onKey(k.id, true)
      }, 600)
    }
  }
  const end = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = undefined
  }
  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onClick={() => {
        if (!longFired.current) onKey(k.id, false)
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={k.label}
      style={{ gridRow: k.row + 1, gridColumn: `${k.col + 1} / span ${k.colSpan ?? 1}` }}
      className={`relative flex min-h-9 select-none items-center justify-center rounded-[5px] border border-cdu-key-border bg-cdu-key px-0.5 text-center font-semibold leading-tight text-[#e6eaf0] shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)] active:translate-y-px active:bg-cdu-key-pressed ${
        isFn ? (airbus ? 'text-[10px] tablet:text-[11px]' : 'text-[10px] tablet:text-[11px]') : 'text-sm'
      } ${highlighted ? 'ring-2 ring-cdu-yellow ring-offset-1 ring-offset-cdu-bezel' : ''}`}
    >
      {k.light && (
        <span
          aria-hidden="true"
          className={`absolute left-1/2 top-0.5 h-1 w-6 -translate-x-1/2 rounded-full ${lit ? 'bg-[#f2efe0] shadow-[0_0_6px_#f2efe0]' : 'bg-black/40'}`}
        />
      )}
      <span className="whitespace-pre-line">{k.label.replace(' ', '\n')}</span>
    </button>
  )
}

export function CduKeypad({ layout, onKey, execLit, highlightKeys, compact }: Props) {
  const { t } = useTranslation()
  const fn = layout.sections.find((s) => s.id === 'function')
  const alpha = layout.sections.find((s) => s.id === 'alpha')
  const num = layout.sections.find((s) => s.id === 'numeric')
  const airbus = layout.style !== 'BOEING_CDU' && layout.style !== 'BOEING_MFK'
  const hl = new Set(highlightKeys ?? [])
  const grid = (cols: number) => ({ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` })
  return (
    <div className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2.5'}`} aria-label={t('emulator.keypadLabel', { system: layout.style })}>
      {fn && (
        <div className="grid gap-1.5" style={grid(fn.columns)}>
          {fn.keys.map((k) => (
            <KeyButton key={k.id} k={k} onKey={onKey} lit={k.id === 'EXEC' && execLit} highlighted={hl.has(k.id)} airbus={airbus} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-[3fr_5fr] gap-3">
        {num && (
          <div className="grid content-start gap-1.5" style={grid(num.columns)}>
            {num.keys.map((k) => (
              <KeyButton key={k.id} k={k} onKey={onKey} lit={false} highlighted={hl.has(k.id)} airbus={airbus} />
            ))}
          </div>
        )}
        {alpha && (
          <div className="grid gap-1.5" style={grid(alpha.columns)}>
            {alpha.keys.map((k) => (
              <KeyButton key={k.id} k={k} onKey={onKey} lit={false} highlighted={hl.has(k.id)} airbus={airbus} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
