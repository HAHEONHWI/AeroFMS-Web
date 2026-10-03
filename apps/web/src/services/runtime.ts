import type { AppServices } from './bootstrap'

let current: AppServices | undefined

export function setServices(s: AppServices): void {
  current = s
}

/** Composition root accessor (set once by App bootstrap before any route renders). */
export function services(): AppServices {
  if (!current) throw new Error('AppServices not initialised')
  return current
}

export const isDebugBuild = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_TOOLS === 'true'

export const APP_VERSION = '1.0.0'
