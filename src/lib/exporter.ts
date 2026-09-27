import type { Chapter, Scene } from '../db/db'
import type { PMNode } from './text'

export interface ExportChapter {
  chapter: Chapter
  scenes: (Scene & { content: unknown })[]
}

type Mark = NonNullable<PMNode['marks']>[number]
const has = (marks: Mark[] | undefined, t: string) => !!marks?.some((m) => m.type === t)

function blocksOf(doc: unknown): PMNode[] {
  const out: PMNode[] = []
  const walk = (n: PMNode) => {
    if (n.type === 'paragraph' || n.type === 'heading') out.push(n)
    else n.content?.forEach(walk)
  }
  if (doc && typeof doc === 'object') walk(doc as PMNode)
  return out
}

// ---------------- Ficbook ----------------

/** One paragraph → Ficbook markup (`<i>`, `<b>`, `<s>`). */
export function paragraphToFicbook(p: PMNode): string {
  return (p.content ?? [])
    .map((n) => {
      if (n.type === 'hardBreak') return '\n'
      let t = n.text ?? ''
      if (!t) return ''
      if (has(n.marks, 'strike')) t = `<s>${t}</s>`
      if (has(n.marks, 'italic')) t = `<i>${t}</i>`
      if (has(n.marks, 'bold')) t = `<b>${t}</b>`
      return t
    })
    .join('')
    .replace(/<\/i><i>|<\/b><b>|<\/s><s>/g, '')
}

/** A chapter as Ficbook text: one line per paragraph, scenes separated by a centered `* * *`. */
export function chapterToFicbook({ scenes }: ExportChapter): string {
  return scenes
    .map((s) =>
      blocksOf(s.content)
        .map(paragraphToFicbook)
        .filter((l) => l.trim())
        .join('\n'),
    )
    .filter((s) => s.trim())
    .join('\n\n<center>* * *</center>\n\n')
}

// ---------------- DOCX ----------------

export async function exportDocx(projectTitle: string, chapters: ExportChapter[]): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx')

  const para = (p: PMNode) =>
    new Paragraph({
      spacing: { after: 120, line: 360 },
      indent: { firstLine: 567 },
      children: (p.content ?? []).map((n) =>
        n.type === 'hardBreak'
          ? new TextRun({ text: '', break: 1 })
          : new TextRun({
              text: n.text ?? '',
              italics: has(n.marks, 'italic'),
              bold: has(n.marks, 'bold'),
              strike: has(n.marks, 'strike'),
            }),
      ),
    })

  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun(projectTitle)] }),
  ]
  chapters.forEach(({ chapter, scenes }, ci) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: ci > 0,
        spacing: { before: 240, after: 240 },
        children: [new TextRun(chapter.title)],
      }),
    )
    scenes.forEach((s, si) => {
      if (si > 0) {
        children.push(
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [new TextRun('* * *')] }),
        )
      }
      blocksOf(s.content)
        .filter((p) => (p.content ?? []).length)
        .forEach((p) => children.push(para(p)))
    })
  })

  const doc = new Document({
    creator: 'Manuscript.',
    title: projectTitle,
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
    sections: [{ children }],
  })
  return Packer.toBlob(doc)
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
