import { db, SYNCED_TABLES, type Base, type Scene, type Snapshot, type SyncConflict, type SyncedTable } from '../db/db'
import { patch, remove, save, snapshotScene } from '../db/repo'

import { makeExcerpt } from './importer'
import { docCharCount, docParagraphs, docWordCount } from './text'

const DERIVED_SCENE_FIELDS = new Set(['charCount', 'wordCount', 'excerpt', 'lastPos'])
const DERIVED_PROJECT_FIELDS = new Set(['lastSceneId', 'progress'])
const INTERNAL_FIELDS = new Set(['id', 'projectId', 'createdAt', 'updatedAt', 'syncRev', 'syncVersion'])

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

export interface ConflictChange {
  field: string
  losing: unknown
  winning: unknown
}

/** Domain fields that actually differ between the two archived variants. */
export function conflictChanges(conflict: Pick<SyncConflict, 'losing' | 'winning'> & { table?: string }): ConflictChange[] {
  const losing = conflict.losing as unknown as Record<string, unknown>
  const winning = conflict.winning as unknown as Record<string, unknown>
  const derived = conflict.table === 'scenes' ? DERIVED_SCENE_FIELDS : conflict.table === 'projects' ? DERIVED_PROJECT_FIELDS : undefined
  return [...new Set([...Object.keys(losing), ...Object.keys(winning)])]
    .filter((field) => !INTERNAL_FIELDS.has(field) && !derived?.has(field) && !same(losing[field], winning[field]))
    .map((field) => ({ field, losing: losing[field], winning: winning[field] }))
}

export function isReviewableConflict(conflict: SyncConflict) {
  return !conflict.deleted && conflictChanges(conflict).length > 0
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
export async function restoreConflict(conflict: SyncConflict, expectedCurrent?: Base): Promise<void> {
  const table = originalTable(conflict)
  if (!isReviewableConflict(conflict)) return
  await db.transaction('rw', db.table(table), db.conflicts, db.outbox, db.meta, async () => {
    const pending = await db.conflicts.get(conflict.id)
    if (!pending || pending.deleted) throw new Error('Эту правку уже разобрали.')
    const current = (await db.table(table).get(conflict.recordId)) as Base | undefined
    const changes = conflictChanges(conflict)
    if (expectedCurrent) {
      const actual = current as unknown as Record<string, unknown> | undefined
      const expected = expectedCurrent as unknown as Record<string, unknown>
      if (!actual || current?.deleted !== expectedCurrent.deleted || changes.some(({ field }) => !same(actual[field], expected[field]))) {
        throw new Error('Настройки изменились. Сравни значения ещё раз.')
      }
    }
    if (current) {
      const next = { ...current } as unknown as Record<string, unknown>
      const losing = conflict.losing as unknown as Record<string, unknown>
      for (const { field } of changes) {
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

export function isUnreviewedSyncVersion(version: Snapshot) {
  return !version.deleted && !version.syncReviewed && version.reason.endsWith('(конфликт синхронизации)')
}

/** Review the saved copy without deleting it from the scene's history. */
export async function reviewSyncVersion(id: string, replacement?: { currentContent: unknown }) {
  await db.transaction('rw', db.snapshots, db.texts, db.scenes, db.outbox, db.meta, async () => {
    const version = await db.snapshots.get(id)
    if (!version || !isUnreviewedSyncVersion(version)) throw new Error('Эту версию уже разобрали.')
    if (replacement) {
      const [current, scene] = await Promise.all([db.texts.get(version.sceneId), db.scenes.get(version.sceneId)])
      if (!current || current.deleted || !scene || scene.deleted) throw new Error('Сцена недоступна. Сохранённый текст можно скопировать.')
      if (!same(current.content, replacement.currentContent)) throw new Error('Текст изменился. Сравни версии ещё раз.')
      if (!same(current.content, version.content)) {
        const wordCount = docWordCount(version.content)
        const paragraphs = docParagraphs(version.content).map((p) => p.trim()).filter(Boolean)
        await snapshotScene(current, 'Перед восстановлением версии')
        await save('texts', { ...current, content: version.content, wordCount })
        await patch<Scene>('scenes', scene.id, {
          wordCount,
          charCount: docCharCount(version.content),
          excerpt: makeExcerpt(scene.epigraph && paragraphs[0] === scene.epigraph ? paragraphs.slice(1) : paragraphs),
          lastPos: undefined,
        })
      }
    }
    await patch<Snapshot>('snapshots', id, { syncReviewed: true })
  })
}
