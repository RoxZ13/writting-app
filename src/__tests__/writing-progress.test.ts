import { describe, expect, it } from 'vitest'
import { bookReadyProgress, bookWritingProgress, chapterWritingProgress, sceneProgressState } from '../lib/writing-progress'

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

  it('uses a chapter-specific range without changing the common range', () => {
    const progress = chapterWritingProgress(
      { chapterMin: 12_000, chapterMax: 18_000 },
      [scene('1', 'draft', 14_000)],
      undefined,
      { targetMin: 8_000, targetMax: 10_000 },
    )
    expect(progress).toMatchObject({ min: 8_000, max: 10_000, custom: true, chars: 14_000, over: 4_000 })
  })

  it('forecasts only after three completed chapters', () => {
    const chapters = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
    const two = [scene('1', 'done', 20_000, 'a'), scene('2', 'done', 22_000, 'b'), scene('3', 'draft', 1_000, 'c')]
    expect(bookWritingProgress({ targetChars: 400_000, targetChapters: 20 }, chapters, two).forecast).toBeUndefined()
    const three = [...two, scene('4', 'done', 18_000, 'd')]
    expect(bookWritingProgress({ targetChars: 400_000, targetChapters: 20 }, chapters, three)).toMatchObject({
      completedChapters: 3,
      forecastSample: 3,
      forecast: 400_000,
      targetSheets: 10,
    })
  })
})
