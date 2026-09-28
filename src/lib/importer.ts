import { docWordCount, type PMNode } from './text'

/** A styled run of text inside a paragraph. */
export interface Run {
  text: string
  italic?: boolean
  bold?: boolean
  strike?: boolean
}

export type Block = { kind: 'heading'; text: string } | { kind: 'para'; runs: Run[] } | { kind: 'break' }

export interface ImportedScene {
  title: string
  doc: PMNode
  wordCount: number
  /** The opening of the text, shown on cards instead of a made-up title. */
  excerpt: string
  /** A song/quote line opening the scene, like "AC/DC — Wild Reputation". */
  epigraph?: string
}
export interface ImportedChapter {
  title: string
  scenes: ImportedScene[]
}

const NUMBERED_RE =
  /^\s*(глава|часть|chapter|part)\s*[№#]?\s*(\d+|[IVXLCDM]+(?![a-z])|(перв|втор|трет|четв[её]рт|пят|шест|седьм|восьм|девят|десят|одиннадцат|двенадцат|one|two|three|four|five|six|seven|eight|nine|ten)[\p{L}]*)/iu
const NAMED_RE = /^\s*(пролог|эпилог|интерлюдия|prologue|epilogue|interlude)(?![\p{L}])/iu
const SCENE_BREAK_RE = /^[\s*•·~#—–_=-]+$/

export const isChapterTitle = (s: string) =>
  s.trim().length > 0 && s.trim().length < 100 && (NUMBERED_RE.test(s) || NAMED_RE.test(s))
const DECOR = '[\\s=*#~_—–-]'
const DECORATED_RE = new RegExp(`^${DECOR}{2,}(.+?)${DECOR}{2,}$`)

/**
 * A chapter heading, possibly framed by decoration like "===== Часть 2 =====" (Ficbook .txt export).
 * Returns the clean title, or null. Unframed lines must look like a heading on their own,
 * so a line of dialogue such as "— Часть 2 плана…" is never mistaken for one.
 */
export function chapterTitleOf(line: string): string | null {
  const t = line.trim()
  const framed = t.match(DECORATED_RE)?.[1]?.trim()
  if (framed && isChapterTitle(framed)) return framed
  return isChapterTitle(t) ? t : null
}

export const isSceneBreak = (s: string) => s.trim().length > 0 && SCENE_BREAK_RE.test(s)

/** Plain text (txt / pasted from Google Docs or Ficbook) → blocks. */
export function textToBlocks(raw: string): Block[] {
  // Ficbook uses <i>/<b>/<s> tags in its editor — keep them as formatting.
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (isSceneBreak(t) || /^<center>\s*[*•—-]/i.test(t)) blocks.push({ kind: 'break' })
    else if (chapterTitleOf(t)) blocks.push({ kind: 'heading', text: chapterTitleOf(t)! })
    else blocks.push({ kind: 'para', runs: parseTaggedRuns(t) })
  }
  return blocks
}

/** Parse `<i>`, `<b>`, `<s>` tags (Ficbook markup) into runs; unknown tags are dropped. */
export function parseTaggedRuns(line: string): Run[] {
  const runs: Run[] = []
  const state = { italic: false, bold: false, strike: false }
  const re = /<(\/?)(i|em|b|strong|s|strike)>|<\/?[a-z]+[^>]*>/gi
  let last = 0
  let m: RegExpExecArray | null
  const push = (text: string) => {
    if (!text) return
    const run: Run = { text: decodeEntities(text) }
    if (state.italic) run.italic = true
    if (state.bold) run.bold = true
    if (state.strike) run.strike = true
    runs.push(run)
  }
  while ((m = re.exec(line))) {
    push(line.slice(last, m.index))
    last = m.index + m[0].length
    if (!m[2]) continue
    const on = m[1] !== '/'
    const tag = m[2].toLowerCase()
    if (tag === 'i' || tag === 'em') state.italic = on
    else if (tag === 'b' || tag === 'strong') state.bold = on
    else state.strike = on
  }
  push(line.slice(last))
  return runs.length ? runs : [{ text: '' }]
}

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** HTML (from mammoth / clipboard) → blocks. Browser only (uses DOMParser). */
export function htmlToBlocks(html: string): Block[] {
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const blocks: Block[] = []
  const collectRuns = (node: Node, fmt: Omit<Run, 'text'>, out: Run[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) out.push({ text, ...fmt })
      return
    }
    if (!(node instanceof Element)) return
    const tag = node.tagName.toLowerCase()
    const next = { ...fmt }
    if (tag === 'i' || tag === 'em') next.italic = true
    if (tag === 'b' || tag === 'strong') next.bold = true
    if (tag === 's' || tag === 'strike' || tag === 'del') next.strike = true
    if (tag === 'br') {
      out.push({ text: '\n', ...fmt })
      return
    }
    node.childNodes.forEach((c) => collectRuns(c, next, out))
  }
  const visit = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) {
      const text = el.textContent?.trim() ?? ''
      if (text) blocks.push(isSceneBreak(text) ? { kind: 'break' } : { kind: 'heading', text })
      return
    }
    if (tag === 'p' || tag === 'li') {
      const runs: Run[] = []
      el.childNodes.forEach((c) => collectRuns(c, {}, runs))
      const text = runs.map((r) => r.text).join('').trim()
      if (!text) return
      if (isSceneBreak(text)) blocks.push({ kind: 'break' })
      else if (chapterTitleOf(text) && text.length < 80) blocks.push({ kind: 'heading', text: chapterTitleOf(text)! })
      else blocks.push({ kind: 'para', runs: mergeRuns(runs) })
      return
    }
    if (tag === 'hr') {
      blocks.push({ kind: 'break' })
      return
    }
    Array.from(el.children).forEach(visit)
  }
  Array.from(dom.body.children).forEach(visit)
  return blocks
}

