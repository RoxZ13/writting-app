import { describe, expect, it } from 'vitest'
import { budgetState, charsPerWord, sceneBudget } from '../lib/budget'
import { lengthText, normText } from '../lib/length'
import type { Project, Scene } from '../db/db'

const sc = (id: string, charCount = 0, x: Partial<Scene> = {}) => ({ id, charCount, wordCount: 0, status: 'draft', ...x }) as Scene
const norm = (chapterMax?: number, chapterMin?: number) => ({ chapterMax, chapterMin })
const p = (x: Partial<Project>) => ({ id: 'p', title: '', createdAt: 0, updatedAt: 0, ...x }) as Project

describe('scene budget from the chapter norm', () => {
  it('splits the norm equally between empty scenes', () => {
    const ch = [sc('a'), sc('b'), sc('c'), sc('d')]
    expect(sceneBudget(norm(8000), ch, 'b', ch)).toEqual({ budget: 2000, source: 'norm' })
  })
  it('falls back to the lower bound when there is no upper one', () => {
    const ch = [sc('a'), sc('b')]
    expect(sceneBudget(norm(undefined, 6000), ch, 'a', ch)?.budget).toBe(3000)
  })
  it('gives a key scene 1.5 times as much', () => {
    const ch = [sc('a', 0, { node: true }), sc('b'), sc('c')]
    // weights 1.5 + 1 + 1 = 3.5 of 7000
    expect(sceneBudget(norm(7000), ch, 'a', ch)?.budget).toBeCloseTo(3000)
    expect(sceneBudget(norm(7000), ch, 'b', ch)?.budget).toBeCloseTo(2000)
  })
  it('shrinks the next scene when the first one overspent', () => {
    const fair = [sc('a'), sc('b')]
    const spent = [sc('a', 6000), sc('b')]
    expect(sceneBudget(norm(8000), fair, 'b', fair)?.budget).toBe(4000)
    expect(sceneBudget(norm(8000), spent, 'b', spent)?.budget).toBe(2000)
  })
  it('never drops below half of the fair share', () => {
    const ch = [sc('a', 9000), sc('b')]
    expect(sceneBudget(norm(8000), ch, 'b', ch)?.budget).toBe(2000)
  })
  it('counts a later scene that is already written as spent', () => {
    const ch = [sc('a'), sc('b'), sc('c', 3000)]
    // 9000 - 3000 left for the two empty ones
    expect(sceneBudget(norm(9000), ch, 'a', ch)?.budget).toBe(3000)
    expect(sceneBudget(norm(9000), ch, 'b', ch)?.budget).toBe(3000)
  })
  it('does not count the scene itself, so its budget stays put while typing', () => {
    const before = [sc('a', 100), sc('b')]
    const after = [sc('a', 2500), sc('b')]
    expect(sceneBudget(norm(8000), before, 'a', before)?.budget).toBe(sceneBudget(norm(8000), after, 'a', after)?.budget)
  })
})

describe('scene budget without a norm', () => {
  const book = (...sizes: number[]) => sizes.map((n, i) => sc(`w${i}`, n))
  it('is the median of the written scenes', () => {
    const all = [...book(1000, 3000, 2000, 9000), sc('me')]
    expect(sceneBudget(norm(), null, 'me', all)).toEqual({ budget: 2500, source: 'median' })
  })
  it('ignores empty scenes and ideas', () => {
    const all = [...book(1000, 2000, 3000), sc('e'), sc('i', 50000, { status: 'idea' }), sc('me')]
    expect(sceneBudget(norm(), null, 'me', all)?.budget).toBe(2000)
  })
  it('needs at least three written scenes', () => {
    expect(sceneBudget(norm(), null, 'me', [...book(1000, 2000), sc('me')])).toBeNull()
  })
  it('is used for a scene without a chapter even when a norm exists', () => {
    const all = [...book(1000, 2000, 3000), sc('me')]
    expect(sceneBudget(norm(8000), null, 'me', all)).toEqual({ budget: 2000, source: 'median' })
  })
  it('gives a key scene 1.5 times the median', () => {
    const all = [...book(2000, 2000, 2000), sc('me', 0, { node: true })]
    expect(sceneBudget(norm(), null, 'me', all)?.budget).toBe(3000)
  })
})

describe('budget state', () => {
  it('is calm below 80 %, near from exactly 80 % to 100 %, over above', () => {
    expect(budgetState(799, 1000).state).toBe('calm')
    expect(budgetState(800, 1000).state).toBe('near')
    expect(budgetState(1000, 1000)).toMatchObject({ state: 'near', over: 0 })
    expect(budgetState(1001, 1000)).toMatchObject({ state: 'over', over: 1 })
    expect(budgetState(1500, 1000).over).toBe(500)
  })
})

describe('words as the author unit', () => {
  it('measures characters per word on the book, with a fallback', () => {
    expect(charsPerWord([])).toBe(6.8)
    expect(charsPerWord([{ charCount: 700, wordCount: 100 }, { charCount: 0, wordCount: 0 }])).toBe(7)
  })
  it('speaks in words', () => {
    const q = p({ lengthUnit: 'words', chapterMax: 14000, chapterMin: 7000 })
    expect(lengthText(q, 7000, 7)).toMatch(/^1\s000 сл\.$/)
    expect(normText(q)).toMatch(/^\d[\d\s]* ?–.*сл\.$/)
    expect(normText(q).match(/сл\./g)).toHaveLength(1)
  })
})
