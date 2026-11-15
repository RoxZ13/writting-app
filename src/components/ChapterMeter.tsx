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

/**
 * The chapter's length against the norm: a thin line across the top of the page that fills up.
 * The bar is the indicator. Its words (how much is left, by how much the norm is passed) are small,
 * neutral, shown only on a wide screen and only while the author is not typing. Nothing at all when
 * the author has set no norm. Starting the next chapter from the cursor is in the «⋯» menu.
 */
export function ChapterMeter({
  project,
  chars,
  chapter,
  scene,
  scenes,
  bookScenes,
  chapters,
}: {
  project: Project
  chars: number
  chapter: Chapter
  scene: Scene
  scenes: Scene[]
  bookScenes: Scene[]
  chapters: Chapter[]
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    addEventListener('keydown', close)
    return () => removeEventListener('keydown', close)
  }, [open])

  const liveMine = Math.max(0, chars - scenes.filter((item) => item.id !== scene.id).reduce((sum, item) => sum + (item.charCount ?? 0), 0))
  const progress = chapterWritingProgress(project, scenes, { sceneId: scene.id, chars: liveMine }, chapter)
  const readyBook = bookReadyProgress(bookScenes, chapters.filter((item) => !item.pool).map((item) => item.id))
  const liveBookScenes = bookScenes.map((item) => item.id === scene.id ? { ...item, charCount: liveMine } : item)
  const book = bookWritingProgress(project, chapters, liveBookScenes)
  const complete = progress.total > 0 && progress.ready === progress.total
  const number = (value: number) => Math.round(value).toLocaleString('ru-RU')
  const inRange = !!progress.min && progress.chars >= progress.min && (!progress.max || progress.chars <= progress.max)
  const tone = progress.over ? 'over' : inRange ? 'done' : 'calm'
  const range = rangeLabel(progress.min, progress.max, number)
  const scaleMax = Math.max((progress.max || progress.min || progress.chars || 1) * 1.25, progress.chars)
  const bandStart = progress.min ? (progress.min / scaleMax) * 100 : 0
  const bandEnd = progress.max ? (progress.max / scaleMax) * 100 : progress.min ? (progress.min / scaleMax) * 100 : 0
  const marker = Math.min(100, (progress.chars / scaleMax) * 100)
  const sheets = (value: number) => value > 0 && value < 0.01 ? '<0,01' : (Math.round(value * 100) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  const chapterMessage = !progress.target
    ? 'Диапазон не задан — объём пока только измеряется.'
    : progress.min && progress.chars < progress.min
      ? `До целевого диапазона осталось ${number(progress.min - progress.chars)} знаков.`
      : progress.max && progress.chars > progress.max
        ? `Глава длиннее диапазона на ${number(progress.chars - progress.max)} знаков. Это ориентир, не ошибка.`
        : 'Объём находится в целевом диапазоне.'

  return (
    <div className={`chapter-meter ${tone}`}>
      <button className="chapter-progress-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className="chapter-progress-label">{chapter.title}</span>
        <span className="chapter-progress-summary">
          {number(progress.chars)} зн.{range ? ` · цель ${range}` : ' · задать диапазон'}
        </span>
        <span className="chapter-progress-percent">
          {progress.ready}/{progress.total} сцен
        </span>
        <span
          className={`chapter-progress-track range${progress.target ? '' : ' no-goal'}`}
          role="img"
          aria-label={`В главе ${number(progress.chars)} знаков${range ? `, целевой диапазон ${range}` : ''}`}
        >
          {progress.target && <span className="chapter-target-band" style={{ left: `${bandStart}%`, width: `${Math.max(2, bandEnd - bandStart)}%` }} />}
          <span className="chapter-current-marker" style={{ left: `${marker}%` }} />
        </span>
      </button>

      {open && (
        <>
          <button className="chapter-progress-backdrop" aria-label="Закрыть прогресс главы" onClick={() => setOpen(false)} />
          <section className="chapter-progress-panel card" role="dialog" aria-modal="true" aria-label={`Прогресс главы «${chapter.title}»`}>
            <header className="chapter-progress-head">
              <div>
                <span className="eyebrow">Прогресс главы</span>
                <h2>{chapter.title}</h2>
              </div>
              <button className="icon-btn" aria-label="Закрыть" onClick={() => setOpen(false)}>×</button>
            </header>

            <div className={`chapter-progress-hero ${tone}`}>
              <div className="chapter-progress-number">
                <strong>{number(progress.chars)}</strong><span>знаков написано</span>
              </div>
              <div className="chapter-range-scale">
                {progress.target && <span className="chapter-target-band" style={{ left: `${bandStart}%`, width: `${Math.max(2, bandEnd - bandStart)}%` }} />}
                <span className="chapter-current-marker" style={{ left: `${marker}%` }} />
              </div>
              <div className="chapter-range-labels"><span>0</span>{progress.min && <span style={{ left: `${bandStart}%` }}>{number(progress.min)}</span>}{progress.max && <span style={{ left: `${bandEnd}%` }}>{number(progress.max)}</span>}</div>
              <div className="chapter-progress-message">{chapterMessage}</div>
              {complete && <div className="chapter-scenes-complete">Все сцены готовы. Решение о длине остаётся за тобой.</div>}
            </div>

            <div className="chapter-progress-scenes">
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
            </div>

            <div className="chapter-progress-actions">
              <button
                className={`btn sm ${scene.status === 'done' ? 'ghost' : 'primary'}`}
                onClick={() => void patch<Scene>('scenes', scene.id, { status: scene.status === 'done' ? (liveMine > 0 ? 'written' : 'draft') : 'done' })}
              >
                {scene.status === 'done' ? 'Вернуть сцену в работу' : 'Отметить эту сцену готовой'}
              </button>
            </div>

            <section className="chapter-progress-book">
              <div className="chapter-progress-section-title"><strong>Книга</strong><span>{readyBook.ready} из {readyBook.total} глав готовы</span></div>
              <div className="book-progress-primary">
                {book.target ? <><strong>{number(book.chars)} / {number(book.target)} знаков</strong><span>{Math.round(book.ratio * 100)}%</span></> : <><strong>{number(book.chars)} знаков</strong><span>план не задан</span></>}
              </div>
              <div className="book-progress-sheets">{sheets(book.sheets)}{book.targetSheets !== undefined ? ` / ${sheets(book.targetSheets)}` : ''} авторских листов</div>
              {book.forecast && <div className={`book-progress-forecast ${book.target && book.forecast > book.target ? 'growing' : ''}`}>
                При нынешнем среднем объёме получится около <strong>{number(book.forecast)} знаков</strong>{book.target ? ` вместо ${number(book.target)}` : ''}.
                <span>Расчёт по {book.forecastSample} готовым главам.</span>
              </div>}
              {!book.forecast && project.targetChapters && <div className="chapter-goal-hint">Прогноз появится после трёх готовых глав.</div>}
            </section>

            <GoalSettings project={project} chapter={chapter} />
          </section>
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
  const setProject = (changes: Partial<Project>) => void patch<Project>('projects', project.id, { ...changes, lengthUnit: 'chars' })
  const setChapter = (changes: Partial<Chapter>) => void patch<Chapter>('chapters', chapter.id, changes)
  return (
    <details className="chapter-goal-settings">
      <summary>Изменить план</summary>
      <div className="chapter-goal-settings-body">
        <div className="goal-settings-group">
          <strong>Книга</strong>
          <div className="goal-settings-grid">
            <GoalNumber label="Объём, знаков" value={project.targetChars} placeholder="400 000" onSave={(targetChars) => setProject({ targetChars })} />
            <GoalNumber label="Глав" value={project.targetChapters || undefined} placeholder="28" onSave={(targetChapters) => setProject({ targetChapters })} />
          </div>
          {project.targetChars && project.targetChapters ? <span className="chapter-goal-hint">Средний ориентир: {Math.round(project.targetChars / project.targetChapters).toLocaleString('ru-RU')} знаков на главу.</span> : null}
        </div>
        <div className="goal-settings-group">
          <strong>Общий диапазон главы</strong>
          <div className="goal-settings-grid">
            <GoalNumber label="От" value={project.chapterMin} placeholder="12 000" onSave={(chapterMin) => setProject({ chapterMin })} />
            <GoalNumber label="До" value={project.chapterMax} placeholder="18 000" onSave={(chapterMax) => setProject({ chapterMax })} />
          </div>
        </div>
        <div className="goal-settings-group chapter-override-settings">
          <label><input type="checkbox" checked={custom} onChange={(event) => setChapter(event.target.checked ? { targetMin: project.chapterMin, targetMax: project.chapterMax } : { targetMin: undefined, targetMax: undefined })} /> Свой диапазон для «{chapter.title}»</label>
          {custom && <div className="goal-settings-grid"><GoalNumber label="От" value={chapter.targetMin} placeholder="8 000" onSave={(targetMin) => setChapter({ targetMin })} /><GoalNumber label="До" value={chapter.targetMax} placeholder="12 000" onSave={(targetMax) => setChapter({ targetMax })} /></div>}
        </div>
      </div>
    </details>
  )
}
