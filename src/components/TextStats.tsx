import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { formatChars, formatSheets, formatWords, textStats } from '../lib/text'

/**
 * The counter in the corner, as in iA Writer and Ulysses: words of the scene, or of the selection
 * while something is selected. A click opens the rest — characters, «авторские листы», reading time.
 */
export function TextStats({ editor, chapterWords, bookWords, today }: { editor: Editor | null; chapterWords: number; bookWords: number; today: number }) {
  const [open, setOpen] = useState(false)
  const [, rerender] = useState(0)
  useEffect(() => {
    if (!editor) return
    let t: ReturnType<typeof setTimeout> | undefined
    // Counting a long scene on every key is wasteful: a calm update once typing pauses for a moment.
    const update = () => {
      clearTimeout(t)
      t = setTimeout(() => rerender((n) => n + 1), 150)
    }
    editor.on('transaction', update)
    return () => {
      clearTimeout(t)
      editor.off('transaction', update)
    }
  }, [editor])
  if (!editor || editor.isEmpty) return null

  const { from, to, empty } = editor.state.selection
  const scene = textStats(editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n'))
  const sel = empty ? null : textStats(editor.state.doc.textBetween(from, to, '\n'))
  const label = sel && sel.words ? `выделено ${formatWords(sel.words)}` : formatWords(scene.words)

  return (
    <div className="text-stats">
      {open && (
        <>
          <div className="typo-back" onClick={() => setOpen(false)} />
          <div className="stats-pop card" role="dialog" aria-label="Статистика текста">
            {sel && sel.words > 0 && (
              <StatsBlock title="Выделено" rows={[formatWords(sel.words), formatChars(sel.chars)]} />
            )}
            <StatsBlock
              title="Сцена"
              rows={[formatWords(scene.words), `${formatChars(scene.chars)} с пробелами`, formatSheets(scene.sheets), `~${scene.minutes} мин чтения`]}
            />
            <StatsBlock title="Глава" rows={[formatWords(chapterWords)]} />
            <StatsBlock title="История" rows={[formatWords(bookWords)]} />
            <div className="stats-today">Сегодня +{today.toLocaleString('ru-RU')}</div>
          </div>
        </>
      )}
      <button className="stats-chip" onClick={() => setOpen(!open)} title="Знаки, авторские листы, время чтения">
        {label}
      </button>
    </div>
  )
}

function StatsBlock({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="stats-block">
      <div className="stats-title">{title}</div>
      {rows.map((r) => (
        <div key={r}>{r}</div>
      ))}
    </div>
  )
}
