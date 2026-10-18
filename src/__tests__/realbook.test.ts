// Import check on a real manuscript. Runs only when MANUSCRIPT_REAL_BOOK points to a Ficbook .txt export.
// The manuscript itself never goes into the repository.
import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { textToBlocks, parseBook, chapterTitleOf, isSceneBreak } from '../lib/importer'
import { docParagraphs, docWordCount } from '../lib/text'

// Zero-width space, joiners and BOM: Ficbook exports carry them.
const ZW_RANGE = new RegExp(`[${String.fromCharCode(0x200b)}-${String.fromCharCode(0x200d)}${String.fromCharCode(0xfeff)}]`, 'g')
const ZW_ONE = new RegExp(ZW_RANGE.source)
const INVISIBLE = new RegExp(`[${String.fromCharCode(0x200b, 0xfeff)}]`, 'g')

const path = process.env.MANUSCRIPT_REAL_BOOK
const run = path && existsSync(path) ? describe : describe.skip

run('real manuscript import', () => {
  const raw = path ? readFileSync(path, 'utf8') : ''
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
  const book = parseBook(textToBlocks(raw))
  const scenes = book.chapters.flatMap((c) => c.scenes)

  it('reports the shape', () => {
    const framed = lines.filter((l) => /^=+ .+ =+$/.test(l))
    const headingLines = lines.filter((l) => chapterTitleOf(l))
    const unframedHeadings = headingLines.filter((l) => !/^=+ .+ =+$/.test(l))
    const breaks = lines.filter((l) => isSceneBreak(l))
    const zwspOnly = lines.filter((l) => l.replace(ZW_RANGE, '').trim() === '')
    const zwspAny = lines.filter((l) => ZW_ONE.test(l))
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

  it('keeps every body line: as scene text or as the part comment', () => {
    const first = lines.findIndex((l) => chapterTitleOf(l))
    const body = lines.slice(first).filter((l) => !chapterTitleOf(l) && !isSceneBreak(l))
    const entities: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', '#39': "'" }
    const strip = (s: string) =>
      s.replace(/<\/?[a-z][^>]*>/gi, '').replace(/&(quot|amp|lt|gt|nbsp|#39);/g, (_, e) => entities[e])
        .replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()
    const want = body.map(strip).filter(Boolean)
    // In reading order: each part's scenes, then its comment (whose heading line the importer leaves out).
    const got = book.chapters
      .flatMap((c) => [
        ...c.scenes.flatMap((s) => docParagraphs(s.doc)),
        ...(c.comment ? [`Комментарий к ${c.title}`, ...c.comment.split('\n')] : []),
      ])
      .filter((l) => !isSceneBreak(l))
      .map(strip)
      .filter(Boolean)
    expect(book.chapters.filter((c) => c.comment).length).toBe(7)
    const missing = want.filter((l, i) => got[i] !== l).slice(0, 5)
    expect({ count: got.length, missing }).toEqual({ count: want.length, missing: [] })
  })

  it('word count matches the editor counter', () => {
    const recount = scenes.reduce((n, s) => n + docWordCount(s.doc), 0)
    expect(recount).toBe(scenes.reduce((n, s) => n + s.wordCount, 0))
  })
})
