import { describe, expect, it } from 'vitest'
import type { Project } from '../db/db'
import { dayKey, pace } from '../lib/pace'

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
