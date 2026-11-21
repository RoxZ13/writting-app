import { useEffect, useRef, useState } from 'react'
import type { Chapter, Project, Scene } from '../db/db'
import { patch } from '../db/repo'
import { platformOf } from '../lib/platforms'
import { formatChars, formatWords } from '../lib/text'
import { Modal } from '../lib/ui'
import { bookWritingProgress, chapterVolumeNote, chapterWritingProgress, showManuscriptVolume } from '../lib/writing-progress'

const number = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
const sheets = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
const amount = (chars: number, target?: number) => target ? `${number(chars)} из ${formatChars(target)}` : formatChars(chars)

export function VolumeCounter({ project, chapter, scene, scenes, bookScenes, chapters, liveChars, wholeChapter, open, setOpen, hidden }: {
  project: Project; chapter?: Chapter; scene: Scene; scenes: Scene[]; bookScenes: Scene[]; chapters: Chapter[]
  liveChars: number; wholeChapter: boolean; open: boolean; setOpen: (open: boolean) => void; hidden: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [goals, setGoals] = useState(false)
  const enabled = showManuscriptVolume(project, chapters)
  const progress = chapterWritingProgress(project, scenes, { sceneId: scene.id, chars: liveChars }, chapter)
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
  useEffect(() => {
    if (!open || goals) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus({ preventScroll: true })
      }
    }
    const dispose = () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return dispose
  }, [open, goals, setOpen])

  if (hidden || (!enabled && !open && !goals)) return null
  const book = open ? bookWritingProgress(project, chapters, bookScenes.map((item) => item.id === scene.id ? { ...item, charCount: liveChars } : item)) : undefined
  const firstCount = chapter ? progress.chars : liveChars
  const chapterAmount = amount(firstCount, chapter ? progress.target : undefined)
  return (
    <div className="volume-counter" ref={root}>
      {enabled && <button ref={trigger} type="button" className="volume-trigger" onClick={() => setOpen(!open)} aria-label={`Объём текста: ${chapterAmount}`} aria-expanded={open} aria-haspopup="dialog">
        {chapterAmount}
      </button>}
      {open && book && <section className="card volume-popover" role="dialog" aria-label="Объём текста">
        <header><strong>Объём текста</strong><button className="icon-btn" aria-label="Закрыть" onClick={close}>×</button></header>
        <dl>
          <dt>{chapter ? 'Текущая глава' : 'Текущая сцена'}</dt><dd>{chapterAmount}</dd>
          {chapter && progress.min !== undefined && <><dt>Ориентир главы</dt><dd>{progress.max ? `${number(progress.min)}–${formatChars(progress.max)}` : `от ${formatChars(progress.min)}`}</dd></>}
          <dt>Вся рукопись</dt><dd>{amount(book.chars, book.target)}</dd>
          {book.target && <><dt>{book.chars > book.target ? 'Сверх плана' : 'Осталось по плану'}</dt><dd>{amount(Math.abs(book.target - book.chars))}</dd></>}
          <dt>Авторские листы</dt><dd>{sheets(book.sheets)}{book.targetSheets !== undefined ? ` из ${sheets(book.targetSheets)}` : ''}</dd>
        </dl>
        <div className="row volume-actions">
          <button className="btn sm ghost" onClick={() => setGoals(true)}>Цели</button>
          {chapter && <button className="btn sm ghost" onClick={() => void patch<Scene>('scenes', scene.id, { status: scene.status === 'done' ? (liveChars ? 'written' : 'draft') : 'done' })}>
            {scene.status === 'done' ? `Вернуть ${wholeChapter ? 'главу' : 'сцену'} в работу` : `Отметить ${wholeChapter ? 'главу' : 'эту сцену'} готовой`}
          </button>}
        </div>
      </section>}
      {goals && <Modal className="volume-goals stack" label="Цели книги и главы" onClose={() => setGoals(false)}>
        <h2>Цели книги и главы</h2>
        <label className="check-row">
          <input type="checkbox" checked={enabled} onChange={(event) => void patch<Project>('projects', project.id, { showVolume: event.target.checked })} />
          Показывать объём в редакторе
        </label>
        <GoalNumber label="Объём, знаков" value={project.targetChars} onSave={(targetChars) => void patch<Project>('projects', project.id, { targetChars })} />
        <GoalNumber label="Глав в плане" value={project.targetChapters || undefined} onSave={(targetChapters) => void patch<Project>('projects', project.id, { targetChapters })} />
        <details open={Boolean(project.chapterMin || project.chapterMax) || undefined}>
          <summary>Общий ориентир главы</summary>
          <GoalNumber label="Минимум, знаков" value={project.chapterMin} onSave={(chapterMin) => void patch<Project>('projects', project.id, { chapterMin })} />
          <GoalNumber label="Максимум, знаков" value={project.chapterMax} onSave={(chapterMax) => void patch<Project>('projects', project.id, { chapterMax })} />
        </details>
        {chapter && <details open={progress.custom || undefined}>
          <summary>Ориентир этой главы</summary>
          <GoalNumber label="Минимум, знаков" value={chapter.targetMin} onSave={(targetMin) => void patch<Chapter>('chapters', chapter.id, { targetMin })} />
          <GoalNumber label="Максимум, знаков" value={chapter.targetMax} onSave={(targetMax) => void patch<Chapter>('chapters', chapter.id, { targetMax })} />
          {progress.custom && <button className="btn sm ghost" onClick={() => void patch<Chapter>('chapters', chapter.id, { targetMin: undefined, targetMax: undefined })}>Вернуть общий ориентир</button>}
        </details>}
        <button className="btn" onClick={() => setGoals(false)}>Закрыть цели</button>
      </Modal>}
    </div>
  )
}

function GoalNumber({ label, value, onSave }: { label: string; value?: number; onSave: (n?: number) => void }) {
  const [draft, setDraft] = useState(value ? String(value) : '')
  useEffect(() => setDraft(value ? String(value) : ''), [value])
  return <label className="goal-number"><span>{label}</span><input className="input" inputMode="numeric" value={draft}
    onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
    onBlur={() => {
      const next = Number(draft)
      if (Number.isSafeInteger(next) && (next || undefined) !== value) onSave(next || undefined)
    }}
    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
}

export function ChapterVolumeIndicator({ progress, project }: { progress: ReturnType<typeof chapterWritingProgress>; project: Project }) {
  const [open, setOpen] = useState(false)
  if (!progress.target) return null
  const note = chapterVolumeNote(progress)
  const site = platformOf(project)
  const limit = site.selected ? site.hard : undefined
  const hardMaximum = limit?.max ? (limit.unit === 'words' ? formatWords(limit.max) : limit.unit === 'html-chars' ? `${number(limit.max)} знаков HTML` : limit.unit === 'ficbook-pages' ? `${number(limit.max)} стр.` : formatChars(limit.max)) : undefined
  return <div className="chapter-volume-indicator">
    <button type="button" aria-expanded={open} aria-label="Объём главы" title={`${amount(progress.chars, progress.target)} · ${note}`} onClick={() => setOpen(!open)}>
      <span style={{ width: `${Math.min(1, progress.ratio) * 100}%` }} />
    </button>
    {open && <>
      <small>{amount(progress.chars, progress.target)} · {note}</small>
      {hardMaximum && <small>{site.name} · максимум {hardMaximum}{limit?.note ? `. ${limit.note}` : ''}</small>}
    </>}
  </div>
}
