// Import check on a real manuscript. Runs only when MANUSCRIPT_REAL_BOOK points to a Ficbook .txt export.
// The manuscript itself never goes into the repository.
import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { textToBlocks, parseBook, chapterTitleOf, isSceneBreak } from '../lib/importer'
import { docParagraphs, docWordCount } from '../lib/text'

const path = process.env.MANUSCRIPT_REAL_BOOK
const run = path && existsSync(path) ? describe : describe.skip

run('real manuscript import', () => {
  const raw = path ? readFileSync(path, 'utf8') : ''
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
  const book = parseBook(textToBlocks(raw))
  const scenes = book.chapters.flatMap((c) => c.scenes)
  const outParas = scenes.flatMap((s) => docParagraphs(s.doc))

  it('reports the shape', () => {
    const framed = lines.filter((l) => /^=+ .+ =+$/.test(l))
    const headingLines = lines.filter((l) => chapterTitleOf(l))
    const unframedHeadings = headingLines.filter((l) => !/^=+ .+ =+$/.test(l))
    const breaks = lines.filter((l) => isSceneBreak(l))
    const zwspOnly = lines.filter((l) => l.replace(/[​-‍﻿]/g, '').trim() === '')
    const zwspAny = lines.filter((l) => /[​-‍﻿]/.test(l))
    console.log(JSON.stringify({
      lines: lines.length,
      framedHeadings: framed.length,
      chapters: book.chapters.length,
      chapterTitles: book.chapters.map((c) => `${c.title} (${c.scenes.length})`),
      scenes: scenes.length,
      unframedHeadings,
      breakLines: [...new Set(breaks)],
      zwspOnlyLines: zwspOnly.length,
      zwspLines: zwspAny.length,
      epigraphs: scenes.filter((s) => s.epigraph).length,
      words: scenes.reduce((n, s) => n + s.wordCount, 0),
      maxSceneWords: Math.max(...scenes.map((s) => s.wordCount)),
      prefaceChars: book.preface.length,
    }, null, 1))
  })

  it('keeps every body line', () => {
    const first = lines.findIndex((l) => chapterTitleOf(l))
    const body = lines.slice(first).filter((l) => !chapterTitleOf(l) && !isSceneBreak(l))
    const entities: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', '#39': "'" }
    const strip = (s: string) =>
      s.replace(/<\/?[a-z][^>]*>/gi, '').replace(/&(quot|amp|lt|gt|nbsp|#39);/g, (_, e) => entities[e])
        .replace(/\s+/g, ' ').trim()
    const want = body.map(strip).filter(Boolean)
    const got = outParas.map(strip).filter(Boolean)
    const missing = want.filter((l, i) => got[i] !== l).slice(0, 5)
    expect({ count: got.length, missing }).toEqual({ count: want.length, missing: [] })
  })

  it('word count matches the editor counter', () => {
    const recount = scenes.reduce((n, s) => n + docWordCount(s.doc), 0)
    expect(recount).toBe(scenes.reduce((n, s) => n + s.wordCount, 0))
  })
})
