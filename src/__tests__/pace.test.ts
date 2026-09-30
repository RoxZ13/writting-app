import { describe, expect, it } from 'vitest'
import type { Project } from '../db/db'
import { bank, chapterProgress, dayKey, pace } from '../lib/pace'

const DAY = 86400000
const now = new Date('2026-10-01T15:00:00').getTime()
const project = (extra: Partial<Project>): Project => ({ id: 'p', title: 'К', createdAt: 0, updatedAt: 0, ...extra })

describe('pace', () => {
  it('averages over the days since writing began and forecasts the finish', () => {
    const p = project({
      progress: { [dayKey(now - 3 * DAY)]: 800, [dayKey(now - 1 * DAY)]: 400, [dayKey(now)]: 400 },
      targetWords: 10000,
      deadline: '2026-10-11',
    })
    const r = pace(p, 4000, now)
    expect(r.today).toBe(400)
    expect(r.perDay).toBe(400) // 1600 words over 4 days
    expect(r.remaining).toBe(6000)
    expect(dayKey(r.finish!.getTime())).toBe(dayKey(now + 15 * DAY))
    expect(r.needPerDay).toBe(546) // 6000 words over 11 days, today and the deadline day included
  })

  it('stays quiet without a target', () => {
    const r = pace(project({}), 1000, now)
    expect(r.perDay).toBe(0)
    expect(r.remaining).toBeUndefined()
  })
})

describe('chapter landmark', () => {
  const chapters = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'pool', pool: true }]
  const scenes = [
    { chapterId: 'a', wordCount: 900 },
    { chapterId: 'b', wordCount: 400 },
    { chapterId: 'b', wordCount: 0 },
    { chapterId: 'pool', wordCount: 50 },
  ]
  it('counts chapters where every scene has text, out of the planned total', () => {
    const r = chapterProgress(project({ targetChapters: 20, deadline: '2026-10-31' }), chapters, scenes, now)
    expect([r.written, r.total, r.left]).toEqual([1, 20, 19])
    expect(r.daysPerChapter).toBe(1) // 31 days for 19 chapters
  })
  it('falls back to the chapters that exist, never counting the pool', () => {
    const r = chapterProgress(project({}), chapters, scenes, now)
    expect([r.written, r.total, r.left, r.daysPerChapter]).toEqual([1, 3, 2, undefined])
  })
})

describe('bank', () => {
  it('sums the month and counts weeks the author came back, from last week if this one is still empty', () => {
    const p = project({ progress: { '2026-10-01': 100, '2026-09-30': 500, '2026-09-22': 300, '2026-09-15': 300, '2026-09-01': 50 } })
    expect(bank(p, now)).toMatchObject({ monthWords: 100, weeks: 3 })
    const quiet = project({ progress: { '2026-09-22': 300, '2026-09-15': 300 } })
    expect(bank(quiet, now).weeks).toBe(2)
    expect(bank(project({}), now)).toMatchObject({ monthWords: 0, weeks: 0 })
  })
})
