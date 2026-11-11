import { db, SYNCED_TABLES, type Base, type SyncConflict, type SyncedTable } from '../db/db'
import { remove, save } from '../db/repo'

const INTERNAL_FIELDS = new Set(['id', 'projectId', 'createdAt', 'updatedAt', 'syncRev', 'syncVersion'])

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

export interface ConflictChange {
  field: string
  losing: unknown
  winning: unknown
}

/** Domain fields that actually differ between the two archived variants. */
export function conflictChanges(conflict: Pick<SyncConflict, 'losing' | 'winning'>): ConflictChange[] {
  const losing = conflict.losing as unknown as Record<string, unknown>
  const winning = conflict.winning as unknown as Record<string, unknown>
  return [...new Set([...Object.keys(losing), ...Object.keys(winning)])]
    .filter((field) => !INTERNAL_FIELDS.has(field) && !same(losing[field], winning[field]))
    .map((field) => ({ field, losing: losing[field], winning: winning[field] }))
}

function originalTable(conflict: SyncConflict): SyncedTable {
  const table = conflict.table as SyncedTable
  if (!SYNCED_TABLES.includes(table) || table === 'conflicts') throw new Error('Неизвестный тип конфликтующей записи')
  return table
}

/**
 * Restore only fields that differed in the archived conflict. Unrelated edits made after the conflict
 * stay intact. The conflict itself becomes a synced tombstone, so it disappears on every device.
 */
export async function restoreConflict(conflict: SyncConflict): Promise<void> {
  const table = originalTable(conflict)
  await db.transaction('rw', db.table(table), db.conflicts, db.outbox, db.meta, async () => {
    const current = (await db.table(table).get(conflict.recordId)) as Base | undefined
    if (current) {
      const next = { ...current } as unknown as Record<string, unknown>
      const losing = conflict.losing as unknown as Record<string, unknown>
      for (const { field } of conflictChanges(conflict)) {
        if (field in losing) next[field] = losing[field]
        else delete next[field]
      }
      await save(table, next as unknown as Base)
    } else {
      await save(table, { ...conflict.losing, id: conflict.recordId })
    }
    await remove('conflicts', conflict.id)
  })
}

/** Keep the current variant and close this archived conflict on all devices. */
export async function dismissConflict(conflict: SyncConflict): Promise<void> {
  await remove('conflicts', conflict.id)
}
