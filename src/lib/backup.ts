import { db, SYNCED_TABLES, type Base } from '../db/db'
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
  download(new Blob([JSON.stringify(dump)], { type: 'application/json' }), `manuscript-копия-${new Date().toISOString().slice(0, 10)}.json`)
  try {
    localStorage.setItem(LAST_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

/**
 * Bring a backup back without destroying anything: records missing here are added, records that are
 * newer in the file replace older ones here, everything else stays. Restored records go to the cloud too.
 */
export async function restoreBackup(dump: Backup): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0
  for (const t of SYNCED_TABLES) {
    const rows = dump[t]
    if (!Array.isArray(rows)) continue
    await db.transaction('rw', db.table(t), db.outbox, async () => {
      for (const row of rows) {
        if (!row || typeof row.id !== 'string') continue
        const here = (await db.table(t).get(row.id)) as Base | undefined
        if (here && (here.updatedAt ?? 0) >= (row.updatedAt ?? 0)) continue
        await db.table(t).put(row)
        await db.outbox.put({ key: `${t}:${row.id}`, table: t, id: row.id })
        if (here) updated++
        else added++
      }
    })
  }
  notifyChange()
  return { added, updated }
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
