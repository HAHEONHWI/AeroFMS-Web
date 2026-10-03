import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions'
import { defineBoolean } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/https'
import * as v1 from 'firebase-functions/v1'
import { deleteUserData } from './cleanup.js'
import { generateShareCode } from './share-code.js'

initializeApp()

/** Region must match the clients (FUNCTIONS_REGION in apps). */
const REGION = 'asia-northeast3'
setGlobalOptions({ region: REGION, maxInstances: 10 })

/** Set to true after registering the apps with Firebase App Check. */
const ENFORCE_APP_CHECK = defineBoolean('ENFORCE_APP_CHECK', { default: false })

const callableOptions = { enforceAppCheck: ENFORCE_APP_CHECK, cors: true }

function requireAuth(auth: { uid: string; token: Record<string, unknown> } | undefined): { uid: string; token: Record<string, unknown> } {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required')
  return auth
}

/**
 * Assigns a unique share code to a scenario owned by the caller.
 * Codes are written with the Admin SDK so clients can never forge or steal one.
 */
export const createShareCode = onCall<{ scenarioId?: unknown }>(callableOptions, async (req) => {
  const { uid } = requireAuth(req.auth)
  const scenarioId = req.data.scenarioId
  if (typeof scenarioId !== 'string' || scenarioId.length === 0 || scenarioId.length > 64) {
    throw new HttpsError('invalid-argument', 'scenarioId required')
  }
  const db = getFirestore()
  const ref = db.doc(`scenarios/${scenarioId}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Scenario not found')
    if (snap.get('ownerUid') !== uid) throw new HttpsError('permission-denied', 'Not the owner')
    const existing = snap.get('shareCode') as string | null
    if (existing) return { code: existing }
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateShareCode()
      const codeRef = db.doc(`shareCodes/${code}`)
      const taken = await tx.get(codeRef)
      if (taken.exists) continue
      tx.set(codeRef, { scenarioId, ownerUid: uid, createdAt: FieldValue.serverTimestamp() })
      tx.update(ref, { shareCode: code, visibility: snap.get('visibility') === 'PRIVATE' ? 'UNLISTED' : snap.get('visibility') })
      return { code }
    }
    throw new HttpsError('resource-exhausted', 'Could not allocate a share code')
  })
})

/**
 * Deletes the caller's cloud data and Firebase Auth account (Play Store account-deletion requirement).
 */
export const deleteAccount = onCall(callableOptions, async (req) => {
  const { uid } = requireAuth(req.auth)
  await deleteUserData(uid)
  await getAuth().deleteUser(uid)
  return { deleted: true }
})

/** Admin only: grants or revokes the instructor role via custom claims. */
export const setUserRole = onCall<{ uid?: unknown; instructor?: unknown }>(callableOptions, async (req) => {
  const auth = requireAuth(req.auth)
  if (auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admin only')
  const { uid, instructor } = req.data
  if (typeof uid !== 'string' || typeof instructor !== 'boolean') throw new HttpsError('invalid-argument', 'uid and instructor required')
  const user = await getAuth().getUser(uid)
  await getAuth().setCustomUserClaims(uid, { ...(user.customClaims ?? {}), instructor })
  return { uid, instructor }
})

/** Safety net: if an Auth user is deleted by any other path, clean up their data too. */
export const onUserDeleted = v1.region(REGION).auth.user().onDelete(async (user) => {
  await deleteUserData(user.uid)
})
