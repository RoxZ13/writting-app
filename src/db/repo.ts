import {
  db,
  uid,
  type Base,
  type Chapter,
  type Marker,
  type Note,
  type NoteKind,
  type Project,
  type Scene,
  type SceneText,
  type Snapshot,
  type SyncedTable,
} from './db'
import { emptyDoc } from '../lib/text'

/** Write a record locally and queue it for sync. All app writes go through here. */
export async function save<T extends Base>(table: SyncedTable, record: T): Promise<T> {
  const next = { ...record, updatedAt: Date.now() }
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    await db.table(table).put(next)
    await db.outbox.put({ key: `${table}:${next.id}`, table, id: next.id })
  })
  notifyChange()
  return next
}

export async function patch<T extends Base>(table: SyncedTable, id: string, changes: Partial<T>) {
  const current = (await db.table(table).get(id)) as T | undefined
  if (!current) return
  return save(table, { ...current, ...changes })
}

export async function remove(table: SyncedTable, id: string) {
  return patch(table, id, { deleted: true })
}

type Listener = () => void
const listeners = new Set<Listener>()
export function onLocalChange(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notifyChange() {
  listeners.forEach((fn) => fn())
}

export const alive = <T extends Base>(rows: T[]) => rows.filter((r) => !r.deleted)

// ---------- projects ----------

export async function createProject(title: string): Promise<Project> {
  const now = Date.now()
  const project = await save<Project>('projects', { id: uid(), title, createdAt: now, updatedAt: now })
  const chapter = await createChapter(project.id, 'Глава 1')
  const scene = await createScene(project.id, chapter.id, 'Первая сцена')
  await patch<Project>('projects', project.id, { lastSceneId: scene.id })
  return project
}

// ---------- chapters ----------

export async function createChapter(projectId: string, title: string, order?: number): Promise<Chapter> {
  if (order === undefined) {
    const existing = alive(await db.chapters.where('projectId').equals(projectId).toArray())
    order = existing.length ? Math.max(...existing.map((c) => c.order)) + 1 : 0
  }
  return save<Chapter>('chapters', { id: uid(), projectId, title, order, goal: '', updatedAt: 0 })
}

export async function deleteChapter(id: string) {
  const scenes = await db.scenes.where('chapterId').equals(id).toArray()
  for (const s of scenes) {
    await remove('scenes', s.id)
    await remove('texts', s.id)
  }
  await remove('chapters', id)
}

// ---------- scenes ----------

export async function createScene(
  projectId: string,
  chapterId: string,
  title: string,
  extra: Partial<Scene> = {},
  content: unknown = emptyDoc(),
  wordCount = 0,
): Promise<Scene> {
  const siblings = alive(await db.scenes.where('chapterId').equals(chapterId).toArray())
  const order = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0
  const scene = await save<Scene>('scenes', {
    id: uid(),
    projectId,
    chapterId,
    title,
    order,
    status: 'idea',
    goal: '',
    beats: [],
    wordCount,
    updatedAt: 0,
    ...extra,
  })
  await save<SceneText>('texts', { id: scene.id, projectId, content, wordCount, updatedAt: 0 })
  return scene
}

/** Persist a new order (and possibly new chapter) for a list of scenes. */
export async function reorderScenes(chapterId: string, sceneIds: string[]) {
  for (const [i, id] of sceneIds.entries()) {
    const s = await db.scenes.get(id)
    if (s && (s.order !== i || s.chapterId !== chapterId)) {
      await save<Scene>('scenes', { ...s, order: i, chapterId })
    }
  }
}

export async function reorderChapters(ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = await db.chapters.get(id)
    if (c && c.order !== i) await save<Chapter>('chapters', { ...c, order: i })
  }
}

export async function snapshotScene(text: SceneText, reason: string) {
  const now = Date.now()
  return save<Snapshot>('snapshots', {
    id: uid(),
    sceneId: text.id,
    projectId: text.projectId,
    content: text.content,
    wordCount: text.wordCount,
    reason,
    createdAt: now,
    updatedAt: now,
  })
}

// ---------- markers ----------

export async function createMarker(projectId: string, fields: Partial<Marker>): Promise<Marker> {
  const now = Date.now()
  return save<Marker>('markers', {
    id: uid(),
    projectId,
    title: '',
    note: '',
    resolved: false,
    createdAt: now,
    updatedAt: now,
    ...fields,
  })
}

export type MarkerState = 'hanging' | 'waiting' | 'closed'

export function markerState(m: Marker): MarkerState {
  if (m.resolved) return 'closed'
  if (!m.payoffSceneId) return 'hanging'
  return 'waiting'
}

// ---------- notes ----------

export async function createNote(text: string, kind: NoteKind, projectId?: string, sceneId?: string) {
  const now = Date.now()
  return save<Note>('notes', {
    id: uid(),
    text,
    kind,
    projectId,
    sceneId,
    archived: false,
    createdAt: now,
    updatedAt: now,
  })
}

// ---------- restructuring the outline ----------

export type OutlineItem = { type: 'chapter'; id: string } | { type: 'scene'; id: string }

/**
 * Persist a whole outline given in reading order: every scene belongs to the nearest chapter above it.
 * Only records whose chapter or position actually changed are written.
 */
export async function applyOutline(items: OutlineItem[]) {
  let chapterOrder = 0
  let sceneOrder = 0
  let chapterId: string | undefined
  for (const item of items) {
    if (item.type === 'chapter') {
      chapterId = item.id
      sceneOrder = 0
      const c = await db.chapters.get(item.id)
      if (c && c.order !== chapterOrder) await save<Chapter>('chapters', { ...c, order: chapterOrder })
      chapterOrder++
    } else if (chapterId) {
      const s = await db.scenes.get(item.id)
      if (s && (s.order !== sceneOrder || s.chapterId !== chapterId)) {
        await save<Scene>('scenes', { ...s, order: sceneOrder, chapterId })
      }
      sceneOrder++
    }
  }
}

async function outlineOf(projectId: string): Promise<OutlineItem[]> {
  const chapters = alive(await db.chapters.where('projectId').equals(projectId).toArray()).sort((a, b) => a.order - b.order)
  const scenes = alive(await db.scenes.where('projectId').equals(projectId).toArray())
  return chapters.flatMap((c) => [
    { type: 'chapter' as const, id: c.id },
    ...scenes
      .filter((s) => s.chapterId === c.id)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ type: 'scene' as const, id: s.id })),
  ])
}

/** Start a new chapter at this scene: it and every scene after it in its chapter move to the new chapter. */
export async function splitChapterAt(sceneId: string, title: string): Promise<Chapter | undefined> {
  const scene = await db.scenes.get(sceneId)
  if (!scene) return
  const chapter = await createChapter(scene.projectId, title, 1e6)
  const items = (await outlineOf(scene.projectId)).filter((i) => i.id !== chapter.id)
  const at = items.findIndex((i) => i.id === sceneId)
  items.splice(at, 0, { type: 'chapter', id: chapter.id })
  await applyOutline(items)
  return chapter
}

/** Append this chapter's scenes to the previous chapter and delete the now-empty chapter. */
export async function mergeIntoPrevious(chapterId: string) {
  const chapter = await db.chapters.get(chapterId)
  if (!chapter) return
  const items = await outlineOf(chapter.projectId)
  const at = items.findIndex((i) => i.id === chapterId)
  if (at <= 0) return
  items.splice(at, 1)
  await applyOutline(items)
  await remove('chapters', chapterId)
}
