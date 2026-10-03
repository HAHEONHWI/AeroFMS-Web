import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'

/**
 * Removes every piece of cloud data owned by a user. Idempotent: safe to run from both the
 * `deleteAccount` callable and the Auth onDelete trigger.
 */
export async function deleteUserData(uid: string): Promise<{ scenarios: number; attempts: number }> {
  const db = getFirestore()
  // Private user tree (sessions, progress, flight plans, replay metadata).
  await db.recursiveDelete(db.doc(`users/${uid}`))
  await db.doc(`publicProfiles/${uid}`).delete()

  // Scenarios authored by the user (+ their attempts and share codes).
  const scenarios = await db.collection('scenarios').where('ownerUid', '==', uid).get()
  for (const s of scenarios.docs) {
    const code = s.get('shareCode') as string | null
    if (code) await db.doc(`shareCodes/${code}`).delete()
    await db.recursiveDelete(s.ref)
  }

  // The user's attempts on other people's scenarios.
  const attempts = await db.collectionGroup('attempts').where('uid', '==', uid).get()
  const batch = db.batch()
  attempts.docs.forEach((d) => batch.delete(d.ref))
  if (!attempts.empty) await batch.commit()

  // Shared flight plans.
  const shared = await db.collection('sharedFlightPlans').where('ownerUid', '==', uid).get()
  for (const d of shared.docs) await d.ref.delete()

  // Replay payloads in Cloud Storage.
  try {
    await getStorage().bucket().deleteFiles({ prefix: `replays/${uid}/` })
  } catch (e) {
    logger.warn('replay cleanup failed', { uid, error: String(e) })
  }
  logger.info('user data deleted', { uid, scenarios: scenarios.size, attempts: attempts.size })
  return { scenarios: scenarios.size, attempts: attempts.size }
}
