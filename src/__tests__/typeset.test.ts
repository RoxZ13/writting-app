// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Typography, typesetDoc } from '../components/Typography'

const make = (html: string) => new Editor({ extensions: [StarterKit, Typography], content: html })

/** Types like a person: one character at a time, through the editor's input rules. */
function typeIn(editor: Editor, text: string) {
  const { view } = editor
  for (const ch of text) {
    const { from, to } = view.state.selection
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to))
  }
}

describe('typing shortcuts', () => {
  const typed = (text: string) => {
    const editor = make('<p></p>')
    editor.commands.focus('end')
    typeIn(editor, text)
    return editor.getText()
  }
  it('makes dialogue dashes, dashes and the ellipsis', () => {
    expect(typed('- Нет, - сказал он...')).toBe('— Нет, — сказал он…')
    expect(typed('Да -- нет --- может')).toBe('Да — нет — может')
  })
  it('opens and closes quotes, nested ones too', () => {
    expect(typed('Он сказал "книга "Мастер" лежит".')).toBe('Он сказал «книга „Мастер“ лежит».')
    expect(typed('<<Да>>')).toBe('«Да»')
  })
  it('keeps hyphens inside words', () => {
    expect(typed('кто-то где-нибудь')).toBe('кто-то где-нибудь')
  })
})

describe('typeset a scene', () => {
  it('fixes dashes and quotes across italic pieces in one undo step', () => {
    const editor = make('<p>- Он сказал "<em>привет</em>" - и ушёл...</p><p>Всё "хорошо".</p>')
    const n = typesetDoc(editor.state, (tr) => editor.view.dispatch(tr))
    expect(n).toBe(2)
    expect(editor.getHTML()).toBe('<p>— Он сказал «<em>привет</em>» — и ушёл…</p><p>Всё «хорошо».</p>')
    editor.commands.undo()
    expect(editor.getText()).toContain('- Он сказал "привет"')
  })

  it('does nothing to a typeset scene', () => {
    const editor = make('<p>— «Да», — сказал он.</p>')
    expect(typesetDoc(editor.state, (tr) => editor.view.dispatch(tr))).toBe(0)
  })
})
