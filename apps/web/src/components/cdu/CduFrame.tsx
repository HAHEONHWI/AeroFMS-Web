import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { composeDisplay, pendingMessages } from '@aerofms/core'
import type { AircraftFmsAdapter, FieldBinding, FmsActionInput, FmsState, LskId, LskSide } from '@aerofms/core'
import type { NavigationProvider } from '@aerofms/navigation'
import { CduDisplay } from './CduDisplay'
import { CduKeypad } from './CduKeypad'
import { playKeySound, vibrate } from './sound'
import { useSettings } from '@/stores/settings'

export interface CduFrameProps {
  state: FmsState
  adapter: AircraftFmsAdapter
  nav: NavigationProvider
  dispatch?: (a: FmsActionInput) => void
  highlightKeys?: string[]
  highlightLsk?: LskId[]
  explainMode?: boolean
  onExplain?: (binding: FieldBinding) => void
  compact?: boolean
  /** Replay mode: display only. */
  readOnly?: boolean
}

const ROWS = [1, 2, 3, 4, 5, 6] as const

function mapKeyboard(e: KeyboardEvent, adapter: AircraftFmsAdapter): FmsActionInput | null {
  const k = e.key
  if (/^F([1-6])$/.test(k)) {
    const n = Number(k.slice(1))
    return { type: 'LSK', lsk: `${n}${e.shiftKey ? 'R' : 'L'}` as LskId }
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (/^[a-zA-Z0-9]$/.test(k)) return { type: 'KEY', key: k.toUpperCase() }
  switch (k) {
    case '.':
    case '/':
      return { type: 'KEY', key: k }
    case ' ':
      return { type: 'KEY', key: 'SP' }
    case '-':
    case '+':
      return { type: 'KEY', key: '+/-' }
    case 'Backspace':
      return e.shiftKey ? { type: 'KEY_LONG', key: 'CLR' } : { type: 'KEY', key: 'CLR' }
    case 'Delete':
      return { type: 'KEY', key: adapter.getCapabilities().execKey ? 'DEL' : 'CLR' }
    case 'Enter':
      return adapter.getCapabilities().execKey ? { type: 'KEY', key: 'EXEC' } : null
    case 'ArrowLeft':
    case 'PageUp':
      return { type: 'KEY', key: 'PREV_PAGE' }
    case 'ArrowRight':
    case 'PageDown':
      return { type: 'KEY', key: 'NEXT_PAGE' }
    case 'ArrowUp':
      return { type: 'KEY', key: 'UP' }
    case 'ArrowDown':
      return { type: 'KEY', key: 'DOWN' }
    default:
      return null
  }
}

export function CduFrame({ state, adapter, nav, dispatch, highlightKeys, highlightLsk, explainMode, onExplain, compact, readOnly }: CduFrameProps) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(420)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 420))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const page = useMemo(() => adapter.renderPage(state, nav), [adapter, state, nav])
  const grid = useMemo(() => composeDisplay(page, adapter.scratchpadDisplay(state), adapter.display.columns), [page, adapter, state])
  const lskWidth = Math.max(28, Math.min(40, width * 0.075))
  const screenWidth = width - 2 * lskWidth - 16
  const fontSize = Math.max(9, Math.min(24, screenWidth / (24 * 0.6 + 0.7)))
  const rowHeight = Math.round(fontSize * 1.32)
  const execLit = adapter.isExecPending(state)
  const msgLit = pendingMessages(state).length > 0
  const airbus = adapter.manufacturer === 'AIRBUS'
  const hlLsk = new Set(highlightLsk ?? [])

  const feedback = useCallback(() => {
    if (settings.sound !== 'off') playKeySound(settings.sound)
    if (settings.haptic) vibrate()
  }, [settings.sound, settings.haptic])

  const send = useCallback(
    (a: FmsActionInput) => {
      if (readOnly || !dispatch) return
      feedback()
      dispatch(a)
    },
    [dispatch, readOnly, feedback],
  )

  const pressLsk = (lsk: LskId) => {
    if (explainMode && onExplain) {
      const r = page.rows[Number(lsk[0]) - 1]
      const b = r?.fields?.[lsk[1] as LskSide]
      if (b) onExplain(b)
      return
    }
    send({ type: 'LSK', lsk })
  }

  // Long press on an LSK opens Explain for its field.
  const longTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const longFired = useRef(false)
  const lskDown = (lsk: LskId) => {
    longFired.current = false
    longTimer.current = setTimeout(() => {
      const r = page.rows[Number(lsk[0]) - 1]
      const b = r?.fields?.[lsk[1] as LskSide]
      if (b && onExplain) {
        longFired.current = true
        onExplain(b)
      }
    }, 650)
  }
  const lskUp = () => {
    if (longTimer.current) clearTimeout(longTimer.current)
  }

  const lskButton = (lsk: LskId) => (
    <button
      key={lsk}
      type="button"
      aria-label={t('emulator.lsk', { id: lsk })}
      onPointerDown={() => lskDown(lsk)}
      onPointerUp={lskUp}
      onPointerLeave={lskUp}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (!longFired.current) pressLsk(lsk)
      }}
      disabled={readOnly}
      className={`h-full w-full rounded-[4px] border border-cdu-key-border bg-cdu-key shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)] active:bg-cdu-key-pressed disabled:opacity-60 ${
        airbus ? 'max-h-6' : 'max-h-7'
      } ${hlLsk.has(lsk) ? 'ring-2 ring-cdu-yellow' : ''}`}
    >
      <span aria-hidden="true" className="block text-[10px] text-cdu-gray">{lsk[1] === 'L' ? '—' : '—'}</span>
    </button>
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
    const a = mapKeyboard(e, adapter)
    if (!a) return
    e.preventDefault()
    send(a)
  }

  const bezel = airbus ? 'bg-[#1d2430]' : adapter.display.style === 'BOEING_MFD_CDU' ? 'bg-[#171d27]' : 'bg-cdu-bezel'

  return (
    <div
      ref={containerRef}
      tabIndex={readOnly ? -1 : 0}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false)
      }}
      aria-label={t('emulator.screenLabel', { system: adapter.definition.systemLabel })}
      className={`w-full rounded-xl border border-line-strong p-2 shadow-2xl outline-none ${bezel} ${focused ? 'ring-1 ring-accent/60' : ''}`}
    >
      {/* Display with line select keys */}
      <div className="grid items-center gap-x-1.5" style={{ gridTemplateColumns: `${lskWidth}px 1fr ${lskWidth}px`, gridTemplateRows: `repeat(14, ${rowHeight}px)` }}>
        <div style={{ gridColumn: 2, gridRow: '1 / span 14' }} className="self-stretch">
          <CduDisplay
            grid={grid}
            rowHeight={rowHeight}
            fontSize={fontSize}
            explainMode={explainMode}
            highlightedLegId={state.navigation.highlightedLegId}
            ariaLabel={t('emulator.screenLabel', { system: adapter.definition.systemLabel })}
            onLineClick={(_i, fields) => {
              if (explainMode) {
                const b = fields?.L ?? fields?.R
                if (b && onExplain) onExplain(b)
                return
              }
              const legId = fields?.L?.legId ?? fields?.R?.legId
              if (legId && dispatch && !readOnly) dispatch({ type: 'HIGHLIGHT_LEG', legId })
            }}
          />
        </div>
        {ROWS.map((r) => (
          <div key={`L${r}`} style={{ gridColumn: 1, gridRow: r * 2 + 1 }} className="flex h-full items-center py-0.5">
            {lskButton(`${r}L` as LskId)}
          </div>
        ))}
        {ROWS.map((r) => (
          <div key={`R${r}`} style={{ gridColumn: 3, gridRow: r * 2 + 1 }} className="flex h-full items-center py-0.5">
            {lskButton(`${r}R` as LskId)}
          </div>
        ))}
      </div>
      {/* Annunciators */}
      <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold tracking-wider">
        <div className="flex gap-2">
          {adapter.display.annunciators.includes('MSG') && <span className={msgLit ? 'text-cdu-amber' : 'text-white/15'}>MSG</span>}
          {adapter.display.annunciators.includes('FM') && <span className={msgLit ? 'text-cdu-amber' : 'text-white/15'}>FM</span>}
          {adapter.display.annunciators.includes('OFST') && <span className={state.navigation.offsetNm ? 'text-cdu-white' : 'text-white/15'}>OFST</span>}
          {adapter.display.annunciators.includes('IND') && <span className="text-white/15">IND</span>}
          {adapter.display.annunciators.includes('RDY') && <span className="text-cdu-green/70">RDY</span>}
        </div>
        <span className="text-white/25">{adapter.definition.systemLabel}</span>
        {execLit && <span className="text-cdu-white">{t('emulator.execPending')}</span>}
      </div>
      {!readOnly && (
        <div className="mt-2">
          <CduKeypad
            layout={adapter.getKeypad()}
            execLit={execLit}
            highlightKeys={highlightKeys}
            compact={compact}
            onKey={(key, long) => send(long ? { type: 'KEY_LONG', key } : { type: 'KEY', key })}
          />
        </div>
      )}
      {!readOnly && <p className="mt-2 hidden text-center text-[10px] text-fg-faint desktop:block">{focused ? t('emulator.keyboardShortcuts') : t('emulator.focusHint')}</p>}
    </div>
  )
}
