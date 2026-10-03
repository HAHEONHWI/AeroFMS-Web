/**
 * Monetization abstraction. AeroFMS ships with ads disabled; the policy below keeps the
 * emulator, training overlays and replay free of ads so that monetization never interferes
 * with FMC input. Platform implementations (Android: Google Mobile Ads / AdMob) implement
 * `AdService`; the web build uses `DisabledAdService` until a web ad network is chosen.
 */

export type AdPlacement =
  /** Banner at the bottom of the home dashboard. */
  | 'HOME_BANNER'
  /** Banner at the bottom of academy/scenario lists. */
  | 'LIST_BANNER'
  /** Interstitial shown after a completed lesson or scenario result screen is dismissed. */
  | 'RESULT_INTERSTITIAL'
  /** Opt-in rewarded ad that unlocks an extra hint in training. */
  | 'REWARDED_HINT'

export type AdFormat = 'BANNER' | 'INTERSTITIAL' | 'REWARDED'

export const AD_PLACEMENT_FORMAT: Record<AdPlacement, AdFormat> = {
  HOME_BANNER: 'BANNER',
  LIST_BANNER: 'BANNER',
  RESULT_INTERSTITIAL: 'INTERSTITIAL',
  REWARDED_HINT: 'REWARDED',
}

/** Screens on which ads must never be displayed. */
export type AdFreeContext = 'EMULATOR' | 'TRAINING_ACTIVE' | 'REPLAY' | 'ONBOARDING' | 'SETTINGS' | 'LEGAL'

export interface MonetizationConfig {
  /** Master switch (Remote Config: ads_enabled). */
  adsEnabled: boolean
  /** Per placement switches (Remote Config: ads_placements, comma separated). */
  enabledPlacements: AdPlacement[]
  /** Minimum seconds between interstitials (Remote Config: ads_interstitial_interval_sec). */
  interstitialMinIntervalSec: number
  /** Max interstitials per app session. */
  interstitialMaxPerSession: number
  /** User purchased "remove ads" entitlement (future in-app purchase). */
  adFreeEntitlement: boolean
}

export const DEFAULT_MONETIZATION_CONFIG: MonetizationConfig = {
  adsEnabled: false,
  enabledPlacements: ['HOME_BANNER', 'LIST_BANNER', 'RESULT_INTERSTITIAL', 'REWARDED_HINT'],
  interstitialMinIntervalSec: 300,
  interstitialMaxPerSession: 3,
  adFreeEntitlement: false,
}

export type AdConsentStatus = 'UNKNOWN' | 'REQUIRED' | 'NOT_REQUIRED' | 'OBTAINED'

export interface AdRuntimeState {
  consent: AdConsentStatus
  lastInterstitialAt?: number
  interstitialsThisSession: number
  activeContext?: AdFreeContext
}

export type AdDecision = { show: true } | { show: false; reason: string }

/** Pure policy deciding whether a placement may be shown right now. */
export function decideAd(
  placement: AdPlacement,
  config: MonetizationConfig,
  runtime: AdRuntimeState,
  now: number,
): AdDecision {
  if (!config.adsEnabled) return { show: false, reason: 'ads-disabled' }
  if (config.adFreeEntitlement) return { show: false, reason: 'ad-free-entitlement' }
  if (!config.enabledPlacements.includes(placement)) return { show: false, reason: 'placement-disabled' }
  if (runtime.activeContext) return { show: false, reason: `ad-free-context:${runtime.activeContext}` }
  if (runtime.consent === 'REQUIRED' || runtime.consent === 'UNKNOWN') return { show: false, reason: 'consent-pending' }
  if (AD_PLACEMENT_FORMAT[placement] === 'INTERSTITIAL') {
    if (runtime.interstitialsThisSession >= config.interstitialMaxPerSession) {
      return { show: false, reason: 'session-cap' }
    }
    if (
      runtime.lastInterstitialAt !== undefined &&
      now - runtime.lastInterstitialAt < config.interstitialMinIntervalSec * 1000
    ) {
      return { show: false, reason: 'frequency-cap' }
    }
  }
  return { show: true }
}

/** Parses the Remote Config placement list, ignoring unknown entries. */
export function parsePlacements(raw: string): AdPlacement[] {
  const all = Object.keys(AD_PLACEMENT_FORMAT) as AdPlacement[]
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is AdPlacement => (all as string[]).includes(s))
}

export interface AdService {
  readonly provider: 'admob' | 'disabled'
  initialize(): Promise<void>
  /** Requests/refreshes user consent (UMP on Android). */
  requestConsent(): Promise<AdConsentStatus>
  showInterstitial(placement: AdPlacement): Promise<boolean>
  /** Resolves true when the reward was earned. */
  showRewarded(placement: AdPlacement): Promise<boolean>
}

export class DisabledAdService implements AdService {
  readonly provider = 'disabled' as const
  async initialize(): Promise<void> {}
  async requestConsent(): Promise<AdConsentStatus> {
    return 'NOT_REQUIRED'
  }
  async showInterstitial(): Promise<boolean> {
    return false
  }
  async showRewarded(): Promise<boolean> {
    return false
  }
}
