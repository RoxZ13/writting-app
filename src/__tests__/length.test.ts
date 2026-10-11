import { describe, expect, it } from 'vitest'
import type { Project } from '../db/db'
import { chapterLength, normText, pages } from '../lib/length'
import { docCharCount } from '../lib/text'

const p = (x: Partial<Project>) => ({ id: 'p', title: '', createdAt: 0, updatedAt: 0, ...x }) as Project

describe('chapter length against the norm', () => {
  it('counts characters with spaces, without line breaks', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Да, это я.' }] }, { type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: ' — Нет.' }] }] }
    expect(docCharCount(doc)).toBe(10 + 6)
  })
  it('goes short → ok → near → over', () => {
    const q = p({ chapterMin: 18000, chapterMax: 36000 })
    expect(chapterLength(q, 9000).state).toBe('short')
    expect(chapterLength(q, 9000).toMin).toBe(9000)
    expect(chapterLength(q, 20000).state).toBe('ok')
    expect(chapterLength(q, 33000).state).toBe('near')
    expect(chapterLength(q, 33000).left).toBe(3000)
    expect(chapterLength(q, 40000)).toMatchObject({ state: 'over', over: 4000, fill: 1 })
    expect(chapterLength(p({}), 40000).state).toBe('none')
  })
  it('speaks in pages or characters', () => {
    expect(pages(p({}), 2700)).toBe('1,5 стр.')
    expect(normText(p({ chapterMin: 18000, chapterMax: 36000 }))).toBe('10–20 стр.')
    expect(normText(p({ chapterMax: 30000, lengthUnit: 'chars' }))).toMatch(/^до 30\s000 зн\.$/)
  })
})
