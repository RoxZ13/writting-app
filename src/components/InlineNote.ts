import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { uid } from '../db/db'

const WORD = /[\p{L}\p{N}'’-]/u

/** The last word of a paragraph's text before `end`, as offsets inside the paragraph. */
function lastWord(text: string, end: number): [number, number] | null {
  let b = end
  while (b > 0 && !WORD.test(text[b - 1])) b--
  let a = b
  while (a > 0 && WORD.test(text[a - 1])) a--
  return a < b ? [a, b] : null
}

const flat = (node: PMNode) => node.textBetween(0, node.content.size, undefined, '￼')

/**
 * A note typed right into the text: «…кольцо в кармане // проверить цвет глаз» + Enter.
 * The part after // leaves the text and becomes a margin note on the word just before it
 * (or on the last word of the previous paragraph, when the whole line was the note).
 * Needs a space or the line start before //, so web links stay untouched.
 */
export const InlineNote = Extension.create<{ onNote: (id: string, text: string) => void }>({
  name: 'inlineNote',
  // Before the default Enter, which would split the paragraph.
  priority: 1000,
  addOptions() {
    return { onNote: () => {} }
  },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor
        const { $from, empty } = state.selection
        const para = $from.parent
        if (!empty || para.type.name !== 'paragraph' || $from.parentOffset !== para.content.size) return false
        const text = flat(para)
        const m = /(^|\s)\/\/\s*(\S.*?)\s*$/su.exec(text)
        if (!m) return false
        const note = m[2]
        let cut = m.index + m[1].length
        while (cut > 0 && /\s/.test(text[cut - 1])) cut--
        const start = $from.start()
        const commentType = state.schema.marks.comment
        const id = uid()
        const tr = state.tr.delete(start + cut, start + text.length)

        let anchor: [number, number] | null = null
        const own = lastWord(text, cut)
        if (own) anchor = [start + own[0], start + own[1]]
        else {
          // The whole line was the note: attach it to the end of the paragraph before.
          tr.doc.nodesBetween(0, start - 1, (node, pos) => {
            if (!node.isTextblock) return true
            const t = flat(node)
            const w = lastWord(t, t.length)
            if (w) anchor = [pos + 1 + w[0], pos + 1 + w[1]]
            return false
          })
        }
        if (anchor && commentType) tr.addMark(anchor[0], anchor[1], commentType.create({ id }))
        editor.view.dispatch(tr)
        this.options.onNote(id, note)
        return true
      },
    }
  },
})
