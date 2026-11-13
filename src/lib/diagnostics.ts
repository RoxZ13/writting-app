import { db } from '../db/db'
import { download } from './exporter'

export interface StorageDiagnostics {
  database: string
  origin: string
  persistent?: boolean
  usage?: number
  quota?: number
  counts: {
    projects: number
    scenes: number
    texts: number
    snapshots: number
    pending: number
    conflicts: number
  }
}

async function storageInfo(): Promise<Pick<StorageDiagnostics, 'persistent' | 'usage' | 'quota'>> {
  if (typeof navigator === 'undefined' || !navigator.storage) return {}
  let persistent: boolean | undefined
  let usage: number | undefined
  let quota: number | undefined
  try {
    persistent = await navigator.storage.persisted?.()
  } catch {
    // Some embedded browsers expose the API but deny the query.
  }
  try {
    const estimate = await navigator.storage.estimate?.()
    usage = estimate?.usage
    quota = estimate?.quota
  } catch {
    // Size is helpful diagnostics, never a reason to block Settings.
  }
  return { persistent, usage, quota }
}

/** Counts and browser storage facts only. No titles, notes or manuscript text leave the database. */
export async function collectStorageDiagnostics(): Promise<StorageDiagnostics> {
  const [counts, storage] = await Promise.all([
    db.transaction('r', [db.projects, db.scenes, db.texts, db.snapshots, db.outbox, db.conflicts], async () => ({
      projects: await db.projects.filter((row) => !row.deleted).count(),
      scenes: await db.scenes.filter((row) => !row.deleted).count(),
      texts: await db.texts.filter((row) => !row.deleted).count(),
      snapshots: await db.snapshots.filter((row) => !row.deleted).count(),
      pending: await db.outbox.count(),
      conflicts: await db.conflicts.filter((row) => !row.deleted).count(),
    })),
    storageInfo(),
  ])
  return {
    database: db.name,
    origin: typeof location === 'undefined' ? 'unknown' : location.origin,
    ...storage,
    counts,
  }
}

export async function requestStoragePersistence(): Promise<boolean | undefined> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return undefined
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export function formatBytes(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return 'неизвестно'
  if (value < 1024) return `${Math.round(value)} Б`
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ']
  let n = value / 1024
  let unit = 0
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024
    unit++
  }
  return `${n >= 10 ? n.toFixed(0) : n.toFixed(1)} ${units[unit]}`
}

export function downloadDiagnostics(storage: StorageDiagnostics, extra: Record<string, unknown>) {
  const report = {
    format: 'manuscript-diagnostics',
    version: 1,
    createdAt: new Date().toISOString(),
    storage,
    ...extra,
  }
  download(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `manuscript-diagnostics-${new Date().toISOString().slice(0, 10)}.json`)
}
