import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, type Chapter, type Character, type Line, type Marker, type Note, type Project, type Scene } from '../db/db'
import { alive, markerState } from '../db/repo'

export interface ProjectData {
  project: Project
  chapters: Chapter[]
  scenes: Scene[]
  /** Scenes grouped by chapter, both in order. */
  outline: { chapter: Chapter; scenes: Scene[] }[]
  /** "Пока без места": scenes without a chapter yet. Not in chapters / scenes / outline. */
  pool: { chapter?: Chapter; scenes: Scene[] }
  markers: Marker[]
  notes: Note[]
  lines: Line[]
  characters: Character[]
  lineById: Map<string, Line>
  characterById: Map<string, Character>
  sceneById: Map<string, Scene>
  chapterById: Map<string, Chapter>
  /** Position of each scene in reading order, used for "before / after" checks. */
  sceneIndex: Map<string, number>
  chapterIndex: Map<string, number>
}

export function useProjects() {
  return useLiveQuery(async () => alive(await db.projects.toArray()).sort((a, b) => b.updatedAt - a.updatedAt), [])
}

export function useProjectData(projectId: string | undefined): ProjectData | undefined | null {
  const raw = useLiveQuery(async () => {
    if (!projectId) return null
    const project = await db.projects.get(projectId)
    if (!project || project.deleted) return null
    const [chapters, scenes, markers, notes, lines, characters] = await Promise.all([
      db.chapters.where('projectId').equals(projectId).toArray(),
      db.scenes.where('projectId').equals(projectId).toArray(),
      db.markers.where('projectId').equals(projectId).toArray(),
      db.notes.toArray(),
      db.lines.where('projectId').equals(projectId).toArray(),
      db.characters.where('projectId').equals(projectId).toArray(),
    ])
    return {
      project,
      chapters: alive(chapters),
      scenes: alive(scenes),
      markers: alive(markers),
      notes: alive(notes).filter((n) => !n.projectId || n.projectId === projectId),
      lines: alive(lines).sort((a, b) => a.order - b.order),
      characters: alive(characters).sort((a, b) => a.order - b.order),
    }
  }, [projectId])

  return useMemo(() => {
    if (raw === undefined || raw === null) return raw
    const poolChapter = raw.chapters.find((c) => c.pool)
    const chapters = raw.chapters.filter((c) => !c.pool).sort((a, b) => a.order - b.order)
    const chapterById = new Map([...chapters, ...(poolChapter ? [poolChapter] : [])].map((c) => [c.id, c]))
    const poolScenes = poolChapter ? raw.scenes.filter((s) => s.chapterId === poolChapter.id).sort((a, b) => a.order - b.order) : []
    const outline = chapters.map((chapter) => ({
      chapter,
      scenes: raw.scenes.filter((s) => s.chapterId === chapter.id).sort((a, b) => a.order - b.order),
    }))
    const scenes = outline.flatMap((o) => o.scenes)
    const sceneIndex = new Map(scenes.map((s, i) => [s.id, i]))
    const chapterIndex = new Map(chapters.map((c, i) => [c.id, i]))
    return {
      ...raw,
      chapters,
      scenes,
      outline,
      pool: { chapter: poolChapter, scenes: poolScenes },
      sceneById: new Map([...scenes, ...poolScenes].map((s) => [s.id, s])),
      chapterById,
      sceneIndex,
      chapterIndex,
      markers: [...raw.markers].sort((a, b) => a.createdAt - b.createdAt),
      lineById: new Map(raw.lines.map((l) => [l.id, l])),
      characterById: new Map(raw.characters.map((c) => [c.id, c])),
      notes: [...raw.notes].sort((a, b) => b.createdAt - a.createdAt),
    }
  }, [raw])
}

/** The chapter a marker is planted in / pays off in: from its scene if known, else its planned chapter. */
export function markerSetupChapter(m: Marker, data: ProjectData): string | undefined {
  return (m.setupSceneId && data.sceneById.get(m.setupSceneId)?.chapterId) || m.setupChapterId
}
export function markerPayoffChapter(m: Marker, data: ProjectData): string | undefined {
  return (m.payoffSceneId && data.sceneById.get(m.payoffSceneId)?.chapterId) || m.payoffChapterId
}

/** Marker state, including "late": its payoff was planned before the chapter the author is in now. */
export function markerStatus(m: Marker, data: ProjectData): 'hanging' | 'waiting' | 'late' | 'closed' {
  const st = markerState(m)
  if (st !== 'waiting') return st
  const curScene = data.project.lastSceneId ? data.sceneById.get(data.project.lastSceneId) : undefined
  const cur = curScene ? data.chapterIndex.get(curScene.chapterId) : undefined
  const payCh = markerPayoffChapter(m, data)
  const pay = payCh ? data.chapterIndex.get(payCh) : undefined
  if (cur !== undefined && pay !== undefined && pay < cur) return 'late'
  return 'waiting'
}

/** Quotes and dialogues of the given characters that have not been used in the text yet. */
export function unusedLines(data: ProjectData, characterIds: string[]): Note[] {
  if (!characterIds.length) return []
  return data.notes.filter(
    (n) =>
      !n.archived &&
      !n.used &&
      (n.kind === 'quote' || n.kind === 'dialogue') &&
      (n.characterIds ?? []).some((id) => characterIds.includes(id)),
  )
}

/** Characters in a chapter: everyone marked in any of its scenes. */
export function chapterCharacters(data: ProjectData, chapterId: string): string[] {
  const ids = new Set<string>()
  for (const s of data.scenes) if (s.chapterId === chapterId) for (const id of s.characterIds ?? []) ids.add(id)
  return [...ids]
}

export function sceneLabel(data: ProjectData, sceneId: string | undefined): string {
  if (!sceneId) return '—'
  const s = data.sceneById.get(sceneId)
  if (!s) return 'удалённая сцена'
  return `${data.chapterById.get(s.chapterId)?.title ?? ''} · ${sceneName(data, s)}`
}

/** How to name a chapter in breadcrumbs: its own title if it already says "Часть 2", otherwise "Глава N · title". */
export function chapterLabel(data: ProjectData, chapterId: string, short = false): string {
  const c = data.chapterById.get(chapterId)
  const n = (data.chapterIndex.get(chapterId) ?? 0) + 1
  if (!c) return short ? `Гл. ${n}` : `Глава ${n}`
  if (/^\s*(глава|часть|пролог|эпилог|интерлюдия)/i.test(c.title)) return c.title
  return short ? `Гл. ${n}` : `Глава ${n} · ${c.title}`
}

/** A scene's name: its own title, or "Сцена N" by position in its chapter. */
export function sceneName(data: ProjectData, scene: Scene): string {
  if (scene.title.trim()) return scene.title
  const siblings = scene.chapterId === data.pool.chapter?.id ? data.pool.scenes : data.scenes.filter((s) => s.chapterId === scene.chapterId)
  const n = siblings.indexOf(scene) + 1
  return `Сцена ${n || ''}`.trim()
}
