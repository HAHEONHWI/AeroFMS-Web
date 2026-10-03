import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { upgradeFmsState } from '@aerofms/core'
import type { FlightPlanRepository, SessionRepository, SyncOutboxRepository, TrainingProgressRepository } from '@aerofms/core'
import type { FlightPlan } from '@aerofms/shared'
import { COLLECTIONS, MAX_SESSION_JSON_BYTES } from './schema'
import type { FlightPlanDoc, SyncedCollection, SyncedSessionDoc, TrainingProgressDoc } from './schema'

export interface CloudSyncDeps {
  db: Firestore
  uid: string
  deviceId: string
  outbox: SyncOutboxRepository
  sessions: SessionRepository
  progress: TrainingProgressRepository
  flightPlans: FlightPlanRepository
}

export interface SyncReport {
  pushed: number
  pulledSessions: string[]
  pulledProgress: number
  pulledFlightPlans: number
  skippedTooLarge: string[]
}

/**
 * Offline-first sync. Local SQLite is the source of truth; changes are queued in the
 * outbox and pushed when online. Pull uses last-write-wins per document (updatedAt).
 */
export class CloudSync {
  constructor(private readonly d: CloudSyncDeps) {}

  private col(name: SyncedCollection) {
    return collection(this.d.db, COLLECTIONS.users, this.d.uid, name)
  }

  enqueue(collectionName: SyncedCollection, docId: string, op: 'UPSERT' | 'DELETE' = 'UPSERT'): Promise<void> {
    return this.d.outbox.enqueue(collectionName, docId, op)
  }

  async push(report: SyncReport): Promise<void> {
    for (;;) {
      const batch = await this.d.outbox.peek(25)
      if (!batch.length) return
      for (const entry of batch) {
        const name = entry.collection as SyncedCollection
        const ref = doc(this.col(name), entry.docId)
        if (entry.op === 'DELETE') {
          await deleteDoc(ref)
        } else if (name === 'aircraftSessions') {
          const loaded = await this.d.sessions.load(entry.docId)
          if (loaded.state) {
            const stateJson = JSON.stringify(loaded.state)
            if (stateJson.length > MAX_SESSION_JSON_BYTES) {
              report.skippedTooLarge.push(entry.docId)
            } else {
              const data: SyncedSessionDoc = {
                aircraftId: loaded.state.aircraft.aircraftId,
                name: loaded.state.session.name,
                origin: loaded.state.activeFlightPlan.origin ?? null,
                destination: loaded.state.activeFlightPlan.destination ?? null,
                stateJson,
                updatedAt: loaded.state.session.updatedAt,
                deviceId: this.d.deviceId,
              }
              await setDoc(ref, data)
            }
          }
        } else if (name === 'trainingProgress') {
          const rec = (await this.d.progress.list()).find((r) => r.lessonId === entry.docId)
          if (rec) {
            const data: TrainingProgressDoc = {
              status: rec.status,
              bestScore: rec.bestScore,
              lastScore: rec.lastScore,
              attempts: rec.attempts,
              completedAt: rec.completedAt ?? null,
              updatedAt: rec.updatedAt,
            }
            await setDoc(ref, data)
          }
        } else if (name === 'flightPlans') {
          const fp = (await this.d.flightPlans.list()).find((p) => p.id === entry.docId)
          if (fp) {
            const data: FlightPlanDoc = { name: fp.name, aircraftId: fp.aircraftId ?? null, planJson: JSON.stringify(fp.plan), updatedAt: fp.updatedAt }
            await setDoc(ref, data)
          }
        }
        await this.d.outbox.remove(entry.id)
        report.pushed++
      }
    }
  }

  async pull(report: SyncReport): Promise<void> {
    const localSessions = new Map((await this.d.sessions.list()).map((s) => [s.id, s]))
    for (const snap of (await getDocs(this.col('aircraftSessions'))).docs) {
      const data = snap.data() as SyncedSessionDoc
      const local = localSessions.get(snap.id)
      if (local && local.updatedAt >= data.updatedAt) continue
      try {
        const state = upgradeFmsState(JSON.parse(data.stateJson))
        await this.d.sessions.save(state)
        await this.d.sessions.saveSnapshot(state.session.sessionId, state.session.actionCount, state)
        report.pulledSessions.push(snap.id)
      } catch {
        // Ignore malformed remote documents; local data stays intact.
      }
    }
    for (const snap of (await getDocs(this.col('trainingProgress'))).docs) {
      const data = snap.data() as TrainingProgressDoc
      await this.d.progress.merge({
        lessonId: snap.id,
        status: data.status,
        bestScore: data.bestScore,
        lastScore: data.lastScore,
        attempts: data.attempts,
        completedAt: data.completedAt ?? undefined,
        updatedAt: data.updatedAt,
      })
      report.pulledProgress++
    }
    const localPlans = new Map((await this.d.flightPlans.list()).map((p) => [p.id, p]))
    for (const snap of (await getDocs(this.col('flightPlans'))).docs) {
      const data = snap.data() as FlightPlanDoc
      const local = localPlans.get(snap.id)
      if (local && local.updatedAt >= data.updatedAt) continue
      try {
        await this.d.flightPlans.save({
          id: snap.id,
          name: data.name,
          aircraftId: data.aircraftId ?? undefined,
          plan: JSON.parse(data.planJson) as FlightPlan,
          createdAt: local?.createdAt ?? data.updatedAt,
          updatedAt: data.updatedAt,
        })
        report.pulledFlightPlans++
      } catch {
        // skip malformed
      }
    }
  }

  async syncAll(): Promise<SyncReport> {
    const report: SyncReport = { pushed: 0, pulledSessions: [], pulledProgress: 0, pulledFlightPlans: 0, skippedTooLarge: [] }
    await this.push(report)
    await this.pull(report)
    return report
  }
}
