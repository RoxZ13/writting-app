import { db, SYNCED_TABLES, type Base, type SceneText, type Snapshot, type SyncedTable, type SyncConflict } from '../db/db'
import type { Table } from 'dexie'
import { notifyChange } from '../db/repo'
import { download } from './exporter'
import { compareCausality, compareRevisionTokens, compareRows, nextRevision, observeRevision, revisionToken } from './revision'

const LAST_KEY = 'manuscript.backup.last'
const SNOOZE_KEY = 'manuscript.backup.snooze'
const FIRST_KEY = 'manuscript.backup.first'
const DAY = 86400000
const MAX_BACKUP_BYTES = 50 * 1024 * 1024
const MAX_BACKUP_RECORDS = 1_000_000
const BACKUP_FORMAT = 'manuscript-backup'
const BACKUP_VERSION = 2

export type Backup = Record<string, Base[]>
export type SyncBase = Partial<Record<SyncedTable, Record<string, string | number>>>
interface BackupDocument {
  format: typeof BACKUP_FORMAT
  version: number
  createdAt: string
  tables: Backup
}

export async function makeBackup(): Promise<Backup> {
  const dump: Backup = {}
  const tables = SYNCED_TABLES.map((t) => db.table(t))
  await db.transaction('r', tables, async () => {
    for (const t of SYNCED_TABLES) dump[t] = (await db.table(t).toArray()) as Base[]
  })
  return dump
}

export async function downloadBackup() {
  const dump = await makeBackup()
  const document: BackupDocument = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), tables: dump }
  download(new Blob([JSON.stringify(document)], { type: 'application/json' }), `manuscript-backup-${new Date().toISOString().slice(0, 10)}.json`)
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
   * File sync: logical revision of every scene text as it was after this device's last write.
   * When given, two different texts that both changed since then are both kept (the loser as a snapshot).
   */
  base?: SyncBase
}

