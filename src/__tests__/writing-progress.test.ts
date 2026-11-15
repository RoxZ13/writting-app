import { describe, expect, it } from 'vitest'
import { bookReadyProgress, chapterWritingProgress, sceneProgressState } from '../lib/writing-progress'

const scene = (id: string, status: any, chars = 0, chapterId = 'c') => ({ id, chapterId, status, charCount: chars, wordCount: Math.round(chars / 6) })

describe('writing progress', () => {
  it('distinguishes an empty, active, written and ready scene', () => {
    expect(sceneProgressState(scene('1', 'idea'))).toBe('empty')
    expect(sceneProgressState(scene('2', 'draft', 500))).toBe('writing')
    expect(sceneProgressState(scene('3', 'written', 500))).toBe('written')
    expect(sceneProgressState(scene('4', 'done', 500))).toBe('ready')
  })

  it('uses live characters and shows how much of the chapter limit is left', () => {
    const progress = chapterWritingProgress(
      { chapterMax: 10_000 },
      [scene('1', 'done', 3_000), scene('2', 'draft', 1_000)],
      { sceneId: '2', chars: 2_500 },
    )
    expect(progress).toMatchObject({ chars: 5_500, target: 10_000, ratio: 0.55, left: 4_500, over: 0, ready: 1, total: 2 })
  })

  it('counts a chapter ready only when every scene is ready', () => {
    expect(bookReadyProgress([scene('1', 'done', 100, 'a'), scene('2', 'done', 100, 'a'), scene('3', 'draft', 100, 'b')], ['a', 'b'])).toEqual({ ready: 1, total: 2 })
  })
})
