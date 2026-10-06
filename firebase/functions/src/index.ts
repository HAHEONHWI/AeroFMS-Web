import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { setGlobalOptions } from 'firebase-functions'
import { defineBoolean } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/https'
import * as v1 from 'firebase-functions/v1'
import { deleteUserData } from './cleanup.js'

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
