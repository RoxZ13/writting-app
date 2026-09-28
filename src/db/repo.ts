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
  type Line,
  type Character,
  type SyncedTable,
} from './db'
import { docParagraphs, emptyDoc } from '../lib/text'
import { isEpigraph, makeExcerpt } from '../lib/importer'

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
export function notifyChange() {
  listeners.forEach((fn) => fn())
}

export const alive = <T extends Base>(rows: T[]) => rows.filter((r) => !r.deleted)

// ---------- projects ----------

export async function createProject(title: string): Promise<Project> {
  const now = Date.now()
  const project = await save<Project>('projects', { id: uid(), title, createdAt: now, updatedAt: now })
  const chapter = await createChapter(project.id, 'Вся история')
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

/** The "Пока без места" chapter of a project, created on first use. */
export async function ensurePool(projectId: string): Promise<Chapter> {
  const existing = alive(await db.chapters.where('projectId').equals(projectId).toArray()).find((c) => c.pool)
  if (existing) return existing
  return save<Chapter>('chapters', { id: uid(), projectId, title: 'Пока без места', order: -1, goal: '', pool: true, updatedAt: 0 })
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
  if (!m.payoffSceneId && !m.payoffChapterId) return 'hanging'
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
  // The pool is not part of the reading order: splitting or merging chapters never touches it.
  const chapters = alive(await db.chapters.where('projectId').equals(projectId).toArray())
    .filter((c) => !c.pool)
    .sort((a, b) => a.order - b.order)
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

// ---------- lines & characters ----------

export const PALETTE = ['#3b82f6', '#e5484d', '#22b573', '#a47be3', '#f08c1a', '#0ea5a4', '#e0529c', '#8a8f98', '#c9a227', '#6366f1']

export async function createLine(projectId: string, name: string): Promise<Line> {
  const existing = alive(await db.lines.where('projectId').equals(projectId).toArray())
  return save<Line>('lines', {
    id: uid(),
    projectId,
    name,
    color: PALETTE[existing.length % PALETTE.length],
    order: existing.length,
    updatedAt: 0,
  })
}

/** Find a character by name (case- and ё-insensitive) or create one — so typing a name twice never makes a twin. */
export async function findOrCreateCharacter(projectId: string, name: string): Promise<Character> {
  const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е')
  const existing = alive(await db.characters.where('projectId').equals(projectId).toArray())
  return existing.find((c) => norm(c.name) === norm(name)) ?? createCharacter(projectId, name)
}

export async function createCharacter(projectId: string, name: string): Promise<Character> {
  const existing = alive(await db.characters.where('projectId').equals(projectId).toArray())
  return save<Character>('characters', {
    id: uid(),
    projectId,
    name,
    about: '',
    color: PALETTE[(existing.length + 3) % PALETTE.length],
    order: existing.length,
    updatedAt: 0,
  })
}

/** Toggle an id in a scene's list field (lines or characters) using the freshest stored copy. */
export async function toggleSceneRef(sceneId: string, field: 'lineIds' | 'characterIds', id: string) {
  const s = await db.scenes.get(sceneId)
  if (!s) return
  const list = s[field] ?? []
  await save<Scene>('scenes', { ...s, [field]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] })
}

/** Move a scene to a chapter at a position (board drag and drop). */
export async function moveScene(sceneId: string, chapterId: string, index: number) {
  const scene = await db.scenes.get(sceneId)
  if (!scene) return
  const siblings = alive(await db.scenes.where('chapterId').equals(chapterId).toArray())
    .filter((s) => s.id !== sceneId)
    .sort((a, b) => a.order - b.order)
  siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, scene)
  await reorderScenes(chapterId, siblings.map((s) => s.id))
}

