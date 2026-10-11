import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { norm } from '../lib/search'

export interface Range {
  from: number
  to: number
}

/** Every place `query` occurs in the document, ignoring case and ё/е, also across italic and markers. */
export function findRanges(doc: PMNode, query: string): Range[] {
  const q = norm(query)
  if (!q) return []
  const out: Range[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    node.forEach((child) => (text += child.isText ? child.text : '￼'))
    const t = norm(text)
    for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + q.length)) out.push({ from: pos + 1 + i, to: pos + 1 + i + q.length })
    return false
  })
  return out
}

interface FindState {
  query: string
  current: number
  ranges: Range[]
}

export const findKey = new PluginKey<FindState>('mnFind')

/** Highlights for the find bar: every match softly, the current one brightly. */
export const FindHighlight = Extension.create({
  name: 'mnFind',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ query: '', current: 0, ranges: [] }),
          apply(tr, prev) {
            const meta = tr.getMeta(findKey) as Partial<FindState> | undefined
            if (!meta && !tr.docChanged) return prev
            const query = meta?.query ?? prev.query
            const ranges = query ? findRanges(tr.doc, query) : []
            const current = Math.min(meta?.current ?? prev.current, Math.max(0, ranges.length - 1))
            return { query, current, ranges }
          },
        },
        props: {
          decorations(state) {
            const st = findKey.getState(state)
            if (!st?.ranges.length) return null
            return DecorationSet.create(
              state.doc,
              st.ranges.map((r, i) => Decoration.inline(r.from, r.to, { class: i === st.current ? 'find-hit now' : 'find-hit' })),
            )
          },
        },
      }),
    ]
  },
})

export const setFind = (state: EditorState, meta: Partial<FindState>): Transaction => state.tr.setMeta(findKey, meta)
