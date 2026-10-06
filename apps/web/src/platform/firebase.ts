import { initializeApp } from 'firebase/app'
import type { FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import type { Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { readFirebaseConfig } from '@aerofms/cloud'
import type { AnalyticsSink, FirebaseClientConfig } from '@aerofms/cloud'

export interface FirebaseServices {
  config: FirebaseClientConfig
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let services: FirebaseServices | null | undefined

/** Returns Firebase services, or null when this build has no Firebase configuration. */
export function getFirebase(): FirebaseServices | null {
  if (services !== undefined) return services
  const config = readFirebaseConfig(import.meta.env as Record<string, string | undefined>, 'VITE_')
  if (!config) {
    services = null
    return services
  }
  const app = initializeApp(config)
  const siteKey = import.meta.env.VITE_APPCHECK_RECAPTCHA_KEY as string | undefined
  if (siteKey) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true })
  }
  const auth = getAuth(app)
  const db = getFirestore(app)
  if (import.meta.env.VITE_FIREBASE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  services = { config, app, auth, db }
  return services
}

/** Firebase Analytics sink (loaded lazily, only when supported and enabled). */
export function createWebAnalyticsSink(): AnalyticsSink {
  let enabled = false
  let ready: Promise<((event: string, params: Record<string, unknown>) => void) | null> | undefined
  const load = () => {
    ready ??= (async () => {
      const fb = getFirebase()
      if (!fb || !fb.config.measurementId) return null
      const mod = await import('firebase/analytics')
      if (!(await mod.isSupported())) return null
      const analytics = mod.getAnalytics(fb.app)
      mod.setAnalyticsCollectionEnabled(analytics, enabled)
      return (event: string, params: Record<string, unknown>) => mod.logEvent(analytics, event, params)
    })().catch(() => null)
    return ready
  }
  return {
    setEnabled(v) {
      enabled = v
      if (v) void load()
    },
    log(event, params) {
      if (!enabled) return
      void load().then((log) => log?.(event, params))
    },
  }
}
