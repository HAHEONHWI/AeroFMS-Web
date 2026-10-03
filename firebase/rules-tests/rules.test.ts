import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, addDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

const scenario = (owner: string, visibility: string) => ({
  ownerUid: owner,
  authorName: 'Pilot',
  title: 'T',
  description: 'D',
  aircraftId: 'B737-800',
  difficulty: 'EASY',
  language: 'ko',
  visibility,
  shareCode: null,
  dataJson: '{}',
  createdAt: 1,
  updatedAt: 1,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-aerofms',
    firestore: { rules: readFileSync('../firestore.rules', 'utf8') },
  })
})
afterAll(async () => env.cleanup())
beforeEach(async () => env.clearFirestore())

describe('private user data', () => {
  it('owner can write a session, others cannot read it', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    const bob = env.authenticatedContext('bob').firestore()
    const ref = 'users/alice/aircraftSessions/s1'
    await assertSucceeds(setDoc(doc(alice, ref), { aircraftId: 'B737-800', name: 'x', origin: null, destination: null, stateJson: '{}', updatedAt: 1, deviceId: 'd' }))
    await assertFails(getDoc(doc(bob, ref)))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), ref)))
  })
  it('rejects unexpected fields (no client-side role escalation)', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(alice, 'users/alice'), { displayName: 'A', updatedAt: 1, role: 'admin' }))
    await assertSucceeds(setDoc(doc(alice, 'users/alice'), { displayName: 'A', updatedAt: 1 }))
  })
  it('training progress score must be 0..100', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(alice, 'users/alice/trainingProgress/l1'), { status: 'COMPLETED', bestScore: 900, lastScore: 1, attempts: 1, completedAt: null, updatedAt: 1 }))
  })
})

describe('scenarios', () => {
  it('owner creates; shareCode cannot be set by clients', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertSucceeds(setDoc(doc(alice, 'scenarios/sc1'), scenario('alice', 'PRIVATE')))
    await assertFails(updateDoc(doc(alice, 'scenarios/sc1'), { shareCode: 'AERO-AAAAA' }))
    await assertFails(setDoc(doc(alice, 'scenarios/sc2'), scenario('bob', 'PUBLIC')))
  })
  it('private scenarios are hidden, unlisted readable by id, only public listable', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'scenarios/priv'), scenario('alice', 'PRIVATE'))
      await setDoc(doc(db, 'scenarios/unl'), scenario('alice', 'UNLISTED'))
      await setDoc(doc(db, 'scenarios/pub'), scenario('alice', 'PUBLIC'))
    })
    const bob = env.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(bob, 'scenarios/priv')))
    await assertSucceeds(getDoc(doc(bob, 'scenarios/unl')))
    await assertSucceeds(getDocs(query(collection(bob, 'scenarios'), where('visibility', '==', 'PUBLIC'))))
    await assertFails(getDocs(collection(bob, 'scenarios')))
  })
  it('attempts: student writes own, owner reads, others cannot', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'scenarios/unl'), scenario('alice', 'UNLISTED')))
    const bob = env.authenticatedContext('bob').firestore()
    const att = { uid: 'bob', displayName: 'Bob', score: 80, correctInputs: 5, incorrectInputs: 1, hintsUsed: 0, timeSec: 60, completionPct: 100, createdAt: 1 }
    const ref = await assertSucceeds(addDoc(collection(bob, 'scenarios/unl/attempts'), att))
    await assertFails(addDoc(collection(bob, 'scenarios/unl/attempts'), { ...att, uid: 'carol' }))
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), ref.path)))
    await assertFails(getDoc(doc(env.authenticatedContext('carol').firestore(), ref.path)))
  })
  it('share codes are readable but not writable by clients', async () => {
    const bob = env.authenticatedContext('bob').firestore()
    await assertFails(setDoc(doc(bob, 'shareCodes/AERO-AAAAA'), { scenarioId: 'x' }))
    await assertSucceeds(getDoc(doc(bob, 'shareCodes/AERO-AAAAA')))
  })
})
