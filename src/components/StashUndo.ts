import { Extension } from '@tiptap/core'
import { getStashMemory, revertStash, STASH_STORAGE, type StashMemory } from '../lib/stash'

/**
 * Ctrl/⌘+Z right after «В запас» brings the text back and drops the note with it, so nothing is
 * duplicated. Any other edit forgets the stash: from then on Ctrl+Z is the ordinary undo.
 */
export const StashUndo = Extension.create<object, { last: StashMemory | null }>({
  name: STASH_STORAGE,
  // Before the history extension's own Mod-z.
  priority: 1000,
  addStorage() {
    return { last: null }
  },
  onTransaction({ transaction }) {
    const last = this.storage.last
    if (!last || !transaction.docChanged) return
    last.docAfter = null
    last.from = transaction.mapping.map(last.from)
  },
  addKeyboardShortcuts() {
    return {
      'Mod-z': ({ editor }) => {
        const last = getStashMemory(editor)
        if (!last?.docAfter || !editor.state.doc.eq(last.docAfter)) return false
        void revertStash(editor, last)
        return true
      },
    }
  },
})