async function mergeBackup(dump: Backup, opts: MergeOptions): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0
  for (const t of SYNCED_TABLES) {
    const rows = dump[t]
    if (!Array.isArray(rows)) continue
    const tables: Table[] = [db.table(t), db.outbox, db.meta]
    if (t !== 'snapshots') tables.push(db.snapshots)
    if (t !== 'conflicts') tables.push(db.conflicts)
    await db.transaction('rw', tables, async () => {
      for (const row of rows) {
        if (!row || typeof row.id !== 'string') continue
        const here = (await db.table(t).get(row.id)) as Base | undefined
        await observeRevision(row)
        if (opts.revive && here?.deleted && !row.deleted) {
          // The author asked for this copy: a deleted record that is alive in it comes back, as a fresh edit.
          const alive: Base = { ...row, updatedAt: Date.now(), ...(await nextRevision(here)) }
          delete alive.deleted
          await db.table(t).put(alive)
          await db.outbox.put({ key: `${t}:${row.id}`, table: t, id: row.id })
          updated++
          continue
        }
        const base = opts.base?.[t]
        const different = here !== undefined && meaningful(here) !== meaningful(row)
        if (here !== undefined && different) {
          const b = base?.[row.id]
          const localChanged = b === undefined || compareRevisionTokens(revisionToken(here), b) > 0
          const remoteChanged = b === undefined || compareRevisionTokens(revisionToken(row), b) > 0
          const remoteWins = compareRows(here, row) < 0
          const causality = compareCausality(here, row)
          const isConflict = causality === 'concurrent' || causality === 'equal' || (causality === 'legacy' && base !== undefined && localChanged && remoteChanged)
          if (isConflict) {
            if (t === 'texts') {
              if (remoteWins) await keepAsSnapshot(here as SceneText, CONFLICT_HERE)
              else await keepAsSnapshot(row as SceneText, CONFLICT_THERE)
            } else if (t !== 'snapshots' && t !== 'conflicts') {
              await keepConflict(t, row.id, remoteWins ? here : row, remoteWins ? row : here)
            }
          }
        }
        if (here && compareRows(here, row) >= 0) continue
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
    id: `sync-text-conflict:${shortHash([text.id, String(revisionToken(text)), content].join('|'))}`,
    sceneId: text.id,
    projectId: text.projectId,
    content: text.content,
    wordCount: text.wordCount,
    reason,
    createdAt: now,
    updatedAt: now,
    ...(await nextRevision()),
  }
  await db.snapshots.put(snap)
  await db.outbox.put({ key: `snapshots:${snap.id}`, table: 'snapshots', id: snap.id })
}

const meaningful = (row: Base) => {
  const { updatedAt: _updatedAt, syncRev: _syncRev, syncVersion: _syncVersion, ...data } = row
  return JSON.stringify(data)
}

const shortHash = (value: string) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(36)
}

/** Preserve the losing side of a concurrent plan/metadata edit in the synced backup itself. */
async function keepConflict(table: SyncedTable, recordId: string, losing: Base, winning: Base) {
  const signature = [table, recordId, String(revisionToken(losing)), String(revisionToken(winning)), meaningful(losing), meaningful(winning)].join('|')
  const id = `sync-conflict:${shortHash(signature)}`
  if (await db.conflicts.get(id)) return
  const now = Date.now()
  const projectId =
    typeof (losing as Base & { projectId?: unknown }).projectId === 'string'
      ? ((losing as Base & { projectId: string }).projectId)
      : typeof (winning as Base & { projectId?: unknown }).projectId === 'string'
        ? ((winning as Base & { projectId: string }).projectId)
        : undefined
  const conflict: SyncConflict = {
    id,
    table,
    recordId,
    projectId,
    losing,
    winning,
    reason: 'Одновременная правка на разных устройствах',
    createdAt: now,
    updatedAt: now,
    ...(await nextRevision()),
  }
  await db.conflicts.put(conflict)
  await db.outbox.put({ key: `conflicts:${id}`, table: 'conflicts', id })
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
export function mergeSyncedBackup(dump: Backup, base: SyncBase): Promise<{ added: number; updated: number }> {
  return mergeBackup(dump, { revive: false, base })
}

export function parseBackupText(text: string): Backup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Файл повреждён: не получилось прочитать JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Это не копия Manuscript')
  const object = parsed as Record<string, unknown>
  let data: unknown = parsed
  if (object.format === BACKUP_FORMAT) {
    if (!Number.isInteger(object.version) || (object.version as number) < 1) throw new Error('У копии нет корректной версии')
    if ((object.version as number) > BACKUP_VERSION) throw new Error('Копия создана более новой версией Manuscript. Сначала обнови приложение.')
    data = object.tables
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Это не копия Manuscript')
  const dump = data as Record<string, unknown>
  if (!Array.isArray(dump.projects)) throw new Error('Это не копия Manuscript: нет списка историй')
  let records = 0
  for (const table of SYNCED_TABLES) {
    const rows = dump[table]
    if (rows === undefined) continue // old backups did not yet have newer tables
    if (!Array.isArray(rows)) throw new Error(`Копия повреждена: раздел «${table}» имеет неверный формат`)
    records += rows.length
    if (records > MAX_BACKUP_RECORDS) throw new Error('Копия слишком большая: в ней подозрительно много записей')
    const ids = new Set<string>()
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Копия повреждена: неверная запись в разделе «${table}»`)
      const base = row as Record<string, unknown>
      if (typeof base.id !== 'string' || !base.id) throw new Error(`Копия повреждена: у записи в разделе «${table}» нет id`)
      if (ids.has(base.id)) throw new Error(`Копия повреждена: запись «${base.id}» повторяется в разделе «${table}»`)
      ids.add(base.id)
      if (typeof base.updatedAt !== 'number' || !Number.isFinite(base.updatedAt)) throw new Error(`Копия повреждена: у записи «${base.id}» нет даты изменения`)
      if (base.syncRev !== undefined && typeof base.syncRev !== 'string') throw new Error(`Копия повреждена: неверная версия записи «${base.id}»`)
      if (base.syncVersion !== undefined) {
        if (!base.syncVersion || typeof base.syncVersion !== 'object' || Array.isArray(base.syncVersion)) throw new Error(`Копия повреждена: неверные часы записи «${base.id}»`)
        for (const value of Object.values(base.syncVersion as Record<string, unknown>)) {
          if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Копия повреждена: неверные часы записи «${base.id}»`)
        }
      }
    }
  }
  return dump as Backup
}

export async function readBackupFile(file: File): Promise<Backup> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Копия больше 50 МБ. Открой её на компьютере или раздели после проверки.')
  return parseBackupText(await file.text())
}

export function backupSummary(dump: Backup) {
  const projects = (dump.projects ?? []).filter((row) => !row.deleted).length
  const records = SYNCED_TABLES.reduce((sum, table) => sum + (Array.isArray(dump[table]) ? dump[table].length : 0), 0)
  return { projects, records }
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
