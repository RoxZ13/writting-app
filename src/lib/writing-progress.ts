import type { Project, Scene } from '../db/db'

export type SceneProgressState = 'empty' | 'writing' | 'written' | 'ready'

export function sceneProgressState(scene: Pick<Scene, 'status' | 'charCount' | 'wordCount'>): SceneProgressState {
  if (scene.status === 'done') return 'ready'
  if ((scene.charCount ?? 0) <= 0 && scene.wordCount <= 0) return 'empty'
  if (scene.status === 'written' || scene.status === 'logic' || scene.status === 'style') return 'written'
  return 'writing'
}

export interface ChapterWritingProgress {
  chars: number
  target?: number
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
): ChapterWritingProgress {
  const chars = scenes.reduce((sum, scene) => sum + (scene.id === live?.sceneId ? live.chars : (scene.charCount ?? 0)), 0)
  const target = project.chapterMax || project.chapterMin
  const states = scenes.map(sceneProgressState)
  return {
    chars,
    target,
    ratio: target ? chars / target : 0,
    left: target ? Math.max(0, target - chars) : undefined,
    over: target ? Math.max(0, chars - target) : 0,
    ready: states.filter((state) => state === 'ready').length,
    written: states.filter((state) => state === 'written' || state === 'ready').length,
    total: scenes.length,
  }
}

export function bookReadyProgress(scenes: Pick<Scene, 'chapterId' | 'status'>[], chapterIds: string[]) {
  const ready = chapterIds.filter((id) => {
    const inChapter = scenes.filter((scene) => scene.chapterId === id)
    return inChapter.length > 0 && inChapter.every((scene) => scene.status === 'done')
  }).length
  return { ready, total: chapterIds.length }
}
