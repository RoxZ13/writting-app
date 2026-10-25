import { describe, expect, it } from 'vitest'
import type { Scene } from '../db/db'
import { MAIN, momentsOf, place, type Span } from '../lib/moments'

const rows = ['a', 'b', 'c', MAIN]
const span: Span = (s) => {
  const r = (s.lineIds?.length ? s.lineIds : [MAIN]).map((id) => rows.indexOf(id))
  return [Math.min(...r), Math.max(...r)]
}
const sc = (id: string, chapterId: string, order: number, lineIds: string[], together?: boolean) =>
  ({ id, chapterId, order, lineIds, together, title: id, projectId: 'p', status: 'idea', goal: '', beats: [], wordCount: 0, updatedAt: 0 }) as Scene

const ids = (ms: Scene[][]) => ms.map((m) => m.map((s) => s.id).join('+'))

describe('moments on «Линия истории»', () => {
  it('scenes marked together share a moment', () => {
    const list = [sc('1', 'c1', 0, ['a']), sc('2', 'c1', 1, ['b'], true), sc('3', 'c1', 2, ['a'])]
    expect(ids(momentsOf(list, span))).toEqual(['1+2', '3'])
  })

  it('two scenes of one branch never happen at once', () => {
    const list = [sc('1', 'c1', 0, ['a']), sc('2', 'c1', 1, ['a'], true)]
    expect(ids(momentsOf(list, span))).toEqual(['1', '2'])
  })

  it('a node spans the rows between its branches', () => {
    const list = [sc('1', 'c1', 0, ['a', 'c']), sc('2', 'c1', 1, ['b'], true)]
    expect(ids(momentsOf(list, span))).toEqual(['1', '2'])
  })

  it('dropping into an empty cell makes the scene parallel and moves it to that branch', () => {
    const s1 = sc('1', 'c1', 0, ['a'])
    const s2 = sc('2', 'c1', 1, ['a'])
    const out = place(new Map([['c1', [s1, s2]]]), s2, { kind: 'cell', chapterId: 'c1', moment: 0, lane: 'b' }, span)
    expect(out).toEqual([
      { id: '1', chapterId: 'c1', order: 0, together: undefined, lineIds: ['a'] },
      { id: '2', chapterId: 'c1', order: 1, together: true, lineIds: ['b'] },
    ])
  })

  it('dropping between moments makes a new moment; the old one closes up', () => {
    const s1 = sc('1', 'c1', 0, ['a'])
    const s2 = sc('2', 'c1', 1, ['b'], true)
    const s3 = sc('3', 'c1', 2, ['a'])
    const out = place(new Map([['c1', [s1, s2, s3]]]), s1, { kind: 'gap', chapterId: 'c1', moment: 2 }, span)
    expect(out.map((p) => `${p.id}${p.together ? '~' : ''}`)).toEqual(['2', '3', '1'])
  })

  it('a scene from the pool lands in a chapter; the pool stays without time', () => {
    const p1 = sc('x', 'pool', 0, [])
    const p2 = sc('y', 'pool', 1, [])
    const s1 = sc('1', 'c1', 0, ['a'])
    const out = place(new Map([['pool', [p1, p2]], ['c1', [s1]]]), p1, { kind: 'cell', chapterId: 'c1', moment: 0, lane: 'c' }, span)
    expect(out.find((p) => p.id === 'x')).toMatchObject({ chapterId: 'c1', order: 1, together: true, lineIds: ['c'] })
    expect(out.find((p) => p.id === 'y')).toMatchObject({ chapterId: 'pool', order: 0, together: undefined })
  })

  it('a node keeps its branches when moved', () => {
    const s1 = sc('1', 'c1', 0, ['a', 'b'])
    const s2 = sc('2', 'c1', 1, ['c'])
    const out = place(new Map([['c1', [s1, s2]]]), s1, { kind: 'cell', chapterId: 'c1', moment: 1, lane: MAIN }, span)
    expect(out.find((p) => p.id === '1')).toMatchObject({ order: 1, together: true, lineIds: ['a', 'b'] })
  })

  it('a taken cell puts the scene in a new moment just before', () => {
    const s1 = sc('1', 'c1', 0, ['a'])
    const s2 = sc('2', 'c1', 1, ['b'])
    const out = place(new Map([['c1', [s1, s2]]]), s2, { kind: 'cell', chapterId: 'c1', moment: 0, lane: 'a' }, span)
    expect(out.map((p) => `${p.id}${p.together ? '~' : ''}`)).toEqual(['2', '1'])
  })
})
