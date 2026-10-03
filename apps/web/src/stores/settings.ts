import { create } from 'zustand'
import type { LanguagePreference } from '@aerofms/i18n'
import type { UnitSystem } from '@aerofms/shared'
import type { UserLevel } from '@aerofms/training'
import { services } from '@/services/runtime'

export type ThemePreference = 'dark' | 'dim' | 'system'
export type EmulatorLayout = 'CDU' | 'SPLIT' | 'MAP'
export type ViewMode = 'CLASSIC' | 'MODERN'

export interface Settings {
  language: LanguagePreference
  theme: ThemePreference
  units: UnitSystem
  mapBasemap: boolean
  mapAirways: boolean
  sound: 'off' | 'soft' | 'classic'
  haptic: boolean
  trainingLevel: UserLevel
  replayEnabled: boolean
  analytics: boolean
  crashReports: boolean
  cloudSync: boolean
  onboardingDone: boolean
  layout: EmulatorLayout
  viewMode: ViewMode
  connectorHost: string
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  theme: 'dark',
  units: 'AVIATION',
  mapBasemap: false,
  mapAirways: true,
  sound: 'soft',
  haptic: true,
  trainingLevel: 'BEGINNER',
  replayEnabled: true,
  analytics: false,
  crashReports: false,
  cloudSync: true,
  onboardingDone: false,
  layout: 'SPLIT',
  viewMode: 'CLASSIC',
  connectorHost: 'localhost:8787',
}

const KEY = 'settings'

interface SettingsStore {
  settings: Settings
  loaded: boolean
  load(): Promise<void>
  update(patch: Partial<Settings>): void
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    const stored = await services().kv.get<Partial<Settings>>(KEY)
    set({ settings: { ...DEFAULT_SETTINGS, ...(stored ?? {}) }, loaded: true })
  },
  update(patch) {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    void services()
      .kv.set(KEY, next)
      .then(() => services().database.persistNow())
    if ('replayEnabled' in patch) services().sessions.recording = next.replayEnabled
  },
}))
