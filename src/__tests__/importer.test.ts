import { describe, expect, it } from 'vitest'
import { blocksToChapters, isChapterTitle, parseBook, parseTaggedRuns, textToBlocks } from '../lib/importer'
import { chapterToFicbook } from '../lib/exporter'
import type { Chapter, Scene } from '../db/db'

describe('import', () => {
  it('recognises chapter headings but not ordinary sentences', () => {
    expect(isChapterTitle('Глава 18')).toBe(true)
    expect(isChapterTitle('Глава XVIII. Фонтан')).toBe(true)
    expect(isChapterTitle('Глава первая')).toBe(true)
    expect(isChapterTitle('Пролог')).toBe(true)
    expect(isChapterTitle('Chapter 3: The Diary')).toBe(true)
    expect(isChapterTitle('Глава семьи молча кивнул.')).toBe(false)
    expect(isChapterTitle('Частью себя она понимала, что он прав.')).toBe(false)
  })

  it('splits text into chapters and scenes', () => {
    const text = [
      'Предисловие автора.',
      'Глава 1',
      'Первый абзац.',
      'Второй абзац.',
      '* * *',
      'Новая сцена.',
      'Глава 2',
      'Текст второй главы.',
    ].join('\n')
    const chapters = blocksToChapters(textToBlocks(text))
    expect(chapters.map((c) => c.title)).toEqual(['Начало (до первой главы)', 'Глава 1', 'Глава 2'])
    expect(chapters[1].scenes).toHaveLength(2)
    expect(chapters[1].scenes[0].wordCount).toBe(4)
  })

  it('treats long separator lines as scene breaks', () => {
    const chapters = blocksToChapters(textToBlocks('Глава 1\nРаз.\n**********************************\nДва.'))
    expect(chapters[0].scenes.map((s) => s.title)).toEqual(['Раз', 'Два'])
  })

  it('reads Ficbook .txt part markers', () => {
    const text = [
      'Геката Сотейра',
      '========== Часть 1 ==========',
      'Jimmy Eat World — Pain',
      'Текст.',
      '— Заткнись, Тео. Муффлиато!',
      '========== Часть 2 ==========',
      'Serj Tankian — Your Mom',
      '— Часть 2 плана провалилась, — сказала она.',
    ].join('\n')
    const chapters = blocksToChapters(textToBlocks(text))
    expect(chapters.map((c) => c.title)).toEqual(['Начало (до первой главы)', 'Часть 1', 'Часть 2'])
    expect(chapters[2].scenes[0].wordCount).toBe(10)
  })

  it('keeps the file header out of the chapters', () => {
    const book = parseBook(
      textToBlocks('Геката Сотейра\nНаправленность: Гет\nОписание фика.\n===== Часть 1 =====\nТекст главы.'),
    )
    expect(book.title).toBe('Геката Сотейра')
    expect(book.preface).toContain('Направленность: Гет')
    expect(book.chapters.map((c) => c.title)).toEqual(['Часть 1'])
  })

  it('keeps Ficbook italics', () => {
    expect(parseTaggedRuns('Он сказал <i>тихо</i>.')).toEqual([
      { text: 'Он сказал ' },
      { text: 'тихо', italic: true },
      { text: '.' },
    ])
  })
})

describe('ficbook export', () => {
  it('round-trips formatting and scene breaks', () => {
    const [ch] = blocksToChapters(textToBlocks('Глава 1\nОн сказал <i>тихо</i>.\n***\nВторая <b>сцена</b>.'))
    const scenes = ch.scenes.map((s, i) => ({ id: String(i), content: s.doc }) as unknown as Scene & { content: unknown })
    const out = chapterToFicbook({ chapter: {} as Chapter, scenes })
    expect(out).toBe('Он сказал <i>тихо</i>.\n\n<center>* * *</center>\n\nВторая <b>сцена</b>.')
  })
})
