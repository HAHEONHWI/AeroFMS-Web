/** Localisable text: an i18n key (built-in content) or literal text (user-created content). */
export type LocalizedText = { key: string; params?: Record<string, string | number> } | { text: string }

export const k = (key: string, params?: Record<string, string | number>): LocalizedText => ({ key, params })
export const lit = (text: string): LocalizedText => ({ text })
