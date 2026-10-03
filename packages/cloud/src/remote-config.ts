import { DEFAULT_MONETIZATION_CONFIG, parsePlacements } from '@aerofms/shared'
import type { MonetizationConfig } from '@aerofms/shared'

/** Typed app configuration controlled by Firebase Remote Config. */
export interface AppRemoteConfig {
  minimumSupportedVersion: string
  noticeKo: string
  noticeEn: string
  maintenanceMessage: string
  navDatabaseAvailable: boolean
  features: {
    cloudSync: boolean
    scenarioSharing: boolean
    instructorMode: boolean
    simulatorConnector: boolean
  }
  monetization: MonetizationConfig
}

export const DEFAULT_REMOTE_CONFIG: AppRemoteConfig = {
  minimumSupportedVersion: '1.0.0',
  noticeKo: '',
  noticeEn: '',
  maintenanceMessage: '',
  navDatabaseAvailable: true,
  features: { cloudSync: true, scenarioSharing: true, instructorMode: true, simulatorConnector: true },
  monetization: DEFAULT_MONETIZATION_CONFIG,
}

const bool = (v: string | undefined, d: boolean): boolean => (v === undefined ? d : v === 'true')
const num = (v: string | undefined, d: number): number => (v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d)

export function parseRemoteConfig(entries: Record<string, string>): AppRemoteConfig {
  const d = DEFAULT_REMOTE_CONFIG
  return {
    minimumSupportedVersion: entries.min_supported_version ?? d.minimumSupportedVersion,
    noticeKo: entries.notice_ko ?? '',
    noticeEn: entries.notice_en ?? '',
    maintenanceMessage: entries.maintenance_message ?? '',
    navDatabaseAvailable: bool(entries.nav_db_available, true),
    features: {
      cloudSync: bool(entries.feature_cloud_sync, true),
      scenarioSharing: bool(entries.feature_scenario_sharing, true),
      instructorMode: bool(entries.feature_instructor_mode, true),
      simulatorConnector: bool(entries.feature_simulator_connector, true),
    },
    monetization: {
      adsEnabled: bool(entries.ads_enabled, false),
      enabledPlacements: entries.ads_placements ? parsePlacements(entries.ads_placements) : d.monetization.enabledPlacements,
      interstitialMinIntervalSec: num(entries.ads_interstitial_interval_sec, d.monetization.interstitialMinIntervalSec),
      interstitialMaxPerSession: num(entries.ads_interstitial_max_per_session, d.monetization.interstitialMaxPerSession),
      adFreeEntitlement: false,
    },
  }
}

/** Compares semantic versions "1.2.3". Returns true when `current` < `minimum`. */
export function isVersionBelow(current: string, minimum: string): boolean {
  const a = current.split('.').map((x) => Number(x) || 0)
  const b = minimum.split('.').map((x) => Number(x) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

/**
 * Fetches Remote Config through the public client REST endpoint (the same one the Firebase
 * client SDKs use). Works in browsers and React Native without native modules.
 */
export async function fetchRemoteConfig(opts: {
  projectId: string
  apiKey: string
  appId: string
  appInstanceId: string
  fetchFn?: typeof fetch
  timeoutMs?: number
}): Promise<AppRemoteConfig> {
  const f = opts.fetchFn ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000)
  try {
    const res = await f(
      `https://firebaseremoteconfig.googleapis.com/v1/projects/${encodeURIComponent(opts.projectId)}/namespaces/firebase:fetch?key=${encodeURIComponent(opts.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: opts.appId, appInstanceId: opts.appInstanceId }),
        signal: ctrl.signal,
      },
    )
    if (!res.ok) return DEFAULT_REMOTE_CONFIG
    const body = (await res.json()) as { entries?: Record<string, string> }
    return parseRemoteConfig(body.entries ?? {})
  } catch {
    return DEFAULT_REMOTE_CONFIG
  } finally {
    clearTimeout(timer)
  }
}
