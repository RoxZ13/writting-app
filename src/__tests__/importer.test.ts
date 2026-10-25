import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db } from '../db/db'
import { importBook, importChapters } from '../components/ImportPanel'
import { blocksToChapters, isChapterTitle, isEpigraph, parseBook, parseTaggedRuns, textToBlocks } from '../lib/importer'
import { chapterToFicbook, chapterToRich, tidyTypography } from '../lib/exporter'
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
    expect(chapters[0].scenes.map((s) => s.excerpt)).toEqual(['Раз.', 'Два.'])
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

  it('takes a song line as the epigraph, not as the scene title', () => {
    const [ch] = blocksToChapters(textToBlocks('Часть 1\nAC/DC — Wild Reputation\nГрейнджер готовилась к трансфигурации.'))
    expect(ch.scenes[0].title).toBe('')
    expect(ch.scenes[0].epigraph).toBe('AC/DC — Wild Reputation')
    expect(ch.scenes[0].excerpt).toBe('Грейнджер готовилась к трансфигурации.')
    expect(isEpigraph('— Грейнджер, объясни мне кое-что')).toBe(false)
    expect(isEpigraph('Slaves — The Hunter')).toBe(true)
    expect(isEpigraph('Она сказала — нет, и ушла.')).toBe(false)
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

describe('rich export (Author.Today, Литнет, AO3)', () => {
  it('gives HTML with formatting and plain text, escaping what looks like tags', () => {
    const [ch] = blocksToChapters(textToBlocks('Глава 1\nОн сказал <i>тихо</i> & 1 < 2.\n***\nВторая <b>сцена</b>.'))
    const scenes = ch.scenes.map((s, i) => ({ id: String(i), content: s.doc }) as unknown as Scene & { content: unknown })
    const { html, text } = chapterToRich({ chapter: {} as Chapter, scenes })
    expect(html).toBe('<p>Он сказал <em>тихо</em> &amp; 1 &lt; 2.</p>\n<p style="text-align:center">* * *</p>\n<p>Вторая <strong>сцена</strong>.</p>')
    expect(text).toBe('Он сказал тихо & 1 < 2.\n\n* * *\n\nВторая сцена.')
  })
})

describe('typography on export', () => {
  it('fixes dashes, quotes and dots that came in from elsewhere, leaving tags and hyphenated words', () => {
    expect(tidyTypography('- Ты правда думаешь - так лучше? - спросила она...')).toBe('— Ты правда думаешь — так лучше? — спросила она…')
    expect(tidyTypography('<i>- Кто-то "там"</i> -- ушёл')).toBe('<i>— Кто-то «там»</i> — ушёл')
  })
})

describe('chapter headings: prose is not a heading (unframed lines)', () => {
  it('needs the number to end the line or be followed by a separator', () => {
    for (const ok of ['Глава 1', 'Глава 1. Встреча', 'Часть первая: Начало', 'Пролог', 'Эпилог. Год спустя', 'Глава 3 — Дом', 'Chapter 3 - The Diary'])
      expect(isChapterTitle(ok), ok).toBe(true)
    for (const no of ['Часть пятая его души осталась там', 'Глава семьи сказал…', 'Глава 2 плана провалилась'])
      expect(isChapterTitle(no), no).toBe(false)
  })

  it('framed lines keep the old, looser behaviour', () => {
    const chapters = blocksToChapters(textToBlocks('===== Часть пятая его души =====\nТекст.'))
    expect(chapters.map((c) => c.title)).toEqual(['Часть пятая его души'])
  })

  it('does not split a book on a prose line', () => {
    const text = 'Глава 1\nРаз.\nЧасть пятая его души осталась там.\nДва.'
    const chapters = blocksToChapters(textToBlocks(text))
    expect(chapters.map((c) => c.title)).toEqual(['Глава 1'])
    expect(chapters[0].scenes[0].wordCount).toBe(8)
  })
})

describe('invisible characters', () => {
  it('a zero-width space at the edge of a heading or a scene break does not break the structure', () => {
    const text = '\u200B========== Часть 1 ==========\u200B\nРаз.\n\u200B***\nДва.\n\uFEFF========== Часть 2 ==========\nТри.'
    const chapters = blocksToChapters(textToBlocks(text))
    expect(chapters.map((c) => c.title)).toEqual(['Часть 1', 'Часть 2'])
    expect(chapters[0].scenes).toHaveLength(2)
  })

  it('a ZWSP-only line is not an empty paragraph, and ZWSP inside a word is removed', () => {
    const blocks = textToBlocks('Глава 1\n\u200B\nпри\u200Bвет\n\u200D')
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'para', 'para'])
    const para = blocks[1] as Extract<(typeof blocks)[number], { kind: 'para' }>
    expect(para.runs[0].text).toBe('привет')
    // ZWJ (emoji glue) survives: that last line is a real paragraph
    expect((blocks[2] as typeof para).runs[0].text).toBe('\u200D')
  })

  // Loading jsdom alone takes seconds under a busy machine; the default 5 s timeout made this test flaky.
  it('also in HTML', { timeout: 30_000 }, async () => {
    const jsdom = 'jsdom'
    const { JSDOM } = (await import(/* @vite-ignore */ jsdom)) as { JSDOM: new (html: string) => { window: any } }
    const w = new JSDOM('').window
    const keep = { DOMParser: globalThis.DOMParser, Node: globalThis.Node, Element: globalThis.Element }
    Object.assign(globalThis, { DOMParser: w.DOMParser, Node: w.Node, Element: w.Element })
    try {
      const { htmlToBlocks } = await import('../lib/importer')
      const blocks = htmlToBlocks('<p>\u200B***</p><p>при\u200Bвет</p><p>\u200B</p>')
      expect(blocks.map((b) => b.kind)).toEqual(['break', 'para'])
      expect((blocks[1] as Extract<(typeof blocks)[number], { kind: 'para' }>).runs[0].text).toBe('привет')
    } finally {
      Object.assign(globalThis, keep)
    }
  })
})

