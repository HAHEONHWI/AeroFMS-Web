import { create } from 'zustand'
import { CloudSync } from '@aerofms/cloud'
import type { SyncReport } from '@aerofms/cloud'
import { getFirebase } from '@/platform/firebase'
import { services } from '@/services/runtime'
import { useAuth } from './auth'
import { useSettings } from './settings'
import { onEngineUpdate, useFms } from './fms'

interface SyncStore {
  running: boolean
  lastSync?: number
  lastReport?: SyncReport
  error?: string
  pending: number
  syncNow(): Promise<void>
  refreshPending(): Promise<void>
}

function deviceId(): string {
  const KEY = 'aerofms.deviceId'
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return 'web'
  }
}

export const useSync = create<SyncStore>((set, get) => ({
  running: false,
  pending: 0,
  async refreshPending() {
    set({ pending: await services().outbox.count() })
  },
  async syncNow() {
    const fb = getFirebase()
    const user = useAuth.getState().user
    if (!fb || !user || !useSettings.getState().settings.cloudSync || get().running) return
    if (!navigator.onLine) return
    set({ running: true, error: undefined })
    try {
      const s = services()
      await s.sessions.flush()
      const sync = new CloudSync({ db: fb.db, uid: user.uid, deviceId: deviceId(), outbox: s.outbox, sessions: s.sessions.sessions, progress: s.progress, flightPlans: s.flightPlans })
      const report = await sync.syncAll()
      set({ lastSync: Date.now(), lastReport: report })
      // If the open session was updated from another device, reload it.
      const open = useFms.getState().state?.session.sessionId
      if (open && report.pulledSessions.includes(open)) await useFms.getState().restoreFromLatest()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ running: false })
      await get().refreshPending()
    }
  },
}))

let enqueueTimer: ReturnType<typeof setTimeout> | undefined

/** Wires automatic sync: session changes are queued in the outbox and pushed periodically. */
export function startAutoSync(): void {
  onEngineUpdate((u) => {
    if (!useAuth.getState().user || !useSettings.getState().settings.cloudSync) return
    if (u.action.type === 'SIM_TICK') return
    if (enqueueTimer) clearTimeout(enqueueTimer)
    enqueueTimer = setTimeout(() => {
      void services()
        .outbox.enqueue('aircraftSessions', u.state.session.sessionId, 'UPSERT')
        .then(() => useSync.getState().refreshPending())
    }, 3000)
  })
  setInterval(() => void useSync.getState().syncNow(), 60_000)
  window.addEventListener('online', () => void useSync.getState().syncNow())
  useAuth.subscribe((s, prev) => {
    if (s.user && s.user.uid !== prev.user?.uid) void useSync.getState().syncNow()
  })
}
