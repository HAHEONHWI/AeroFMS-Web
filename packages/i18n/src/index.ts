import en from './locales/en.json'
import ko from './locales/ko.json'

export type AppLanguage = 'ko' | 'en'
export type LanguagePreference = AppLanguage | 'system'

export const SUPPORTED_LANGUAGES: AppLanguage[] = ['ko', 'en']

export const resources = {
  ko: { translation: ko },
  en: { translation: en },
} as const

/** Korean device/browser locale → Korean, everything else → English. */
export function detectLanguage(locales: readonly string[] | string | undefined): AppLanguage {
  const list = Array.isArray(locales) ? locales : locales ? [locales] : []
  return list.some((l) => typeof l === 'string' && l.toLowerCase().startsWith('ko')) ? 'ko' : 'en'
}

export function resolveLanguage(pref: LanguagePreference, systemLocales: readonly string[] | string | undefined): AppLanguage {
  return pref === 'system' ? detectLanguage(systemLocales) : pref
}

export const intlLocale = (lang: AppLanguage): string => (lang === 'ko' ? 'ko-KR' : 'en-US')

export function formatNumber(lang: AppLanguage, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(lang), options).format(value)
}

export function formatDateTime(lang: AppLanguage, epochMs: number, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  return new Intl.DateTimeFormat(intlLocale(lang), options).format(new Date(epochMs))
}

type RelUnit = 'second' | 'minute' | 'hour' | 'day'

/** Used where Intl.RelativeTimeFormat is unavailable (Hermes on React Native). */
const RELATIVE_FALLBACK: Record<AppLanguage, Record<RelUnit, [past: string, future: string]>> = {
  en: { second: ['{n}s ago', 'in {n}s'], minute: ['{n} min ago', 'in {n} min'], hour: ['{n} h ago', 'in {n} h'], day: ['{n} d ago', 'in {n} d'] },
  ko: { second: ['{n}초 전', '{n}초 후'], minute: ['{n}분 전', '{n}분 후'], hour: ['{n}시간 전', '{n}시간 후'], day: ['{n}일 전', '{n}일 후'] },
}

export function formatRelative(lang: AppLanguage, epochMs: number, now = Date.now()): string {
  const diff = (epochMs - now) / 1000
  const abs = Math.abs(diff)
  const [value, unit]: [number, RelUnit] = abs < 60 ? [Math.round(diff), 'second'] : abs < 3600 ? [Math.round(diff / 60), 'minute'] : abs < 86400 ? [Math.round(diff / 3600), 'hour'] : [Math.round(diff / 86400), 'day']
  if (typeof Intl.RelativeTimeFormat === 'function') return new Intl.RelativeTimeFormat(intlLocale(lang), { numeric: 'auto' }).format(value, unit)
  const [past, future] = RELATIVE_FALLBACK[lang][unit]
  return (value < 0 ? past : future).replace('{n}', String(Math.abs(value)))
}

/** Flattens nested resources into dotted keys (used by the i18n consistency check). */
export function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k))
}

export { en, ko }
