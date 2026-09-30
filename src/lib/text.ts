/** Helpers for TipTap/ProseMirror JSON documents, usable without an editor instance. */

export interface PMNode {
  type: string
  text?: string
  content?: PMNode[]
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

export const emptyDoc = (): PMNode => ({ type: 'doc', content: [{ type: 'paragraph' }] })

export function paragraphsToDoc(paragraphs: string[]): PMNode {
  const content = paragraphs
    .map((p) => p.replace(/\s+$/g, ''))
    .filter((p) => p.trim().length > 0)
    .map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }))
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

/** Plain text of each block-level node, in order. */
export function docParagraphs(doc: unknown): string[] {
  const out: string[] = []
  const walk = (node: PMNode) => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      out.push(inlineText(node))
      return
    }
    node.content?.forEach(walk)
  }
  if (doc && typeof doc === 'object') walk(doc as PMNode)
  return out
}

function inlineText(node: PMNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(inlineText).join('')
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)
  return m ? m.length : 0
}

export function docWordCount(doc: unknown): number {
  return docParagraphs(doc).reduce((sum, p) => sum + countWords(p), 0)
}

/** The last non-empty paragraph(s) — shown on the "Continue" screen. */
export function lastParagraphs(doc: unknown, n = 2): string[] {
  return docParagraphs(doc)
    .filter((p) => p.trim())
    .slice(-n)
}

export const formatWords = (n: number) => {
  const mod10 = n % 10
  const mod100 = n % 100
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'слово'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'слова'
        : 'слов'
  return `${n.toLocaleString('ru-RU')} ${word}`
}

/** The last `n` sentences of a scene: enough to pick up the thread without scrolling. */
export function lastSentences(doc: unknown, n = 2): string {
  const paras = docParagraphs(doc)
    .map((p) => p.trim())
    .filter(Boolean)
  const out: string[] = []
  for (let i = paras.length - 1; i >= 0 && out.length < n; i--) {
    const parts = paras[i].match(/[^.!?…]+(?:[.!?…]+[»"”)]*|$)/gu) ?? [paras[i]]
    for (let j = parts.length - 1; j >= 0 && out.length < n; j--) {
      const s = parts[j].trim()
      if (s) out.unshift(s)
    }
  }
  return out.join(' ')
}

/** «1 сцена», «3 сцены», «12 сцен». */
export const formatScenes = (n: number) => {
  const m10 = n % 10
  const m100 = n % 100
  return `${n} ${m10 === 1 && m100 !== 11 ? 'сцена' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'сцены' : 'сцен'}`
}
