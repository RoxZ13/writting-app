import { makeBackup, mergeSyncedBackup, type Backup } from './backup'
import { db } from '../db/db'
import { onLocalChange } from '../db/repo'

const BASE_KEY = 'filesync.base'

/**
 * Sync through a single file in the author's own cloud (Яндекс Диск, later Dropbox, Google Drive):
 * the whole story base lives in one JSON file in the app's folder. Every device reads it, merges it
 * into what it has (the newer version of each record wins, nothing is deleted outright — deletions
 * are records too) and writes the merged result back.
 */
export interface FileStore {
  /** Shown in Settings: «Яндекс Диск». */
  name: string
  /** The file and a version mark (its modification time), or null when there is no file yet. */
  read(): Promise<{ data: Backup; version: string } | null>
  /** The file's current version mark without downloading it; null when there is none. */
  version(): Promise<string | null>
  write(data: Backup): Promise<void>
}

/**
 * One round: take in what other devices wrote, then write everything back. If another device wrote
 * in the meantime, its changes are taken in first, so nobody's work is overwritten.
 */
export async function syncWithStore(store: FileStore, tries = 3): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0
  const textBase = ((await db.meta.get(BASE_KEY))?.value as Record<string, number> | undefined) ?? {}
  for (let i = 0; i < tries; i++) {
    const remote = await store.read()
    if (remote) {
      const r = await mergeSyncedBackup(remote.data, textBase)
      added += r.added
      updated += r.updated
    }
    const before = remote?.version ?? null
    // Someone wrote while we were merging: take that in too before writing.
    if ((await store.version()) !== before) continue
    const out = await makeBackup()
    await store.write(out)
    // What each scene text looked like in the file we just wrote: the next merge tells «changed here» from «changed there» by it.
    const base: Record<string, number> = {}
    for (const row of out.texts ?? []) base[row.id] = row.updatedAt ?? 0
    await db.meta.put({ key: BASE_KEY, value: base })
    return { added, updated }
  }
  throw new Error('Облако всё время меняется с другого устройства. Попробуй ещё раз через минуту.')
}

// ---------------- the running sync, shown in Settings ----------------

export type FileSyncState =
  | { state: 'off' }
  | { state: 'syncing' }
  | { state: 'ok'; at: number }
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
  if (!store) return Promise.resolve()
  if (running) return running
  const s = store
  running = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return setState({ state: 'offline' })
    setState({ state: 'syncing' })
    try {
      await syncWithStore(s)
      setState({ state: 'ok', at: Date.now() })
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
  stopFileSync()
  store = s
  void syncNow()
  stopLocal = onLocalChange(() => {
    clearTimeout(timer)
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
