import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import type { Project, Scene } from '../db/db'
import { budgetState, sceneBudget } from '../lib/budget'
import { lengthText } from '../lib/length'
import { formatChars, formatSheets, formatWords, textStats } from '../lib/text'

/**
 * The counter in the corner, as in iA Writer and Ulysses: words of the scene, or of the selection
 * while something is selected. A click opens the rest — characters, «авторские листы», reading time.
 * When the author has turned the scene budget on, a small ring before the label shows how much of it is used.
 */
export function TextStats({
  editor,
  chapterWords,
  bookWords,
  today,
  project,
  scene: current,
  chapterScenes,
  bookScenes,
}: {
  editor: Editor | null
  chapterWords: number
  bookWords: number
  today: number
  project: Project
  scene: Scene
  /** Alive scenes of this scene's chapter, or null for a scene that has no chapter yet. */
  chapterScenes: Scene[] | null
  bookScenes: Scene[]
}) {
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
  const selecting = !!(sel && sel.words)
  const label = selecting ? `выделено ${formatWords(sel!.words)}` : formatWords(scene.words)

  // The ring: this scene's text against its share of the chapter, only if the author asked for it.
  const sb = project.sceneBudget ? sceneBudget(project, chapterScenes, current.id, bookScenes) : null
  const bs = sb ? budgetState(scene.chars, sb.budget) : null
  const percent = bs ? Math.round(bs.ratio * 100) : 0
  const spent = bs && bs.state === 'over' && !selecting ? ` · +${lengthText(project, bs.over)}` : ''

  return (
    <div className={`text-stats${bs ? ' has-ring' : ''}`}>
      {open && (
        <>
          <div className="typo-back" onClick={() => setOpen(false)} />
          <div className="stats-pop card" role="dialog" aria-label="Статистика текста">
            {sel && sel.words > 0 && (
              <StatsBlock title="Выделено" rows={[formatWords(sel.words), formatChars(sel.chars)]} />
            )}
            <StatsBlock
              title="Сцена"
              rows={[
                formatWords(scene.words),
                `${formatChars(scene.chars)} с пробелами`,
                formatSheets(scene.sheets),
                `~${scene.minutes} мин чтения`,
                ...(sb ? [`бюджет: ${lengthText(project, scene.chars)} из ${lengthText(project, sb.budget)}`] : []),
              ]}
            />
            <StatsBlock title="Глава" rows={[formatWords(chapterWords)]} />
            <StatsBlock title="История" rows={[formatWords(bookWords)]} />
            <div className="stats-today">Сегодня +{today.toLocaleString('ru-RU')}</div>
          </div>
        </>
      )}
      <button
        className={`stats-chip${bs ? ` budget-${bs.state}` : ''}`}
        onClick={() => setOpen(!open)}
        title="Знаки, авторские листы, время чтения"
        aria-label={bs ? `${label}${spent}, бюджет сцены ${percent} %` : undefined}
      >
        {bs && <BudgetRing ratio={bs.ratio} />}
        {label}
        {spent}
      </button>
    </div>
  )
}

const RING_R = 5
const RING_C = 2 * Math.PI * RING_R

/** A 14 px ring that fills clockwise from the top; stays full once the budget is spent. */
function BudgetRing({ ratio }: { ratio: number }) {
  const fill = Math.min(1, Math.max(0, ratio)) * RING_C
  return (
    <svg className="budget-ring" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" focusable="false">
      <circle className="ring-track" cx="7" cy="7" r={RING_R} fill="none" strokeWidth="2" />
      <circle className="ring-fill" cx="7" cy="7" r={RING_R} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${fill} ${RING_C}`} transform="rotate(-90 7 7)" />
    </svg>
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
