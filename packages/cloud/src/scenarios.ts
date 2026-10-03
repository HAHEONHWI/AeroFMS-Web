import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where, addDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { Functions } from 'firebase/functions'
import { httpsCallable } from 'firebase/functions'
import { SHARE_CODE_PATTERN } from '@aerofms/shared'
import { validateScenario } from '@aerofms/training'
import type { AttemptResult, Scenario } from '@aerofms/training'
import { COLLECTIONS } from './schema'
import type { AttemptDoc, ScenarioDoc } from './schema'

const textOf = (t: Scenario['title']): string => ('text' in t ? t.text : t.key)

export interface CloudScenario {
  scenario: Scenario
  ownerUid: string
  authorName: string
  shareCode: string | null
  updatedAt: number
}

function fromDoc(id: string, d: ScenarioDoc): CloudScenario | null {
  try {
    const parsed = validateScenario({ ...JSON.parse(d.dataJson), id, visibility: d.visibility })
    if (!parsed.ok) return null
    return { scenario: { ...parsed.scenario, shareCode: d.shareCode ?? undefined, authorName: d.authorName, authorUid: d.ownerUid }, ownerUid: d.ownerUid, authorName: d.authorName, shareCode: d.shareCode, updatedAt: d.updatedAt }
  } catch {
    return null
  }
}

/** Scenario sharing and instructor data in Firestore. */
export class ScenarioCloud {
  constructor(
    private readonly db: Firestore,
    private readonly functions: Functions,
  ) {}

  async save(uid: string, authorName: string, scenario: Scenario): Promise<void> {
    const v = validateScenario(scenario)
    if (!v.ok) throw new Error(`INVALID_SCENARIO:${v.error}`)
    const ref = doc(this.db, COLLECTIONS.scenarios, scenario.id)
    const existing = await getDoc(ref)
    const prev = existing.exists() ? (existing.data() as ScenarioDoc) : undefined
    const data: ScenarioDoc = {
      ownerUid: uid,
      authorName: authorName.slice(0, 40),
      title: textOf(scenario.title).slice(0, 120),
      description: textOf(scenario.description).slice(0, 2000),
      aircraftId: scenario.aircraftId,
      difficulty: scenario.difficulty,
      language: scenario.language,
      visibility: scenario.visibility,
      shareCode: prev?.shareCode ?? null,
      dataJson: JSON.stringify(v.scenario),
      createdAt: prev?.createdAt ?? scenario.createdAt,
      updatedAt: Date.now(),
    }
    await setDoc(ref, data)
  }

  /** Server assigns a unique share code (Cloud Function `createShareCode`). */
  async share(scenarioId: string): Promise<string> {
    const fn = httpsCallable<{ scenarioId: string }, { code: string }>(this.functions, 'createShareCode')
    const res = await fn({ scenarioId })
    return res.data.code
  }

  async getByCode(code: string): Promise<CloudScenario | null> {
    const c = code.trim().toUpperCase()
    if (!SHARE_CODE_PATTERN.test(c)) return null
    const sc = await getDoc(doc(this.db, COLLECTIONS.shareCodes, c))
    if (!sc.exists()) return null
    const id = String((sc.data() as { scenarioId: string }).scenarioId)
    return this.get(id)
  }

  async get(id: string): Promise<CloudScenario | null> {
    const snap = await getDoc(doc(this.db, COLLECTIONS.scenarios, id))
    return snap.exists() ? fromDoc(snap.id, snap.data() as ScenarioDoc) : null
  }

  async listPublic(max = 30): Promise<CloudScenario[]> {
    const q = query(collection(this.db, COLLECTIONS.scenarios), where('visibility', '==', 'PUBLIC'), orderBy('updatedAt', 'desc'), limit(max))
    return (await getDocs(q)).docs.map((d) => fromDoc(d.id, d.data() as ScenarioDoc)).filter((x): x is CloudScenario => !!x)
  }

  async listMine(uid: string): Promise<CloudScenario[]> {
    const q = query(collection(this.db, COLLECTIONS.scenarios), where('ownerUid', '==', uid), orderBy('updatedAt', 'desc'), limit(100))
    return (await getDocs(q)).docs.map((d) => fromDoc(d.id, d.data() as ScenarioDoc)).filter((x): x is CloudScenario => !!x)
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(this.db, COLLECTIONS.scenarios, id))
  }

  async submitAttempt(scenarioId: string, uid: string, displayName: string, r: AttemptResult): Promise<void> {
    const data: AttemptDoc = {
      uid,
      displayName: displayName.slice(0, 40),
      score: r.score,
      correctInputs: r.correctInputs,
      incorrectInputs: r.incorrectInputs,
      hintsUsed: r.hintsUsed,
      timeSec: r.timeSec,
      completionPct: r.completionPct,
      createdAt: Date.now(),
    }
    await addDoc(collection(this.db, COLLECTIONS.scenarios, scenarioId, COLLECTIONS.attempts), data)
  }

  /** Instructor dashboard: attempts on a scenario owned by the caller. */
  async listAttempts(scenarioId: string): Promise<Array<AttemptDoc & { id: string }>> {
    const q = query(collection(this.db, COLLECTIONS.scenarios, scenarioId, COLLECTIONS.attempts), orderBy('createdAt', 'desc'), limit(200))
    return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...(d.data() as AttemptDoc) }))
  }
}
