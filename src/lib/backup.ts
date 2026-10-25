import { db, SYNCED_TABLES, uid, type Base, type SceneText, type Snapshot } from '../db/db'
import { notifyChange } from '../db/repo'
import { download } from './exporter'

const LAST_KEY = 'manuscript.backup.last'
const SNOOZE_KEY = 'manuscript.backup.snooze'
const FIRST_KEY = 'manuscript.backup.first'
const DAY = 86400000

export type Backup = Record<string, Base[]>

export async function makeBackup(): Promise<Backup> {
  const dump: Backup = {}
  for (const t of SYNCED_TABLES) dump[t] = (await db.table(t).toArray()) as Base[]
  return dump
}

export async function downloadBackup() {
  const dump = await makeBackup()
  download(new Blob([JSON.stringify(dump)], { type: 'application/json' }), `manuscript-backup-${new Date().toISOString().slice(0, 10)}.json`)
  try {
    localStorage.setItem(LAST_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

const CONFLICT_HERE = 'Версия с этого устройства (конфликт синхронизации)'
const CONFLICT_THERE = 'Версия с другого устройства (конфликт синхронизации)'

interface MergeOptions {
  /** Manual restore: a story deleted here but alive in the copy comes back. File sync never does this. */
  revive: boolean
  /**
   * File sync: `updatedAt` of every scene text as it was in the file after this device's last write.
   * When given, two different texts that both changed since then are both kept (the loser as a snapshot).
   */
  textBase?: Record<string, number>
}

async function mergeBackup(dump: Backup, opts: MergeOptions): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0
  for (const t of SYNCED_TABLES) {
    const rows = dump[t]
    if (!Array.isArray(rows)) continue
    const tables = t === 'snapshots' ? [db.table(t), db.outbox] : [db.table(t), db.outbox, db.snapshots]
    await db.transaction('rw', tables, async () => {
      for (const row of rows) {
        if (!row || typeof row.id !== 'string') continue
        const here = (await db.table(t).get(row.id)) as Base | undefined
        if (opts.revive && here?.deleted && !row.deleted) {
          // The author asked for this copy: a deleted record that is alive in it comes back, as a fresh edit.
          const alive: Base = { ...row, updatedAt: Date.now() }
          delete alive.deleted
          await db.table(t).put(alive)
          await db.outbox.put({ key: `${t}:${row.id}`, table: t, id: row.id })
          updated++
          continue
        }
        const hereUpdated = here?.updatedAt ?? 0
        const rowUpdated = row.updatedAt ?? 0
        const base = opts.textBase
        const conflict =
          t === 'texts' &&
          base !== undefined &&
          here !== undefined &&
          JSON.stringify((here as SceneText).content) !== JSON.stringify((row as SceneText).content)
        if (conflict) {
          const b = base[row.id]
          const localChanged = b === undefined || hereUpdated > b
          const remoteChanged = b === undefined || rowUpdated > b
          if (rowUpdated > hereUpdated && localChanged) await keepAsSnapshot(here as SceneText, CONFLICT_HERE)
          else if (hereUpdated >= rowUpdated && remoteChanged) await keepAsSnapshot(row as SceneText, CONFLICT_THERE)
        }
        if (here && hereUpdated >= rowUpdated) continue
        await db.table(t).put(row)
        await db.outbox.put({ key: `${t}:${row.id}`, table: t, id: row.id })
        if (here) updated++
        else added++
      }
    })
  }
  // Only a real change counts: a sync that brought nothing new must not wake another one.
  if (added + updated) notifyChange()
  return { added, updated }
}

/** A copy of a scene text that is about to lose (or did not win) a sync conflict. Written inside the merge's transaction. */
async function keepAsSnapshot(text: SceneText, reason: string) {
  const content = JSON.stringify(text.content)
  const same = await db.snapshots.where('sceneId').equals(text.id).filter((s) => s.reason === reason && JSON.stringify(s.content) === content).first()
  if (same) return // the merge may run twice in one sync round
  const now = Date.now()
  const snap: Snapshot = {
    id: uid(),
    sceneId: text.id,
    projectId: text.projectId,
    content: text.content,
    wordCount: text.wordCount,
    reason,
    createdAt: now,
    updatedAt: now,
  }
  await db.snapshots.put(snap)
  await db.outbox.put({ key: `snapshots:${snap.id}`, table: 'snapshots', id: snap.id })
}

/**
 * Bring a backup back without destroying anything: records missing here are added, records that are
 * newer in the file replace older ones here, everything else stays. A story deleted here but alive in
 * the copy comes back. Restored records go to the cloud too.
 */
export function restoreBackup(dump: Backup): Promise<{ added: number; updated: number }> {
  return mergeBackup(dump, { revive: true })
}

/**
 * The merge of file sync: like a restore, but a deletion made on another device stays a deletion, and
 * two different versions of one scene text are both kept — the older one as a snapshot.
 */
export function mergeSyncedBackup(dump: Backup, textBase: Record<string, number>): Promise<{ added: number; updated: number }> {
  return mergeBackup(dump, { revive: false, textBase })
}

export async function readBackupFile(file: File): Promise<Backup> {
  const data = JSON.parse(await file.text())
  if (!data || typeof data !== 'object' || !Array.isArray(data.projects)) throw new Error('Это не копия Manuscript')
  return data as Backup
}

/** Days since the last backup on this device, when it is time to remind; null when not. */
export function backupDue(now = Date.now()): number | null {
  try {
    const first = Number(localStorage.getItem(FIRST_KEY) || 0)
    if (!first) {
      localStorage.setItem(FIRST_KEY, String(now))
      return null
    }
    if (Number(localStorage.getItem(SNOOZE_KEY) || 0) > now) return null
    const last = Number(localStorage.getItem(LAST_KEY) || 0) || first
    const days = Math.floor((now - last) / DAY)
    return days >= 7 ? days : null
  } catch {
    return null
  }
}

export function snoozeBackup(days = 2) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * DAY))
  } catch {
    /* ignore */
  }
}
