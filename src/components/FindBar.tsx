import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { findKey, setFind } from './FindHighlight'
import { toast } from '../lib/ui'
import { Icon } from './Icon'

/**
 * Find and replace in the open scene, as in Google Docs: every match lit, the current one brighter,
 * Enter — next, Shift+Enter — back, Esc — back to the text right at the match.
 */
export function FindBar({
  editor,
  replace: replaceOpen,
  onClose,
  onBookSearch,
}: {
  editor: Editor
  replace: boolean
  onClose: () => void
  onBookSearch: (query: string) => void
}) {
  const [query, setQuery] = useState(() => selectedWord(editor))
  const [withReplace, setWithReplace] = useState(replaceOpen)
  const [replacement, setReplacement] = useState('')
  const [, rerender] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => setWithReplace((w) => w || replaceOpen), [replaceOpen])
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [replaceOpen])

  // The counter follows the text: typing elsewhere or a replacement changes the matches.
  useEffect(() => {
    const update = () => rerender((n) => n + 1)
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
      if (!editor.isDestroyed) editor.view.dispatch(setFind(editor.state, { query: '', current: 0 }))
    }
  }, [editor])

  // A new query starts from the match nearest after the cursor.
  useEffect(() => {
    const from = editor.state.selection.from
    editor.view.dispatch(setFind(editor.state, { query, current: 0 }))
    const st = findKey.getState(editor.state)!
    const near = st.ranges.findIndex((r) => r.from >= from)
    show(near === -1 ? 0 : near)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Esc closes the bar wherever the focus is: in the text, on a toast, in the bar itself.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.modal-back')) return
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
      editor.commands.focus()
    }
    window.addEventListener('keydown', onEsc, true)
    return () => window.removeEventListener('keydown', onEsc, true)
  }, [editor, onClose])

  const st = findKey.getState(editor.state)
  const total = st?.ranges.length ?? 0
  const current = st?.current ?? 0

  function show(i: number) {
    const s = findKey.getState(editor.state)!
    if (!s.ranges.length) return
    const n = (i + s.ranges.length) % s.ranges.length
    editor.view.dispatch(setFind(editor.state, { current: n }))
    const r = s.ranges[n]
    editor.chain().setTextSelection(r).scrollIntoView().run()
  }

  const close = () => {
    onClose()
    editor.commands.focus()
  }

  const replaceOne = () => {
    const r = st?.ranges[current]
    if (!r) return
    editor.view.dispatch(editor.state.tr.insertText(replacement, r.from, r.to))
    // Next match after the replaced text, so «кот» → «котик» does not find itself again.
    const after = findKey.getState(editor.state)!.ranges.findIndex((x) => x.from >= r.from + replacement.length)
    show(after === -1 ? 0 : after)
  }

  const replaceAll = () => {
    if (!st?.ranges.length) return
    const tr = editor.state.tr
    for (const r of [...st.ranges].reverse()) tr.insertText(replacement, r.from, r.to)
    editor.view.dispatch(tr)
    toast(`Заменено: ${st.ranges.length}`, () => editor.commands.undo())
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.target === input.current) {
      e.preventDefault()
      show(current + (e.shiftKey ? -1 : 1))
    }
  }

  return (
    <div className="findbar" role="search" onKeyDown={onKey}>
      <div className="find-row">
        <input
          ref={input}
          className="find-input"
          value={query}
          placeholder="Найти в сцене"
          aria-label="Найти в сцене"
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="find-count" aria-live="polite">
          {query.trim() ? (total ? `${current + 1} из ${total}` : 'нет') : ''}
        </span>
        <button className="icon-btn" disabled={!total} onClick={() => show(current - 1)} aria-label="Предыдущее" title="Предыдущее · Shift+Enter">
          ↑
        </button>
        <button className="icon-btn" disabled={!total} onClick={() => show(current + 1)} aria-label="Следующее" title="Следующее · Enter">
          ↓
        </button>
        <button className={`chip-toggle sm ${withReplace ? 'on' : ''}`} onClick={() => setWithReplace(!withReplace)}>
          Заменить
        </button>
        <button className="icon-btn" onClick={close} aria-label="Закрыть поиск" title="Закрыть · Esc">
          <Icon name="close" size={15} />
        </button>
      </div>
      {withReplace && (
        <div className="find-row">
          <input
            className="find-input"
            value={replacement}
            placeholder="Заменить на"
            aria-label="Заменить на"
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), replaceOne())}
          />
          <button className="btn sm" disabled={!total} onClick={replaceOne}>
            Заменить
          </button>
          <button className="btn sm" disabled={!total} onClick={replaceAll}>
            Все
          </button>
        </div>
      )}
      {query.trim().length > 1 && (
        <button className="link find-book" onClick={() => onBookSearch(query)}>
          Искать во всей истории →
        </button>
      )}
    </div>
  )
}

/** A short selection becomes the query, as in every editor. */
function selectedWord(editor: Editor) {
  const { from, to } = editor.state.selection
  const text = editor.state.doc.textBetween(from, to, ' ')
  return text.length <= 60 && !text.includes('\n') ? text : ''
}
