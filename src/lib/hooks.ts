import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, type Chapter, type Marker, type Note, type Project, type Scene } from '../db/db'
import { alive, markerState } from '../db/repo'

export interface ProjectData {
  project: Project
  chapters: Chapter[]
  scenes: Scene[]
  /** Scenes grouped by chapter, both in order. */
  outline: { chapter: Chapter; scenes: Scene[] }[]
  markers: Marker[]
  notes: Note[]
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
    const [chapters, scenes, markers, notes] = await Promise.all([
      db.chapters.where('projectId').equals(projectId).toArray(),
      db.scenes.where('projectId').equals(projectId).toArray(),
      db.markers.where('projectId').equals(projectId).toArray(),
      db.notes.toArray(),
    ])
    return {
      project,
      chapters: alive(chapters),
      scenes: alive(scenes),
      markers: alive(markers),
      notes: alive(notes).filter((n) => !n.projectId || n.projectId === projectId),
    }
  }, [projectId])

  return useMemo(() => {
    if (raw === undefined || raw === null) return raw
    const chapters = [...raw.chapters].sort((a, b) => a.order - b.order)
    const chapterById = new Map(chapters.map((c) => [c.id, c]))
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
      sceneById: new Map(scenes.map((s) => [s.id, s])),
      chapterById,
      sceneIndex,
      chapterIndex,
      markers: [...raw.markers].sort((a, b) => a.createdAt - b.createdAt),
      notes: [...raw.notes].sort((a, b) => b.createdAt - a.createdAt),
    }
  }, [raw])
}

/** Marker state, including "late": its payoff scene is before where the author currently is. */
export function markerStatus(m: Marker, data: ProjectData): 'hanging' | 'waiting' | 'late' | 'closed' {
  const st = markerState(m)
  if (st !== 'waiting') return st
  const cur = data.project.lastSceneId ? data.sceneIndex.get(data.project.lastSceneId) : undefined
  const pay = m.payoffSceneId ? data.sceneIndex.get(m.payoffSceneId) : undefined
  if (cur !== undefined && pay !== undefined && pay < cur) return 'late'
  return 'waiting'
}

export function sceneLabel(data: ProjectData, sceneId: string | undefined): string {
  if (!sceneId) return '—'
  const s = data.sceneById.get(sceneId)
  if (!s) return 'удалённая сцена'
  const ci = data.chapterIndex.get(s.chapterId)
  return `${ci !== undefined ? `Гл. ${ci + 1} · ` : ''}${s.title}`
}

/** How to name a chapter in breadcrumbs: its own title if it already says "Часть 2", otherwise "Глава N · title". */
export function chapterLabel(data: ProjectData, chapterId: string, short = false): string {
  const c = data.chapterById.get(chapterId)
  const n = (data.chapterIndex.get(chapterId) ?? 0) + 1
  if (!c) return short ? `Гл. ${n}` : `Глава ${n}`
  if (/^\s*(глава|часть|пролог|эпилог|интерлюдия)/i.test(c.title)) return c.title
  return short ? `Гл. ${n}` : `Глава ${n} · ${c.title}`
}
