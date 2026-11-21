import type { Chapter, Project, Scene } from '../db/db'

export const AUTHOR_SHEET_CHARS = 40_000

export type SceneProgressState = 'empty' | 'writing' | 'written' | 'ready'

export function sceneProgressState(scene: Pick<Scene, 'status' | 'charCount' | 'wordCount'>): SceneProgressState {
  if (scene.status === 'done') return 'ready'
  if ((scene.charCount ?? 0) <= 0 && scene.wordCount <= 0) return 'empty'
  if (scene.status === 'written' || scene.status === 'logic' || scene.status === 'style') return 'written'
  return 'writing'
}

export interface ChapterWritingProgress {
  chars: number
  min?: number
  max?: number
  target?: number
  custom: boolean
  ratio: number
  left?: number
  over: number
  ready: number
  written: number
  total: number
}

/** One source of truth for the editor, board and tests. Live typing may replace one saved scene length. */
export function chapterWritingProgress(
  project: Pick<Project, 'chapterMin' | 'chapterMax'>,
  scenes: Pick<Scene, 'id' | 'status' | 'charCount' | 'wordCount'>[],
  live?: { sceneId: string; chars: number },
  chapter?: Pick<Chapter, 'targetMin' | 'targetMax'>,
): ChapterWritingProgress {
  const chars = scenes.reduce((sum, scene) => sum + (scene.id === live?.sceneId ? live.chars : (scene.charCount ?? 0)), 0)
  const custom = chapter?.targetMin !== undefined || chapter?.targetMax !== undefined
  const selectedMin = custom ? chapter?.targetMin : project.chapterMin
  const selectedMax = custom ? chapter?.targetMax : project.chapterMax
  const min = selectedMin && selectedMax ? Math.min(selectedMin, selectedMax) : selectedMin
  const max = selectedMin && selectedMax ? Math.max(selectedMin, selectedMax) : selectedMax
  const target = max || min
  const states = scenes.map(sceneProgressState)
  return {
    chars,
    min,
    max,
    target,
    custom,
    ratio: target ? chars / target : 0,
    left: target ? Math.max(0, target - chars) : undefined,
    over: target ? Math.max(0, chars - target) : 0,
    ready: states.filter((state) => state === 'ready').length,
    written: states.filter((state) => state === 'written' || state === 'ready').length,
    total: scenes.length,
  }
}

export function bookReadyProgress(scenes: Pick<Scene, 'chapterId' | 'status'>[], chapterIds: string[]) {
  const readiness = chapterReadiness(scenes)
  const ready = chapterIds.filter((id) => readiness.get(id)).length
  return { ready, total: chapterIds.length }
}

function chapterReadiness(scenes: Pick<Scene, 'chapterId' | 'status'>[]) {
  const readiness = new Map<string, boolean>()
  for (const scene of scenes) {
    readiness.set(scene.chapterId, readiness.get(scene.chapterId) !== false && scene.status === 'done')
  }
  return readiness
}

export function storyPlan(
  project: Pick<Project, 'targetChapters'>,
  chapters: Pick<Chapter, 'id' | 'title' | 'order' | 'deadline' | 'pool'>[],
  scenes: Pick<Scene, 'id' | 'chapterId' | 'status' | 'order'>[],
) {
  const real = chapters.filter((chapter) => !chapter.pool).sort((a, b) => a.order - b.order)
  const readiness = chapterReadiness(scenes)
  const ready = real.filter((chapter) => readiness.get(chapter.id)).length
  const total = Math.max(real.length, project.targetChapters || 0)
  const pending = real.filter((chapter) => !readiness.get(chapter.id))
  const next = pending.reduce<(typeof pending)[number] | undefined>((first, chapter) => {
    if (!chapter.deadline) return first
    return !first?.deadline || chapter.deadline < first.deadline ? chapter : first
  }, undefined) ?? pending[0]
  const nextScene = next && scenes.filter((scene) => scene.chapterId === next.id && scene.status !== 'done')
    .sort((a, b) => a.order - b.order)[0]
  return { ready, total, next, sceneId: nextScene?.id }
}

export interface BookWritingProgress {
  chars: number
  target?: number
  ratio: number
  sheets: number
  targetSheets?: number
  completedChapters: number
  forecast?: number
  forecastSample: number
}

/** Forecast only from completed chapters; unfinished short drafts never pull the estimate down. */
export function bookWritingProgress(
  project: Pick<Project, 'targetChars' | 'targetChapters'>,
  chapters: Pick<Chapter, 'id' | 'pool'>[],
  scenes: Pick<Scene, 'chapterId' | 'status' | 'charCount'>[],
): BookWritingProgress {
  const real = chapters.filter((chapter) => !chapter.pool)
  const chars = scenes.reduce((sum, scene) => sum + (scene.charCount ?? 0), 0)
  const completed = real
    .map((chapter) => ({ chapter, scenes: scenes.filter((scene) => scene.chapterId === chapter.id) }))
    .filter(({ scenes: own }) => own.length > 0 && own.every((scene) => scene.status === 'done'))
  const completedChars = completed.reduce((sum, item) => sum + item.scenes.reduce((n, scene) => n + (scene.charCount ?? 0), 0), 0)
  const forecast = project.targetChapters && completed.length >= 3
    ? Math.round((completedChars / completed.length) * project.targetChapters)
    : undefined
  return {
    chars,
    target: project.targetChars,
    ratio: project.targetChars ? chars / project.targetChars : 0,
    sheets: chars / AUTHOR_SHEET_CHARS,
    targetSheets: project.targetChars ? project.targetChars / AUTHOR_SHEET_CHARS : undefined,
    completedChapters: completed.length,
    forecast,
    forecastSample: completed.length,
  }
}
