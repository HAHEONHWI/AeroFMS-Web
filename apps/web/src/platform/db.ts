import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { SqlJsDriver } from '@aerofms/core'

const IDB_NAME = 'aerofms'
const IDB_STORE = 'sqlite'
const IDB_KEY = 'main'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key: string): Promise<Uint8Array | undefined> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result as ArrayBuffer) : undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key: string, value: Uint8Array): Promise<void> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength), key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDelete(key: string): Promise<void> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export interface WebDatabase {
  driver: SqlJsDriver
  /** Another tab owns the database: changes are not persisted from this tab. */
  readOnly: boolean
  /** The stored database was unreadable; a backup was kept and a fresh DB created. */
  recovered: boolean
  persistNow(): Promise<void>
  /** Deletes the persisted database (Settings → Reset local data). */
  destroy(): Promise<void>
}

/** Acquires an exclusive cross-tab lock so only one tab writes the SQLite image. */
function acquireTabLock(): Promise<boolean> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (!locks) return Promise.resolve(true)
  return new Promise((resolve) => {
    void locks.request('aerofms-db', { ifAvailable: true }, (lock) => {
      resolve(!!lock)
      // Hold the lock for the lifetime of the page.
      return lock ? new Promise<void>(() => undefined) : undefined
    })
  })
}

/** Opens the SQLite database (sql.js / WebAssembly), persisted to IndexedDB. */
export async function openWebDatabase(): Promise<WebDatabase> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const owner = await acquireTabLock()
  let recovered = false
  let db: Database
  let bytes: Uint8Array | undefined
  try {
    bytes = await idbGet(IDB_KEY)
  } catch {
    bytes = undefined
  }
  try {
    db = new SQL.Database(bytes)
    if (bytes) {
      const res = db.exec('PRAGMA integrity_check')
      const ok = res[0]?.values[0]?.[0] === 'ok'
      if (!ok) throw new Error('integrity_check failed')
    }
  } catch {
    if (bytes) await idbPut(`corrupt-${Date.now()}`, bytes).catch(() => undefined)
    db = new SQL.Database()
    recovered = true
  }
  const driver = new SqlJsDriver(db)
  let timer: ReturnType<typeof setTimeout> | undefined
  let writing: Promise<void> = Promise.resolve()
  const persistNow = async (): Promise<void> => {
    if (!owner) return
    if (timer) clearTimeout(timer)
    timer = undefined
    const data = db.export()
    writing = writing.then(() => idbPut(IDB_KEY, data)).catch((e) => console.error('[db] persist failed', e))
    await writing
  }
  driver.onCommit = () => {
    if (!owner) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void persistNow(), 400)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persistNow()
  })
  window.addEventListener('pagehide', () => void persistNow())
  return {
    driver,
    readOnly: !owner,
    recovered,
    persistNow,
    destroy: async () => {
      if (timer) clearTimeout(timer)
      await idbDelete(IDB_KEY)
    },
  }
}