describe('prologue without a heading', () => {
  const prose = (n: number) => Array.from({ length: n }, (_, i) => `Абзац ${i + 1}. ` + 'Слово '.repeat(60)).join('\n')

  it('keeps a long unheaded prefix as a first chapter', () => {
    const book = parseBook(textToBlocks(`${prose(5)}\nГлава 1\nТекст.`))
    expect(book.preface).toBe('')
    expect(book.chapters.map((c) => c.title)).toEqual(['Начало (до первой главы)', 'Глава 1'])
    expect(book.chapters[0].scenes[0].wordCount).toBeGreaterThan(200)
  })

  it('keeps a short header (≤3 short paragraphs) as the preface', () => {
    const book = parseBook(textToBlocks('Название\nКоротко о книге.\nГлава 1\nТекст.'))
    expect(book.title).toBe('Название')
    expect(book.preface).toBe('Название\nКоротко о книге.')
    expect(book.chapters.map((c) => c.title)).toEqual(['Глава 1'])
  })

  it('keeps a long Ficbook header (has markers) as the preface', () => {
    const head = ['Название', 'Автор: Некто', 'Фэндом: Гарри Поттер', 'Рейтинг: R', 'Описание: ' + 'длинное '.repeat(40)].join('\n')
    const book = parseBook(textToBlocks(`${head}\n========== Часть 1 ==========\nТекст.`))
    expect(book.preface).toContain('Фэндом: Гарри Поттер')
    expect(book.chapters.map((c) => c.title)).toEqual(['Часть 1'])
    const url = parseBook(textToBlocks('a\nb\nc\nhttps://ficbook.net/readfic/1\n' + 'x '.repeat(10) + '\nГлава 1\nТекст.'))
    expect(url.preface).toContain('ficbook.net')
  })
})

describe('author comments (Ficbook)', () => {
  const text = [
    '========== Часть 10 ==========',
    'Текст десятой.',
    '========== Часть 11 ==========',
    'Первая сцена.',
    '***',
    'Последняя сцена.',
    '   Комментарий к Часть 11',
    'Спасибо, что читаете!',
    '* * *',
    'До встречи.',
    '========== Часть 12 ==========',
    'Текст двенадцатой.',
  ].join('\n')

  it('moves the comment out of the scene text into chapter.comment', () => {
    const chapters = parseBook(textToBlocks(text)).chapters
    expect(chapters.map((c) => c.title)).toEqual(['Часть 10', 'Часть 11', 'Часть 12'])
    expect(chapters[0].comment).toBeUndefined()
    expect(chapters[1].scenes).toHaveLength(2)
    expect(chapters[1].scenes[1].excerpt).toBe('Последняя сцена.')
    expect(chapters[1].scenes[1].wordCount).toBe(2)
    expect(chapters[1].comment).toBe('Спасибо, что читаете!\n* * *\nДо встречи.')
    expect(chapters[2].comment).toBeUndefined()
  })

  it('works at the end of the file too', () => {
    const chapters = blocksToChapters(textToBlocks('Часть 1\nТекст.\nКомментарий к Часть 1\nПривет.'))
    expect(chapters[0].comment).toBe('Привет.')
    expect(chapters[0].scenes[0].wordCount).toBe(1)
  })

  it('a line starting with «Комментарий к» that is not for this part stays prose', () => {
    const chapters = blocksToChapters(textToBlocks('Часть 1\nТекст.\nКомментарий к плану был таким.'))
    expect(chapters[0].comment).toBeUndefined()
    expect(chapters[0].scenes[0].wordCount).toBe(6)
  })
})

describe('import into the database: notes', () => {
  let n = 0
  const fresh = async () => {
    useDatabase(new ManuscriptDB(`import-notes-${++n}`))
    await db.open()
  }

  it('turns a chapter comment into a note on the last scene of that chapter', async () => {
    await fresh()
    const book = parseBook(textToBlocks('========== Часть 1 ==========\nРаз.\n***\nДва.\nКомментарий к Часть 1\nСпасибо!\n========== Часть 2 ==========\nТри.'))
    await importChapters('p', book.chapters)
    const notes = await db.notes.toArray()
    expect(notes).toHaveLength(1)
    const scene = (await db.scenes.toArray()).find((s) => s.excerpt === 'Два.')!
    expect(notes[0]).toMatchObject({
      projectId: 'p',
      sceneId: scene.id,
      kind: 'note',
      archived: false,
      text: 'Комментарий к части «Часть 1»:\nСпасибо!',
    })
    // the comment is not in the scene text
    expect(JSON.stringify(await db.texts.toArray())).not.toContain('Спасибо')
  })

  it('keeps the preface as a note when the project already has a description', async () => {
    await fresh()
    await db.projects.put({ id: 'p', title: 'Книга', description: 'Моё описание', updatedAt: 1 } as never)
    const book = parseBook(textToBlocks('Название\nФэндом: ГП\nГлава 1\nТекст.'))
    await importBook('p', book)
    expect((await db.projects.get('p'))!.description).toBe('Моё описание')
    const notes = await db.notes.toArray()
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ projectId: 'p', kind: 'note', text: 'Шапка из файла:\nНазвание\nФэндом: ГП' })
    expect(notes[0].sceneId).toBeUndefined()
  })
})
