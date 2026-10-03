import { httpsCallable } from 'firebase/functions'
import type { Functions } from 'firebase/functions'
import { doc, setDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { ref, uploadString } from 'firebase/storage'
import type { FirebaseStorage } from 'firebase/storage'
import { COLLECTIONS } from './schema'
import type { ReplayDoc } from './schema'

/** Calls the `deleteAccount` Cloud Function, which removes all cloud data and the Auth user. */
export async function deleteAccountInCloud(functions: Functions): Promise<void> {
  const fn = httpsCallable<Record<string, never>, { deleted: boolean }>(functions, 'deleteAccount')
  const res = await fn({})
  if (!res.data.deleted) throw new Error('DELETE_FAILED')
}

export async function upsertProfile(db: Firestore, uid: string, displayName: string): Promise<void> {
  const name = displayName.slice(0, 40)
  await setDoc(doc(db, COLLECTIONS.users, uid), { displayName: name, updatedAt: Date.now() }, { merge: true })
  await setDoc(doc(db, COLLECTIONS.publicProfiles, uid), { displayName: name, updatedAt: Date.now() })
}

/** Uploads a replay (baseline + actions JSON) to Storage and records its metadata. */
export async function uploadReplay(
  db: Firestore,
  storage: FirebaseStorage,
  uid: string,
  replay: { id: string; sessionId: string; title: string; aircraftId: string; payload: unknown; actionCount: number },
): Promise<void> {
  const path = `replays/${uid}/${replay.id}.json`
  await uploadString(ref(storage, path), JSON.stringify(replay.payload), 'raw', { contentType: 'application/json' })
  const data: ReplayDoc = {
    sessionId: replay.sessionId,
    title: replay.title.slice(0, 80),
    aircraftId: replay.aircraftId,
    actionCount: replay.actionCount,
    storagePath: path,
    createdAt: Date.now(),
  }
  await setDoc(doc(db, COLLECTIONS.users, uid, COLLECTIONS.replays, replay.id), data)
}
