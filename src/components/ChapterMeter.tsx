import type { Editor, JSONContent } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { db, type Chapter, type Project, type Scene, type SceneText } from '../db/db'
import { alive, createScene, moveScene, patch, save, splitChapterAt } from '../db/repo'
import { makeExcerpt } from '../lib/importer'
import { docCharCount, docParagraphs, docWordCount } from '../lib/text'
import { go } from '../lib/router'
import { toast } from '../lib/ui'
import { bookReadyProgress, bookWritingProgress, chapterWritingProgress, sceneProgressState } from '../lib/writing-progress'

/** Step 1 of a split: the tail becomes a new scene right after `scene`, opening a new chapter. Does not touch `scene`. */
export async function createTailChapter(project: Project, scene: Scene, tail: JSONContent): Promise<Scene> {
  const next = await createScene(
    project.id,
    scene.chapterId,
    '',
    { status: scene.status === 'idea' ? 'draft' : scene.status, excerpt: makeExcerpt(docParagraphs(tail).map((x) => x.trim()).filter(Boolean)) },
    tail,
    docWordCount(tail),
  )
  const order = alive(await db.scenes.where('chapterId').equals(scene.chapterId).sortBy('order')).map((s) => s.id)
  await moveScene(next.id, scene.chapterId, order.indexOf(scene.id) + 1)
  await splitChapterAt(next.id, 'Новая глава')
  return next
}

/** Step 2 of a split: only after the tail is safe, shorten the original scene to the head. */
export async function trimHead(sceneId: string, head: JSONContent): Promise<void> {
  const t = await db.texts.get(sceneId)
  if (t) await save<SceneText>('texts', { ...t, content: head, wordCount: docWordCount(head) })
  await patch<Scene>('scenes', sceneId, { wordCount: docWordCount(head), charCount: docCharCount(head) })
}

/**
 * The paragraph with the cursor and everything after it become a new scene opening a new chapter.
 * Called from the «⋯» menu of the text view: the meter itself has no buttons.
 */
export async function splitChapterHere(project: Project, scene: Scene, editor: Editor | null): Promise<void> {
  if (!editor) return
  const doc = editor.state.doc.toJSON() as JSONContent
  const at = editor.state.doc.resolve(editor.state.selection.from).index(0)
  const before = (doc.content ?? []).slice(0, at)
  const after = (doc.content ?? []).slice(at)
  if (!before.length || !after.length) return toast('Поставь курсор на абзац, с которого начнётся новая глава')
  const head = { type: 'doc', content: before }
  const tail = { type: 'doc', content: after }
  // Order matters: the tail is first copied into the new chapter, and only then cut from this scene.
  // If anything fails on the way, the worst case is a duplicated paragraph, never a lost one.
  let next: Scene
  try {
    next = await createTailChapter(project, scene, tail)
  } catch {
    return toast('Не получилось разделить главу — текст не тронут')
  }
  try {
    await trimHead(scene.id, head)
    // Saved right away, not on the editor's next pause: the page moves to the new chapter at once.
    editor.commands.setContent(head, { emitUpdate: true })
  } catch {
    return toast('Новая глава создана, но из этой сцены конец не убрался — абзацы теперь продублированы')
  }
  toast('Новая глава начинается с этого абзаца. Название — на доске')
  go({ view: 'text', sceneId: next.id })
}

