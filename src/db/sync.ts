import { db, SYNCED_TABLES, uid, type Base, type SceneText, type Snapshot, type SyncedTable } from './db'
import { compareRows, nextRevision, revisionParts } from '../lib/revision'

/**
 * Local-first sync. Every write lands in IndexedDB and in the outbox first, so the app
 * works fully offline. When online, `syncOnce` pulls remote changes and pushes the outbox.
 *
 * Conflict rule: last write wins per record — but a scene's text is never silently lost:
 * if a remote version overwrites unsynced local text, the local text is kept as a snapshot.
 */

export interface RemoteRow {
  id: string
  kind: SyncedTable
  data: Base
  updated_at: number
  /** Server-assigned, monotonically increasing; used as the pull cursor. */
  seq: number
}

export interface Remote {
  pull(sinceSeq: number): Promise<RemoteRow[]>
  /** Returns only rows the server actually accepted. A stale trigger may reject an upsert without an HTTP error. */
  push(rows: { id: string; kind: SyncedTable; data: Base; updated_at: number }[]): Promise<{ id: string; kind: SyncedTable; updated_at: number }[]>
}

const CURSOR_KEY = 'sync.cursor'

export async function syncOnce(remote: Remote): Promise<{ pulled: number; pushed: number; conflicts: number }> {
  const cursor = ((await db.meta.get(CURSOR_KEY))?.value as number | undefined) ?? 0
  const rows = await remote.pull(cursor)
  let conflicts = 0
  let maxSeq = cursor

  for (const row of rows) {
    maxSeq = Math.max(maxSeq, row.seq)
    if (!SYNCED_TABLES.includes(row.kind)) continue
    const table = db.table(row.kind)
    const key = `${row.kind}:${row.id}`
    await db.transaction('rw', table, db.outbox, db.snapshots, db.meta, async () => {
      const local = (await table.get(row.id)) as Base | undefined
      const dirty = !!(await db.outbox.get(key))
      if (!local) {
        await table.put(row.data)
        return
      }
      const order = compareRows(local, row.data)
      if (order >= 0) {
        // Repair a stale server row even if this local record had already left the outbox.
        if (order > 0) await db.outbox.put({ key, table: row.kind, id: row.id })
        return
      }
      // Remote wins. Keep unsynced local scene text so nothing typed is ever lost.
      if (dirty && row.kind === 'texts') {
        const s = local as SceneText
        const remoteScene = row.data as SceneText
        if (JSON.stringify(s.content) !== JSON.stringify(remoteScene.content)) {
          const now = Date.now()
          const snap: Snapshot = {
            id: uid(),
            sceneId: s.id,
            projectId: s.projectId,
            content: s.content,
            wordCount: s.wordCount,
            reason: 'Версия с этого устройства (конфликт синхронизации)',
            createdAt: now,
            updatedAt: now,
            ...(await nextRevision()),
          }
          await db.snapshots.put(snap)
          await db.outbox.put({ key: `snapshots:${snap.id}`, table: 'snapshots', id: snap.id })
          conflicts++
        }
      }
      await table.put(row.data)
      await db.outbox.delete(key)
    })
  }

  const outbox = await db.outbox.toArray()
  const payload: { id: string; kind: SyncedTable; data: Base; updated_at: number }[] = []
  for (const entry of outbox) {
    const data = (await db.table(entry.table).get(entry.id)) as Base | undefined
    if (data) payload.push({ id: entry.id, kind: entry.table, data, updated_at: revisionParts(data).clock })
  }
  const accepted = new Map<string, number>()
  for (let i = 0; i < payload.length; i += 200) {
    for (const row of await remote.push(payload.slice(i, i + 200))) accepted.set(`${row.kind}:${row.id}`, row.updated_at)
  }
  // Clear only rows that the server confirmed and that were not modified again while pushing.
  await db.transaction('rw', [db.outbox, ...SYNCED_TABLES.map((t) => db.table(t))], async () => {
    for (const p of payload) {
      if (accepted.get(`${p.kind}:${p.id}`) !== p.updated_at) continue
      const current = (await db.table(p.kind).get(p.id)) as Base | undefined
      if (current && revisionParts(current).clock === p.updated_at) await db.outbox.delete(`${p.kind}:${p.id}`)
    }
  })

  if (accepted.size < payload.length) {
    // Force a full pull next time: a server trigger can silently reject a stale upsert without a new seq.
    await db.meta.put({ key: CURSOR_KEY, value: 0 })
    throw new Error('Сервер не принял часть изменений. Локальная копия сохранена; при следующей синхронизации Manuscript заново сверит все версии.')
  }
  await db.meta.put({ key: CURSOR_KEY, value: maxSeq })
  return { pulled: rows.length, pushed: accepted.size, conflicts }
}

export async function resetSyncCursor() {
  await db.meta.delete(CURSOR_KEY)
}

/** Mark every local record for upload — used right after the first sign-in on a device. */
export async function queueEverything() {
  for (const t of SYNCED_TABLES) {
    const ids = (await db.table(t).toCollection().primaryKeys()) as string[]
    await db.outbox.bulkPut(ids.map((id) => ({ key: `${t}:${id}`, table: t, id })))
  }
}
