import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Logo } from './Logo'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { applyLanguage } from '@/i18n'
import { track } from '@/services/analytics'

const NAV = [
  { to: '/emulator', key: 'nav.emulator' },
  { to: '/academy', key: 'nav.academy' },
  { to: '/scenarios', key: 'nav.scenarios' },
  { to: '/map', key: 'nav.map' },
  { to: '/replay', key: 'nav.replay' },
  { to: '/help', key: 'nav.help' },
]

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function LanguageQuickSwitch() {
  const { i18n } = useTranslation()
  const update = useSettings((s) => s.update)
  const next = i18n.language === 'ko' ? 'en' : 'ko'
  return (
    <button
      type="button"
      onClick={() => {
        update({ language: next })
        applyLanguage(next)
        track('language_changed', { language: next })
      }}
      className="h-10 rounded-md px-2.5 text-sm text-fg-muted hover:bg-surface hover:text-fg"
      aria-label={next === 'ko' ? '한국어로 전환' : 'Switch to English'}
    >
      {next === 'ko' ? '한국어' : 'EN'}
    </button>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const location = useLocation()
  // The mobile menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === location.pathname
  const setOpen = (v: boolean) => setOpenOn(v ? location.pathname : null)
  const user = useAuth((s) => s.user)
  const online = useOnline()
  const focusMode = location.pathname.startsWith('/emulator') || location.pathname.startsWith('/replay/')

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex h-10 items-center rounded-md px-3 text-sm transition-colors ${isActive ? 'bg-surface-raised text-fg' : 'text-fg-muted hover:bg-surface hover:text-fg'}`

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-bg">
        {t('app.skipToContent')}
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
        <div className={`mx-auto flex h-14 items-center gap-2 px-3 sm:px-4 ${focusMode ? 'max-w-none' : 'max-w-7xl'}`}>
          <Link to="/" className="mr-2 flex items-center gap-2 rounded-md px-1 py-1" aria-label={t('nav.home')}>
            <Logo />
            <span className="font-semibold tracking-tight">AeroFMS</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 desktop:flex" aria-label={t('nav.menu')}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass}>
                {t(n.key)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <LanguageQuickSwitch />
            <NavLink to="/settings" className={linkClass} aria-label={t('nav.settings')}>
              <span aria-hidden="true">⚙</span>
              <span className="hidden wide:inline">&nbsp;{t('nav.settings')}</span>
            </NavLink>
            <NavLink to="/account" className={linkClass}>
              {user ? user.displayName.slice(0, 14) : t('nav.account')}
            </NavLink>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-md text-fg-muted hover:bg-surface desktop:hidden"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            >
              ☰
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-line px-3 pb-3 desktop:hidden" aria-label={t('nav.menu')}>
            <div className="grid grid-cols-2 gap-1 pt-2 tablet:grid-cols-3">
              {[...NAV, { to: '/features', key: 'nav.features' }, { to: '/download', key: 'nav.download' }].map((n) => (
                <NavLink key={n.to} to={n.to} className={linkClass}>
                  {t(n.key)}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
        {!online && <div className="border-t border-warn/40 bg-warn/10 px-4 py-1.5 text-center text-xs text-warn">{t('app.offline')}</div>}
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      {!focusMode && (
        <footer className="border-t border-line bg-bg-elevated">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-fg-muted">
            <p className="max-w-3xl text-xs leading-relaxed text-fg-faint">{t('app.disclaimerShort')}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Link to="/features" className="hover:text-fg">{t('nav.features')}</Link>
              <Link to="/download" className="hover:text-fg">{t('nav.download')}</Link>
              <Link to="/disclaimer" className="hover:text-fg">{t('nav.disclaimer')}</Link>
              <Link to="/privacy" className="hover:text-fg">{t('nav.privacy')}</Link>
              <Link to="/terms" className="hover:text-fg">{t('nav.terms')}</Link>
              <Link to="/help" className="hover:text-fg">{t('nav.help')}</Link>
            </div>
            <p className="text-xs text-fg-faint">© 2026 AeroFMS · {t('legal.contact')}</p>
          </div>
        </footer>
      )}
    </div>
  )
}
