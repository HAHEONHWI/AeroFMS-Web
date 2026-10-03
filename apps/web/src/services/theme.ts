import type { ThemePreference } from '@/stores/settings'

/** Applies the theme preference (dark / dim / follow system contrast preference). */
export function applyTheme(pref: ThemePreference): void {
  const resolved = pref === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'dim' : 'dark') : pref
  document.documentElement.dataset.theme = resolved
}
