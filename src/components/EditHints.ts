import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { checkBlocks, type Hint } from '../lib/editcheck'

export const editHintsKey = new PluginKey<{ on: boolean; set: DecorationSet; hints: Hint[] }>('editHints')

const TITLES = {
  repeat: 'Повтор: это слово уже было совсем рядом',
  long: 'Длинное предложение — может, разделить?',
  filler: 'Слово, которое часто можно убрать',
}

function compute(doc: PMNode) {
  const blocks: { text: string; base: number }[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Leaf nodes become one character, so offsets in the string match document positions.
    blocks.push({ text: node.textBetween(0, node.content.size, undefined, '￼'), base: pos + 1 })
    return false
  })
  const hints = checkBlocks(blocks)
  const set = DecorationSet.create(
    doc,
    hints.map((h) => Decoration.inline(h.from, h.to, { class: `eh eh-${h.kind}`, title: TITLES[h.kind] })),
  )
  return { hints, set }
}

/** «Править» mode helper: underlines repeats, fillers and long sentences. Off unless switched on. */
export const EditHints = Extension.create({
  name: 'editHints',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: editHintsKey,
        state: {
          init: () => ({ on: false, set: DecorationSet.empty, hints: [] as Hint[] }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(editHintsKey) as boolean | undefined
            const on = meta ?? prev.on
            if (!on) return { on, set: DecorationSet.empty, hints: [] }
            if (meta === undefined && !tr.docChanged) return prev
            return { on, ...compute(state.doc) }
          },
        },
        props: {
          decorations: (state) => editHintsKey.getState(state)?.set,
        },
      }),
    ]
  },
})
