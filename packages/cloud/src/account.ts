import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where, writeBatch } from 'firebase/firestore'
import type { DocumentReference, Firestore } from 'firebase/firestore'
import { COLLECTIONS } from './schema'
import type { ReplayDoc } from './schema'

/** Firestore stores the replay JSON inline (document limit is 1 MiB). */
export const MAX_REPLAY_JSON_BYTES = 900_000

async function deleteAll(db: Firestore, refs: DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db)
    for (const r of refs.slice(i, i + 400)) batch.delete(r)
    await batch.commit()
  }
}

/**
 * Removes every piece of cloud data owned by the signed-in user (Play account-deletion requirement).
 * Runs on the client under Security Rules, so it works without Cloud Functions; it is idempotent.
 * The caller deletes the Auth user afterwards.
 */
export async function deleteUserCloudData(db: Firestore, uid: string): Promise<void> {
  for (const sub of [COLLECTIONS.aircraftSessions, COLLECTIONS.trainingProgress, COLLECTIONS.flightPlans, COLLECTIONS.replays]) {
    const snap = await getDocs(collection(db, COLLECTIONS.users, uid, sub))
    await deleteAll(db, snap.docs.map((d) => d.ref))
  }
  const scenarios = await getDocs(query(collection(db, COLLECTIONS.scenarios), where('ownerUid', '==', uid)))
  for (const s of scenarios.docs) {
    const attempts = await getDocs(collection(s.ref, COLLECTIONS.attempts))
    await deleteAll(db, attempts.docs.map((d) => d.ref))
    const code = s.get('shareCode') as string | null
    if (code) await deleteDoc(doc(db, COLLECTIONS.shareCodes, code))
    await deleteDoc(s.ref)
  }
  // Attempts on other people's scenarios.
  const own = await getDocs(query(collectionGroup(db, COLLECTIONS.attempts), where('uid', '==', uid)))
  await deleteAll(db, own.docs.map((d) => d.ref))
  const shared = await getDocs(query(collection(db, COLLECTIONS.sharedFlightPlans), where('ownerUid', '==', uid)))
  await deleteAll(db, shared.docs.map((d) => d.ref))
  await deleteDoc(doc(db, COLLECTIONS.publicProfiles, uid))
  await deleteDoc(doc(db, COLLECTIONS.users, uid))
}

export async function upsertProfile(db: Firestore, uid: string, displayName: string): Promise<void> {
  const name = displayName.slice(0, 40)
  await setDoc(doc(db, COLLECTIONS.users, uid), { displayName: name, updatedAt: Date.now() }, { merge: true })
  await setDoc(doc(db, COLLECTIONS.publicProfiles, uid), { displayName: name, updatedAt: Date.now() })
}

export interface CloudReplaySummary {
  id: string
  sessionId: string
  title: string
  aircraftId: string
  actionCount: number
  createdAt: number
}

/** Saves a replay (a session export: baseline + actions) to the user's private cloud space. */
export async function uploadReplay(
  db: Firestore,
  uid: string,
  replay: { id: string; sessionId: string; title: string; aircraftId: string; actionCount: number; payload: unknown },
): Promise<void> {
  const payloadJson = JSON.stringify(replay.payload)
  if (payloadJson.length > MAX_REPLAY_JSON_BYTES) throw new Error('REPLAY_TOO_LARGE')
  const data: ReplayDoc = {
    sessionId: replay.sessionId,
    title: replay.title.slice(0, 80),
    aircraftId: replay.aircraftId,
    actionCount: replay.actionCount,
    payloadJson,
    createdAt: Date.now(),
  }
  await setDoc(doc(db, COLLECTIONS.users, uid, COLLECTIONS.replays, replay.id), data)
}

export async function listCloudReplays(db: Firestore, uid: string, max = 50): Promise<CloudReplaySummary[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.users, uid, COLLECTIONS.replays), orderBy('createdAt', 'desc'), limit(max)))
  return snap.docs.map((d) => {
    const r = d.data() as ReplayDoc
    return { id: d.id, sessionId: r.sessionId, title: r.title, aircraftId: r.aircraftId, actionCount: r.actionCount, createdAt: r.createdAt }
  })
}

/** Returns the stored payload (parsed JSON) or null when it no longer exists. */
export async function loadCloudReplay(db: Firestore, uid: string, id: string): Promise<unknown> {
  const snap = await getDoc(doc(db, COLLECTIONS.users, uid, COLLECTIONS.replays, id))
  if (!snap.exists()) return null
  return JSON.parse((snap.data() as ReplayDoc).payloadJson) as unknown
}

export async function deleteCloudReplay(db: Firestore, uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.users, uid, COLLECTIONS.replays, id))
}

/** Structural check for a session export ({ format: 'aerofms-session', state, actions, baseline? }). */
export function isSessionExportPayload(v: unknown): v is { format: 'aerofms-session'; version: 1; state: { aircraft: { aircraftId: string } }; actions: unknown[] } {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  const state = o.state as { aircraft?: { aircraftId?: unknown } } | undefined
  return o.format === 'aerofms-session' && Array.isArray(o.actions) && typeof state?.aircraft?.aircraftId === 'string'
}
