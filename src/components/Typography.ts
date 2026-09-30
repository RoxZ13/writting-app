import { Extension, InputRule } from '@tiptap/core'

/**
 * Typing shortcuts for Russian prose, so formatting never needs the mouse:
 *   ---  → —        (длинное тире)
 *   - at the start of a paragraph → «— » (реплика в диалоге)
 *   ...  → …
 *   "    → « or », depending on what comes before
 * Bold and italic come from the editor itself: **жирный**, *курсив*.
 */
const replace = (find: RegExp, text: (m: RegExpMatchArray) => string) =>
  new InputRule({
    find,
    handler: ({ state, range, match }) => {
      state.tr.insertText(text(match), range.from, range.to)
    },
  })

export const Typography = Extension.create({
  name: 'mnTypography',
  addInputRules() {
    return [
      replace(/---$/, () => '—'),
      replace(/^- $/, () => '— '),
      replace(/\.\.\.$/, () => '…'),
      // An opening quote after the start of a line, a space or an opening bracket/dash; a closing one otherwise.
      replace(/(^|[\s([«—-])"$/, (m) => `${m[1]}«`),
      replace(/([^\s([«—-])"$/, (m) => `${m[1]}»`),
    ]
  },
  addKeyboardShortcuts() {
    // Right after a replacement, undo gives back what was typed (--- instead of —); otherwise a normal undo.
    return { 'Mod-z': () => this.editor.commands.undoInputRule() }
  },
})
