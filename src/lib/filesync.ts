import { makeBackup, mergeSyncedBackup, type Backup, type SyncBase } from './backup'
import { db, SYNCED_TABLES } from '../db/db'
import { onLocalChange } from '../db/repo'
import { remoteSyncAllowed } from './environment'
import { revisionToken, syncDeviceId } from './revision'

const LEGACY_BASE_KEY = 'filesync.base'
const BASE_KEY = 'filesync.base.v2'

/**
 * Sync through one snapshot per device in the author's own cloud. Devices never overwrite each
 * other's files: every round reads all snapshots, merges them deterministically and replaces only
 * this device's slot. The old shared manuscript.json is read during migration but never overwritten.
 */
export interface RemoteBackup {
  source: string
  version: string
  data: Backup
}

export interface FileStore {
  /** Shown in Settings: «Яндекс Диск». */
  name: string
  /** The legacy shared file and every device snapshot currently present. */
  read(): Promise<RemoteBackup[]>
  /** Replace only this device's snapshot. `slot` is a generated opaque id, never a user path. */
  write(data: Backup, slot: string): Promise<void>
}

/**
 * One round: take in every device snapshot, then replace only this device's snapshot with the
 * merged result. A concurrent writer has a different slot, so both sides remain available even
 * when their requests cross in flight.
 */
export async function syncWithStore(store: FileStore): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0
  let base = (await db.meta.get(BASE_KEY))?.value as SyncBase | undefined
  if (!base) {
    const legacyTextBase = (await db.meta.get(LEGACY_BASE_KEY))?.value as Record<string, string | number> | undefined
    base = legacyTextBase ? { texts: legacyTextBase } : {}
  }
  const remote = await store.read()
  for (const file of remote.sort((a, b) => a.source.localeCompare(b.source))) {
    const r = await mergeSyncedBackup(file.data, base)
    added += r.added
    updated += r.updated
  }
  const out = await makeBackup()
  await store.write(out, await syncDeviceId())
  // What each scene text looked like after this round: the next merge can identify two-sided edits.
  const nextBase: SyncBase = {}
  for (const table of SYNCED_TABLES) {
    const rows: Record<string, string | number> = {}
    for (const row of out[table] ?? []) rows[row.id] = revisionToken(row) ?? 0
    nextBase[table] = rows
  }
  await db.meta.put({ key: BASE_KEY, value: nextBase })
  return { added, updated }
}

// ---------------- the running sync, shown in Settings ----------------

export type FileSyncState =
  | { state: 'off' }
  | { state: 'pending'; since: number }
  | { state: 'syncing' }
  | { state: 'ok'; at: number; conflicts?: number }
  | { state: 'offline' }
  | { state: 'error'; message: string }

let current: FileSyncState = { state: 'off' }
const listeners = new Set<(s: FileSyncState) => void>()
const setState = (s: FileSyncState) => {
  current = s
  listeners.forEach((fn) => fn(s))
}
export const getFileSyncState = () => current
export function onFileSyncState(fn: (s: FileSyncState) => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

let store: FileStore | null = null
let running: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let stopLocal: (() => void) | undefined

/** Sync now (or join the round already running). */
export function syncNow(): Promise<void> {
  if (!remoteSyncAllowed()) return Promise.resolve()
  if (!store) return Promise.resolve()
  if (running) return running
  const s = store
  running = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return setState({ state: 'offline' })
    setState({ state: 'syncing' })
    try {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request('manuscript:file-sync', () => syncWithStore(s))
      } else {
        await syncWithStore(s)
      }
      const conflicts = await db.conflicts.count()
      setState({ state: 'ok', at: Date.now(), ...(conflicts ? { conflicts } : {}) })
    } catch (e) {
      setState({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  })().finally(() => {
    running = null
  })
  return running
}

/** Start syncing with a store: now, half a minute after each change, on return to the app and when the network is back. */
export function startFileSync(s: FileStore) {
  if (!remoteSyncAllowed()) {
    setState({ state: 'off' })
    return
  }
  stopFileSync()
  store = s
  void syncNow()
  stopLocal = onLocalChange(() => {
    clearTimeout(timer)
    setState(typeof navigator !== 'undefined' && navigator.onLine === false ? { state: 'offline' } : { state: 'pending', since: Date.now() })
    timer = setTimeout(() => void syncNow(), 30_000)
  })
  window.addEventListener('online', onBack)
  document.addEventListener('visibilitychange', onVisible)
}

export function stopFileSync() {
  store = null
  clearTimeout(timer)
  stopLocal?.()
  stopLocal = undefined
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', onBack)
    document.removeEventListener('visibilitychange', onVisible)
  }
  setState({ state: 'off' })
}

const onBack = () => void syncNow()
// Leaving the app: write what is new. Coming back: take in what the phone wrote.
const onVisible = () => void syncNow()
