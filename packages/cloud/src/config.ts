/** Public Firebase client configuration (not secret – protected by Security Rules and App Check). */
export interface FirebaseClientConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

export function readFirebaseConfig(env: Record<string, string | undefined>, prefix: string): FirebaseClientConfig | null {
  const get = (k: string): string | undefined => env[`${prefix}${k}`]?.trim() || undefined
  const cfg = {
    apiKey: get('FIREBASE_API_KEY'),
    authDomain: get('FIREBASE_AUTH_DOMAIN'),
    projectId: get('FIREBASE_PROJECT_ID'),
    storageBucket: get('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: get('FIREBASE_MESSAGING_SENDER_ID'),
    appId: get('FIREBASE_APP_ID'),
    measurementId: get('FIREBASE_MEASUREMENT_ID'),
  }
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId || !cfg.authDomain) return null
  return cfg as FirebaseClientConfig
}