/** Glue a scene onto the end of the previous scene in its chapter (for "***" that was only a pause). */
export async function mergeSceneIntoPrevious(sceneId: string): Promise<string | undefined> {
  const scene = await db.scenes.get(sceneId)
  if (!scene) return
  const siblings = alive(await db.scenes.where('chapterId').equals(scene.chapterId).toArray()).sort((a, b) => a.order - b.order)
  const prev = siblings[siblings.indexOf(siblings.find((s) => s.id === sceneId)!) - 1]
  if (!prev) return
  const [a, b] = await Promise.all([db.texts.get(prev.id), db.texts.get(sceneId)])
  const content = {
    type: 'doc',
    content: [
      ...(((a?.content as { content?: unknown[] })?.content ?? []) as unknown[]),
      ...(((b?.content as { content?: unknown[] })?.content ?? []) as unknown[]),
    ],
  }
  const wordCount = (a?.wordCount ?? 0) + (b?.wordCount ?? 0)
  if (a) await save<SceneText>('texts', { ...a, content, wordCount })
  await save<Scene>('scenes', {
    ...prev,
    wordCount,
    beats: [...prev.beats, ...scene.beats],
    lineIds: [...new Set([...(prev.lineIds ?? []), ...(scene.lineIds ?? [])])],
    characterIds: [...new Set([...(prev.characterIds ?? []), ...(scene.characterIds ?? [])])],
  })
  for (const m of alive(await db.markers.where('projectId').equals(scene.projectId).toArray())) {
    if (m.setupSceneId === sceneId || m.payoffSceneId === sceneId) {
      await save<Marker>('markers', {
        ...m,
        setupSceneId: m.setupSceneId === sceneId ? prev.id : m.setupSceneId,
        payoffSceneId: m.payoffSceneId === sceneId ? prev.id : m.payoffSceneId,
      })
    }
  }
  await remove('scenes', sceneId)
  await remove('texts', sceneId)
  return prev.id
}

/**
 * Merge a duplicate character into another: scenes, quotes and notes move over, the notes about them
 * are appended, and the duplicate is removed.
 */
export async function mergeCharacters(fromId: string, intoId: string) {
  if (fromId === intoId) return
  const [from, into] = await Promise.all([db.characters.get(fromId), db.characters.get(intoId)])
  if (!from || !into) return
  const swap = (ids?: string[]) => (ids?.includes(fromId) ? [...new Set(ids.map((x) => (x === fromId ? intoId : x)))] : ids)
  for (const s of alive(await db.scenes.where('projectId').equals(from.projectId).toArray())) {
    if (s.characterIds?.includes(fromId)) await save<Scene>('scenes', { ...s, characterIds: swap(s.characterIds) })
  }
  for (const n of alive(await db.notes.toArray())) {
    if (n.characterIds?.includes(fromId)) await save<Note>('notes', { ...n, characterIds: swap(n.characterIds) })
  }
  const about = [into.about, from.about].map((x) => x.trim()).filter(Boolean).join('\n\n')
  await save<Character>('characters', { ...into, about })
  await remove('characters', fromId)
}

/**
 * One-time tidy-up for books imported before scenes had excerpts: a title that is just the
 * first words of the text is dropped (the card shows "Сцена N" + the excerpt instead), and a
 * song line at the top becomes the epigraph.
 */
export async function tidyImportedScenes(projectId: string) {
  const flag = `tidy.untitled.${projectId}`
  if (await db.meta.get(flag)) return
  const scenes = alive(await db.scenes.where('projectId').equals(projectId).toArray())
  for (const s of scenes) {
    if (s.excerpt !== undefined) continue
    const t = await db.texts.get(s.id)
    const paras = docParagraphs(t?.content).map((p) => p.trim()).filter(Boolean)
    const first = paras[0] ?? ''
    const epigraph = isEpigraph(first) ? first : undefined
    const body = paras.slice(epigraph ? 1 : 0)
    const stem = s.title.replace(/…$/, '').replace(/^Сцена \d+:\s*/, '').trim()
    const bodyStart = (body[0] ?? '').replace(/^[—–-]\s*/, '')
    const auto = !!stem && (first === s.title || bodyStart.startsWith(stem) || first.replace(/^[—–-]\s*/, '').startsWith(stem))
    await save<Scene>('scenes', {
      ...s,
      title: auto ? '' : s.title,
      epigraph: s.epigraph ?? epigraph,
      excerpt: makeExcerpt(body),
    })
  }
  await db.meta.put({ key: flag, value: true })
}
