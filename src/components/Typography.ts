import { Extension, InputRule } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { quoteDepth, quoteOpens, typografPieces } from '../lib/typograf'

/**
 * Typing shortcuts for Russian prose, so formatting never needs the mouse:
 *   - at the start of a paragraph → «— » (реплика в диалоге)
 *   слово - слово, -- or ---    → —
 *   ...                         → …
 *   " or << >>                  → «ёлочки», inside them „лапки“
 * Pasted text is typeset the same way. Bold and italic come from the editor itself: **жирный**, *курсив*.
 */
const replace = (find: RegExp, text: (m: RegExpMatchArray) => string) =>
  new InputRule({
    find,
    handler: ({ state, range, match }) => {
      state.tr.insertText(text(match), range.from, range.to)
    },
  })

/** A straight quote: opening or closing, «» or „“ — depending on what is already open in the paragraph. */
const quote = new InputRule({
  find: /"$/,
  handler: ({ state, range }) => {
    const $from = state.doc.resolve(range.from)
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
    const depth = quoteDepth(before)
    const opens = quoteOpens(before)
    const ch = opens ? (depth === 0 ? '«' : '„') : depth <= 1 ? '»' : '“'
    state.tr.insertText(ch, range.from, range.to)
  },
})

export const Typography = Extension.create({
  name: 'mnTypography',
  addInputRules() {
    return [
      replace(/^(?:-{1,3}|—-) $/, () => '— '),
      replace(/(\S) - $/, (m) => `${m[1]} — `),
      replace(/—-$/, () => '—'),
      replace(/--$/, () => '—'),
      replace(/\.\.\.$/, () => '…'),
      replace(/<<$/, () => '«'),
      replace(/>>$/, () => '»'),
      quote,
    ]
  },
  addKeyboardShortcuts() {
    // Right after a replacement, undo gives back what was typed (--- instead of —); otherwise a normal undo.
    return { 'Mod-z': () => this.editor.commands.undoInputRule() }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('mnTypographPaste'),
        props: {
          // Text pasted from Word, a chat or a site comes in with "straight" quotes and hyphens — typeset it on the way in.
          transformPasted: (slice) => new Slice(typesetFragment(slice.content), slice.openStart, slice.openEnd),
        },
      }),
    ]
  },
})

function typesetFragment(fragment: Fragment): Fragment {
  const nodes: PMNode[] = []
  fragment.forEach((node) => {
    if (node.isTextblock) {
      const texts: string[] = []
      node.forEach((child) => child.isText && texts.push(child.text!))
      const fixed = typografPieces(texts)
      let i = 0
      const children: PMNode[] = []
      node.forEach((child) => children.push(child.isText ? node.type.schema.text(fixed[i++] || ' ', child.marks) : child))
      nodes.push(node.copy(Fragment.fromArray(children)))
    } else if (node.childCount) nodes.push(node.copy(typesetFragment(node.content)))
    else nodes.push(node)
  })
  return Fragment.fromArray(nodes)
}

/**
 * «Причесать текст»: the whole scene typeset in one step (one undo brings it back).
 * Returns how many paragraphs changed; 0 means nothing was dispatched.
 */
export function typesetDoc(state: EditorState, dispatch: (tr: Transaction) => void): number {
  const tr = state.tr
  let changed = 0
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const pieces: { from: number; text: string; marks: PMNode['marks'] }[] = []
    node.forEach((child, offset) => {
      if (child.isText) pieces.push({ from: pos + 1 + offset, text: child.text!, marks: child.marks })
    })
    const fixed = typografPieces(pieces.map((p) => p.text))
    let touched = false
    // Back to front, so earlier positions stay valid.
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i]
      if (fixed[i] === p.text || !fixed[i]) continue
      touched = true
      tr.replaceWith(tr.mapping.map(p.from), tr.mapping.map(p.from + p.text.length), state.schema.text(fixed[i], p.marks))
    }
    if (touched) changed++
    return false
  })
  if (changed) dispatch(tr)
  return changed
}
