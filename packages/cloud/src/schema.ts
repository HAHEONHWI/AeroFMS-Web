/**
 * Firestore layout (see firebase/firestore.rules):
 *
 *  users/{uid}                                  profile (private)
 *  users/{uid}/aircraftSessions/{sessionId}     synced FMC sessions
 *  users/{uid}/trainingProgress/{lessonId}      lesson progress
 *  users/{uid}/flightPlans/{planId}             saved flight plans
 *  users/{uid}/replays/{replayId}               replay metadata (payload in Storage)
 *  scenarios/{scenarioId}                       user scenarios (PRIVATE / UNLISTED / PUBLIC)
 *  scenarios/{scenarioId}/attempts/{attemptId}  attempts (student + scenario owner can read)
 *  shareCodes/{code}                            code → scenarioId (written by Cloud Functions)
 *  publicProfiles/{uid}                         display name only
 *  sharedFlightPlans/{id}                       flight plans shared by link
 */
export const COLLECTIONS = {
  users: 'users',
  aircraftSessions: 'aircraftSessions',
  trainingProgress: 'trainingProgress',
  flightPlans: 'flightPlans',
  replays: 'replays',
  scenarios: 'scenarios',
  attempts: 'attempts',
  shareCodes: 'shareCodes',
  publicProfiles: 'publicProfiles',
  sharedFlightPlans: 'sharedFlightPlans',
} as const

export type SyncedCollection = 'aircraftSessions' | 'trainingProgress' | 'flightPlans'

export interface SyncedSessionDoc {
  aircraftId: string
  name: string
  origin: string | null
  destination: string | null
  stateJson: string
  updatedAt: number
  deviceId: string
}

export interface TrainingProgressDoc {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
  bestScore: number
  lastScore: number
  attempts: number
  completedAt: number | null
  updatedAt: number
}

export interface FlightPlanDoc {
  name: string
  aircraftId: string | null
  planJson: string
  updatedAt: number
}

export interface ScenarioDoc {
  ownerUid: string
  authorName: string
  title: string
  description: string
  aircraftId: string
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  language: 'ko' | 'en'
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC'
  shareCode: string | null
  dataJson: string
  createdAt: number
  updatedAt: number
}

export interface AttemptDoc {
  uid: string
  displayName: string
  score: number
  correctInputs: number
  incorrectInputs: number
  hintsUsed: number
  timeSec: number
  completionPct: number
  createdAt: number
}

export interface ReplayDoc {
  sessionId: string
  title: string
  aircraftId: string
  actionCount: number
  storagePath: string
  createdAt: number
}

/** Maximum serialized session size accepted for sync (Firestore document limit is 1 MiB). */
export const MAX_SESSION_JSON_BYTES = 900_000
