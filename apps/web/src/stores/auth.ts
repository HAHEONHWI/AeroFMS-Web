import { create } from 'zustand'
import { createUserWithEmailAndPassword, deleteUser, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { deleteUserCloudData, upsertProfile } from '@aerofms/cloud'
import { getFirebase } from '@/platform/firebase'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string
  instructor: boolean
  admin: boolean
}

interface AuthStore {
  available: boolean
  user: AuthUser | null
  ready: boolean
  init(): void
  signInGoogle(): Promise<void>
  signInEmail(email: string, password: string): Promise<void>
  signUpEmail(email: string, password: string, displayName: string): Promise<void>
  resetPassword(email: string): Promise<void>
  signOut(): Promise<void>
  deleteAccount(): Promise<void>
}

/** Maps Firebase auth error codes to i18n keys under account.authError.* */
export function authErrorKey(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'account.authError.invalid'
  if (code.includes('email-already-in-use')) return 'account.authError.exists'
  if (code.includes('weak-password')) return 'account.authError.weak'
  if (code.includes('network')) return 'account.authError.network'
  if (code.includes('requires-recent-login')) return 'account.reauthRequired'
  return 'account.authError.generic'
}

async function toAuthUser(u: User): Promise<AuthUser> {
  const token = await u.getIdTokenResult().catch(() => null)
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName ?? u.email?.split('@')[0] ?? 'Pilot',
    instructor: token?.claims.instructor === true || token?.claims.admin === true,
    admin: token?.claims.admin === true,
  }
}

export const useAuth = create<AuthStore>((set) => ({
  available: false,
  user: null,
  ready: false,
  init() {
    const fb = getFirebase()
    if (!fb) {
      set({ available: false, ready: true })
      return
    }
    set({ available: true })
    onAuthStateChanged(fb.auth, (u) => {
      if (!u) {
        set({ user: null, ready: true })
        return
      }
      void toAuthUser(u).then((user) => {
        set({ user, ready: true })
        void upsertProfile(fb.db, user.uid, user.displayName).catch(() => undefined)
      })
    })
  },
  async signInGoogle() {
    const fb = getFirebase()
    if (!fb) throw new Error('unavailable')
    await signInWithPopup(fb.auth, new GoogleAuthProvider())
  },
  async signInEmail(email, password) {
    const fb = getFirebase()
    if (!fb) throw new Error('unavailable')
    await signInWithEmailAndPassword(fb.auth, email.trim(), password)
  },
  async signUpEmail(email, password, displayName) {
    const fb = getFirebase()
    if (!fb) throw new Error('unavailable')
    if (password.length < 8) throw Object.assign(new Error('weak'), { code: 'auth/weak-password' })
    const cred = await createUserWithEmailAndPassword(fb.auth, email.trim(), password)
    if (displayName.trim()) await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 40) })
  },
  async resetPassword(email) {
    const fb = getFirebase()
    if (!fb) throw new Error('unavailable')
    await sendPasswordResetEmail(fb.auth, email.trim())
  },
  async signOut() {
    const fb = getFirebase()
    if (fb) await signOut(fb.auth)
  },
  async deleteAccount() {
    const fb = getFirebase()
    const current = fb?.auth.currentUser
    if (!fb || !current) throw new Error('unavailable')
    // Cloud data first (idempotent), then the Auth user. A stale login fails with
    // auth/requires-recent-login (account.reauthRequired); signing in again and retrying finishes the job.
    await deleteUserCloudData(fb.db, current.uid)
    await deleteUser(current)
    set({ user: null })
  },
}))
