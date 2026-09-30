import { describe, expect, it } from 'vitest'
import { diffParagraphs, diffWords } from '../lib/diff'

describe('calm diff', () => {
  it('marks removed and added words inside a changed paragraph', () => {
    expect(diffWords('Она взяла кольцо.', 'Она спрятала кольцо.')).toEqual([
      { text: 'Она ', kind: 'same' },
      { text: 'взяла', kind: 'del' },
      { text: 'спрятала', kind: 'add' },
      { text: ' кольцо.', kind: 'same' },
    ])
  })
  it('keeps untouched paragraphs whole and shows removed ones in place', () => {
    const out = diffParagraphs(['Первый.', 'Лишний.', 'Третий.'], ['Первый.', 'Третий.', 'Новый.'])
    expect(out).toEqual([
      [{ text: 'Первый.', kind: 'same' }],
      [{ text: 'Лишний.', kind: 'del' }],
      [{ text: 'Третий.', kind: 'same' }],
      [{ text: 'Новый.', kind: 'add' }],
    ])
  })
})