function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const r of runs) {
    const prev = out[out.length - 1]
    if (prev && !!prev.italic === !!r.italic && !!prev.bold === !!r.bold && !!prev.strike === !!r.strike) {
      prev.text += r.text
    } else out.push({ ...r })
  }
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, '')
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '')
  }
  return out.filter((r) => r.text)
}

function runsToInline(runs: Run[]): PMNode[] {
  const nodes: PMNode[] = []
  for (const r of runs) {
    const parts = r.text.split('\n')
    parts.forEach((part, i) => {
      if (i > 0) nodes.push({ type: 'hardBreak' })
      if (!part) return
      const marks = [
        ...(r.bold ? [{ type: 'bold' }] : []),
        ...(r.italic ? [{ type: 'italic' }] : []),
        ...(r.strike ? [{ type: 'strike' }] : []),
      ]
      nodes.push(marks.length ? { type: 'text', text: part, marks } : { type: 'text', text: part })
    })
  }
  return nodes
}

/**
 * Split blocks into chapters (by chapter-like headings) and scenes (by `* * *` breaks).
 * Text before the first heading becomes its own chapter so nothing is lost.
 */
export function blocksToChapters(blocks: Block[], fallbackTitle = 'Начало (до первой главы)'): ImportedChapter[] {
  const chapters: ImportedChapter[] = []
  let chapter: ImportedChapter | null = null
  let paras: Run[][] = []

  const flushScene = () => {
    if (!paras.length) return
    if (!chapter) {
      chapter = { title: fallbackTitle, scenes: [] }
      chapters.push(chapter)
    }
    const doc: PMNode = {
      type: 'doc',
      content: paras.map((runs) => {
        const inline = runsToInline(runs)
        return inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' }
      }),
    }
    const plain = paras.map((runs) => runs.map((r) => r.text).join('').trim())
    const epigraph = isEpigraph(plain[0]) ? plain[0] : undefined
    const excerpt = makeExcerpt(plain.slice(epigraph ? 1 : 0))
    // The editor's own counter, so the first edit of an imported scene does not look like lost words.
    const words = docWordCount(doc)
    chapter.scenes.push({ title: '', doc, wordCount: words, excerpt, epigraph })
    paras = []
  }

  for (const b of blocks) {
    if (b.kind === 'heading') {
      flushScene()
      chapter = { title: b.text, scenes: [] }
      chapters.push(chapter)
    } else if (b.kind === 'break') {
      flushScene()
    } else {
      paras.push(b.runs)
    }
  }
  flushScene()
  return chapters.filter((c) => c.scenes.length > 0 || chapters.length === 1)
}

export async function readFileAsBlocks(file: File): Promise<Block[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
    return htmlToBlocks(value)
  }
  if (name.endsWith('.html') || name.endsWith('.htm')) return htmlToBlocks(await file.text())
  return textToBlocks(await file.text())
}

export interface ImportedBook {
  /** Book title guessed from the file header, if there is one. */
  title?: string
  /** Everything before the first chapter heading (title, fandom, summary…), as plain text. */
  preface: string
  chapters: ImportedChapter[]
}

/**
 * Like blocksToChapters, but text before the first chapter heading is treated as the book's
 * header, not as a chapter — as long as the file has chapter headings at all.
 */
export function parseBook(blocks: Block[]): ImportedBook {
  const first = blocks.findIndex((b) => b.kind === 'heading')
  if (first <= 0) return { preface: '', chapters: blocksToChapters(blocks) }
  const head = blocks
    .slice(0, first)
    .filter((b): b is Extract<Block, { kind: 'para' }> => b.kind === 'para')
    .map((b) => b.runs.map((r) => r.text).join('').trim())
    .filter(Boolean)
  const title = head[0] && head[0].length <= 80 ? head[0] : undefined
  return { title, preface: head.join('\n'), chapters: blocksToChapters(blocks.slice(first)) }
}

/**
 * "Artist — Song" style line: short, two sides around a dash, no sentence punctuation.
 * Dialogue ("— Реплика") never matches because it starts with the dash.
 */
export function isEpigraph(line: string | undefined): boolean {
  if (!line) return false
  const t = line.trim()
  if (t.length > 70 || /^[—–-]/.test(t) || /[.!?…,:;]$/.test(t)) return false
  const m = t.match(/^(.{1,35}?)\s*[—–-]\s*(.{1,40})$/)
  if (!m) return false
  return m[1].split(/\s+/).length <= 5 && m[2].split(/\s+/).length <= 7
}

/** First ~140 characters of the scene, cut at a word boundary. */
export function makeExcerpt(paragraphs: string[]): string {
  const text = paragraphs.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return text.length > 140 ? text.slice(0, 140).replace(/\s+\S*$/, '') + '…' : text
}
