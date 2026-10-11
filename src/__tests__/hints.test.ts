import { describe, expect, it } from 'vitest'
import type { Marker } from '../db/db'
import { outOfOrder, sceneHints } from '../lib/hints'

const mk = (id: string, setup?: string, payoff?: string) =>
  ({ id, projectId: 'p', title: id, note: '', setupSceneId: setup, payoffSceneId: payoff, resolved: false, createdAt: 0, updatedAt: 0 }) as Marker
const order = new Map([
  ['s1', 0],
  ['s2', 1],
  ['s3', 2],
])

describe('hints on the board', () => {
  it('a hint planted after its payoff is out of order', () => {
    expect(outOfOrder(mk('scar', 's3', 's1'), order)).toBe(true)
    expect(outOfOrder(mk('scar', 's1', 's3'), order)).toBe(false)
  })

  it('a hint without a place, or with a scene in the pool, is never out of order', () => {
    expect(outOfOrder(mk('scar', undefined, 's1'), order)).toBe(false)
    expect(outOfOrder(mk('scar', 'pool-scene', 's1'), order)).toBe(false)
  })

  it('counts what is planted, what pays off and what still waits for a place', () => {
    const all = [mk('a', 's1', 's3'), mk('b', undefined, 's3'), mk('c', 's3', 's2')]
    const h = sceneHints('s3', all, order)
    expect(h.total).toBe(3)
    expect(h.waiting.map((m) => m.id)).toEqual(['b'])
    expect(h.broken.map((m) => m.id)).toEqual(['c'])
  })
})