/** Only a configured target gets a meter. The editor menu opens the same details without a target. */
export function ChapterMeter({
  project,
  chars,
  chapter,
  scene,
  scenes,
  bookScenes,
  chapters,
  wholeChapter = false,
  open,
  setOpen,
}: {
  project: Project
  chars: number
  chapter: Chapter
  scene: Scene
  scenes: Scene[]
  bookScenes: Scene[]
  chapters: Chapter[]
  wholeChapter?: boolean
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (settingsOpen) setSettingsOpen(false)
      else setOpen(false)
    }
    addEventListener('keydown', close)
    return () => removeEventListener('keydown', close)
  }, [open, settingsOpen, setOpen])

  const liveMine = Math.max(0, chars - scenes.filter((item) => item.id !== scene.id).reduce((sum, item) => sum + (item.charCount ?? 0), 0))
  const progress = chapterWritingProgress(project, scenes, { sceneId: scene.id, chars: liveMine }, chapter)
  if (!progress.target && !open) return null

  const readyBook = open ? bookReadyProgress(bookScenes, chapters.filter((item) => !item.pool).map((item) => item.id)) : null
  const book = open ? bookWritingProgress(project, chapters, bookScenes.map((item) =>
    item.id === scene.id ? { ...item, charCount: liveMine } : item,
  )) : null
  const complete = progress.total > 0 && progress.ready === progress.total
  const number = (value: number) => Math.round(value).toLocaleString('ru-RU')
  const inRange = !!progress.min && progress.chars >= progress.min && (!progress.max || progress.chars <= progress.max)
  const over = progress.max !== undefined && progress.chars > progress.max
  const tone = over ? 'over' : inRange ? 'done' : 'calm'
  const range = rangeLabel(progress.min, progress.max, number)
  const maxOnly = progress.min === undefined ? progress.max : undefined
  const scaleMax = maxOnly || Math.max((progress.max || progress.min || progress.chars || 1) * 1.25, progress.chars)
  const bandStart = progress.min ? (progress.min / scaleMax) * 100 : 0
  const bandEnd = progress.max ? (progress.max / scaleMax) * 100 : progress.min ? (progress.min / scaleMax) * 100 : 0
  const marker = Math.min(100, (progress.chars / scaleMax) * 100)
  const scale = maxOnly
    ? <span className="chapter-progress-fill" style={{ width: `${marker}%` }} />
    : <span className="chapter-target-band" style={{ left: `${bandStart}%`, width: `${Math.max(2, bandEnd - bandStart)}%` }} />
  const sheets = (value: number) => value > 0 && value < 0.01 ? '<0,01' : (Math.round(value * 100) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  const chapterMessage = progress.min && progress.chars < progress.min
      ? `До целевого диапазона осталось ${number(progress.min - progress.chars)} знаков.`
      : progress.max && progress.chars > progress.max
        ? `Сверх ориентира на ${number(progress.chars - progress.max)} знаков.`
        : !progress.min && progress.max
          ? `До максимума ${number(progress.max - progress.chars)} знаков.`
          : 'Объём соответствует ориентиру.'
  const close = () => {
    setSettingsOpen(false)
    setOpen(false)
  }

  return (
    <div className={`chapter-meter ${tone}${progress.target ? '' : ' chapter-meter-dialog-only'}`}>
      {progress.target && <button className="chapter-progress-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className="chapter-progress-label">{chapter.title}</span>
        <span className="chapter-progress-summary chapter-progress-summary-desktop">
          {number(progress.chars)} зн. · {range}
        </span>
        <span className="chapter-progress-summary chapter-progress-summary-mobile">
          {number(progress.chars)} · {range} зн.
        </span>
        {!wholeChapter && <span className="chapter-progress-percent">{progress.ready}/{progress.total} сцен</span>}
        <span className="chapter-progress-track range" aria-hidden="true">
          {scale}
          {!maxOnly && <span className="chapter-current-marker" style={{ left: `${marker}%` }} />}
        </span>
      </button>}

      {open && book && readyBook && (
        <>
          <button className="chapter-progress-backdrop" aria-label="Закрыть прогресс главы" onClick={close} />
          <section className="chapter-progress-panel card" role="dialog" aria-modal="true" aria-label={`Прогресс главы «${chapter.title}»`}>
            <header className="chapter-progress-head">
              <div>
                <span className="eyebrow">Прогресс главы</span>
                <h2>{chapter.title}</h2>
              </div>
              <div className="chapter-progress-head-actions">
                <button className="btn sm ghost" onClick={() => setSettingsOpen(true)}>Цели</button>
                <button className="icon-btn" aria-label="Закрыть" onClick={close}>×</button>
              </div>
            </header>

            <div className={`chapter-progress-hero ${tone}`}>
              <div className="chapter-progress-number">
                <strong>{number(progress.chars)}</strong><span>знаков написано</span>
              </div>
              {progress.target && <>
                <div className="chapter-range-scale">
                  {scale}
                  {!maxOnly && <span className="chapter-current-marker" style={{ left: `${marker}%` }} />}
                </div>
                <div className="chapter-range-labels"><span>0</span>{progress.min && <span style={{ left: `${bandStart}%` }}>{number(progress.min)}</span>}{progress.max && <span style={{ left: `${bandEnd}%` }}>{number(progress.max)}</span>}</div>
                <div className="chapter-progress-message">{chapterMessage}</div>
              </>}
              {complete && <div className="chapter-scenes-complete">{wholeChapter ? 'Глава отмечена готовой.' : 'Все сцены готовы.'}</div>}
            </div>

            {!wholeChapter && <div className="chapter-progress-scenes">
              <div className="chapter-progress-section-title">
                <strong>Сцены</strong>
                <span>{progress.written} написано · {progress.ready} готово</span>
              </div>
              {scenes.map((item) => {
                const state = sceneProgressState(item)
                const itemChars = item.id === scene.id ? liveMine : (item.charCount ?? 0)
                return (
                  <button
                    key={item.id}
                    className={`chapter-progress-scene ${state}${item.id === scene.id ? ' current' : ''}`}
                    onClick={() => {
                      setOpen(false)
                      go({ view: 'text', sceneId: item.id })
                    }}
                  >
                    <span className="chapter-progress-scene-dot" />
                    <span className="chapter-progress-scene-name">{item.title || item.excerpt || 'Сцена'}</span>
                    <span className="chapter-progress-scene-length">{number(itemChars)} зн.</span>
                    <span className="chapter-progress-scene-state">{state === 'ready' ? 'готова' : state === 'written' ? 'написана' : state === 'writing' ? 'в работе' : 'в плане'}</span>
                  </button>
                )
              })}
            </div>}

            <div className="chapter-progress-actions">
              <button
                className={`btn sm ${scene.status === 'done' ? 'ghost' : 'primary'}`}
                onClick={() => void patch<Scene>('scenes', scene.id, { status: scene.status === 'done' ? (liveMine > 0 ? 'written' : 'draft') : 'done' })}
              >
                {scene.status === 'done'
                  ? `Вернуть ${wholeChapter ? 'главу' : 'сцену'} в работу`
                  : `Отметить ${wholeChapter ? 'главу' : 'эту сцену'} готовой`}
              </button>
            </div>

            <details className="chapter-progress-book" open={bookOpen} onToggle={(event) => setBookOpen(event.currentTarget.open)}>
              <summary className="chapter-progress-section-title">
                <strong>Вся книга</strong>
                <span>{book.target ? `${Math.round(book.ratio * 100)}% · ` : ''}{readyBook.ready} из {readyBook.total} глав готовы</span>
              </summary>
              <div className="book-progress-details">
                <div className="book-progress-primary">
                  {book.target ? <><strong>{number(book.chars)} / {number(book.target)} знаков</strong><span>{Math.round(book.ratio * 100)}%</span></> : <strong>{number(book.chars)} знаков</strong>}
                </div>
                <div className="book-progress-sheets">{sheets(book.sheets)}{book.targetSheets !== undefined ? ` / ${sheets(book.targetSheets)}` : ''} авторских листов</div>
                {book.forecast && <div className={`book-progress-forecast ${book.target && book.forecast > book.target ? 'growing' : ''}`}>
                  При нынешнем среднем объёме получится около <strong>{number(book.forecast)} знаков</strong>{book.target ? ` вместо ${number(book.target)}` : ''}.
                  <span>Расчёт по {book.forecastSample} готовым главам.</span>
                </div>}
                {!book.forecast && project.targetChapters && <div className="chapter-goal-hint">Прогноз появится после трёх готовых глав.</div>}
              </div>
            </details>
          </section>
          {settingsOpen && (
            <>
              <button className="chapter-goal-backdrop" aria-label="Закрыть цели" onClick={() => setSettingsOpen(false)} />
              <section className="chapter-goal-dialog card" role="dialog" aria-modal="true" aria-label="Цели книги и главы">
                <header className="chapter-progress-head">
                  <div><span className="eyebrow">Ориентиры</span><h2>Цели</h2></div>
                  <button className="icon-btn" aria-label="Закрыть цели" onClick={() => setSettingsOpen(false)}>×</button>
                </header>
                <GoalSettings project={project} chapter={chapter} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}

function rangeLabel(min: number | undefined, max: number | undefined, number: (value: number) => string) {
  if (min && max) return `${number(min)}–${number(max)}`
  if (max) return `до ${number(max)}`
  if (min) return `от ${number(min)}`
  return ''
}

function GoalNumber({ label, value, placeholder, onSave }: { label: string; value?: number; placeholder: string; onSave: (value?: number) => void }) {
  const [draft, setDraft] = useState(value ? String(value) : '')
  useEffect(() => setDraft(value ? String(value) : ''), [value])
  const save = () => {
    const next = Math.max(0, Math.round(Number(draft.replace(/\s/g, '')) || 0)) || undefined
    setDraft(next ? String(next) : '')
    onSave(next)
  }
  return <label className="goal-number"><span>{label}</span><input className="input" inputMode="numeric" value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value.replace(/[^\d\s]/g, ''))} onBlur={save} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} /></label>
}

function GoalSettings({ project, chapter }: { project: Project; chapter: Chapter }) {
  const custom = chapter.targetMin !== undefined || chapter.targetMax !== undefined
  const setProject = (changes: Partial<Project>) => void patch<Project>('projects', project.id, changes)
  const setChapter = (changes: Partial<Chapter>) => void patch<Chapter>('chapters', chapter.id, changes)
  return (
    <div className="chapter-goal-settings">
      <div className="chapter-goal-settings-body">
        <div className="goal-settings-group">
          <strong>Общий объём главы</strong>
          <GoalNumber label="Максимум, знаков" value={project.chapterMax} placeholder="Без ограничения" onSave={(chapterMax) => setProject({ chapterMax })} />
          <details open={project.chapterMin ? true : undefined}>
            <summary>Добавить минимум</summary>
            <GoalNumber label="Минимум, знаков" value={project.chapterMin} placeholder="Без минимума" onSave={(chapterMin) => setProject({ chapterMin })} />
          </details>
        </div>
        <details className="goal-settings-group chapter-override-settings" open={custom || undefined}>
          <summary>Отдельный объём для этой главы</summary>
          <div className="goal-settings-grid">
            <GoalNumber label="Минимум, знаков" value={chapter.targetMin} placeholder="Без минимума" onSave={(targetMin) => setChapter({ targetMin })} />
            <GoalNumber label="Максимум, знаков" value={chapter.targetMax} placeholder="Без ограничения" onSave={(targetMax) => setChapter({ targetMax })} />
          </div>
          {custom && <button className="btn sm ghost" onClick={() => setChapter({ targetMin: undefined, targetMax: undefined })}>Вернуть общий объём</button>}
        </details>
        <details className="goal-settings-group">
          <summary>План книги</summary>
          <div className="goal-settings-grid">
            <GoalNumber label="Объём, знаков" value={project.targetChars} placeholder="400 000" onSave={(targetChars) => setProject({ targetChars })} />
            <GoalNumber label="Глав" value={project.targetChapters || undefined} placeholder="28" onSave={(targetChapters) => setProject({ targetChapters })} />
          </div>
          {project.targetChars && project.targetChapters ? <span className="chapter-goal-hint">Средний ориентир: {Math.round(project.targetChars / project.targetChapters).toLocaleString('ru-RU')} знаков на главу.</span> : null}
        </details>
      </div>
    </div>
  )
}
