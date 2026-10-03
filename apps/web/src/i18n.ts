import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import { intlLocale, resolveLanguage, resources } from '@aerofms/i18n'
import type { AppLanguage, LanguagePreference } from '@aerofms/i18n'
import type { LocalizedText } from '@aerofms/training'
import { useCallback } from 'react'

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage('system', navigator.languages),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function applyLanguage(pref: LanguagePreference): AppLanguage {
  const lang = resolveLanguage(pref, navigator.languages)
  void i18n.changeLanguage(lang)
  document.documentElement.lang = lang
  return lang
}

export const currentLanguage = (): AppLanguage => (i18n.language === 'ko' ? 'ko' : 'en')

/** Renders training/scenario text that is either an i18n key or literal user text. */
export function useLocalized(): (text: LocalizedText | undefined) => string {
  const { t } = useTranslation()
  return useCallback((text) => (!text ? '' : 'key' in text ? t(text.key, text.params ?? {}) : text.text), [t])
}

export function useIntlLocale(): string {
  const { i18n: inst } = useTranslation()
  return intlLocale(inst.language === 'ko' ? 'ko' : 'en')
}

export default i18n
