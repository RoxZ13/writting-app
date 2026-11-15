import type { Editor, JSONContent } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { db, type Project, type Scene, type SceneText } from '../db/db'
import { alive, createScene, moveScene, patch, save, splitChapterAt } from '../db/repo'
import { makeExcerpt } from '../lib/importer'
import { docCharCount, docParagraphs, docWordCount } from '../lib/text'
import { go } from '../lib/router'
import { toast } from '../lib/ui'
import { bookReadyProgress, chapterWritingProgress, sceneProgressState } from '../lib/writing-progress'

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
  chapterTitle,
  scene,
  scenes,
  bookScenes,
  chapterIds,
  bookWords,
}: {
  project: Project
  chars: number
  chapterTitle: string
  scene: Scene
  scenes: Scene[]
  bookScenes: Scene[]
  chapterIds: string[]
  bookWords: number
}) {
  const [open, setOpen] = useState(false)
  const [goalDraft, setGoalDraft] = useState(() => String(project.chapterMax || project.chapterMin || ''))
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    addEventListener('keydown', close)
    return () => removeEventListener('keydown', close)
  }, [open])
  useEffect(() => setGoalDraft(String(project.chapterMax || project.chapterMin || '')), [project.chapterMax, project.chapterMin])

  const liveMine = Math.max(0, chars - scenes.filter((item) => item.id !== scene.id).reduce((sum, item) => sum + (item.charCount ?? 0), 0))
  const progress = chapterWritingProgress(project, scenes, { sceneId: scene.id, chars: liveMine })
  const readyBook = bookReadyProgress(bookScenes, chapterIds)
  const sceneRatio = progress.total ? progress.ready / progress.total : 0
  const ratio = progress.target ? progress.ratio : sceneRatio
  const percent = Math.round(ratio * 100)
  const complete = progress.total > 0 && progress.ready === progress.total && (!progress.target || progress.chars >= progress.target)
  const number = (value: number) => Math.round(value).toLocaleString('ru-RU')
  const tone = complete ? 'done' : progress.over ? 'over' : ratio >= 0.9 ? 'near' : 'calm'
  const saveGoal = async (raw = goalDraft) => {
    const value = Math.max(0, Math.round(Number(raw.replace(/\s/g, '')) || 0))
    setGoalDraft(value ? String(value) : '')
    await patch<Project>('projects', project.id, {
      lengthUnit: 'chars',
      chapterMax: value || undefined,
      chapterMin: project.chapterMin && value && project.chapterMin < value ? project.chapterMin : undefined,
    })
  }

  return (
    <div className={`chapter-meter ${tone}${complete ? ' complete' : ''}`}>
      <button className="chapter-progress-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className="chapter-progress-label">{chapterTitle}</span>
        <span className="chapter-progress-summary">
          {progress.target ? `${number(progress.chars)} из ${number(progress.target)} знаков` : 'Задать цель главы'}
        </span>
        <span className="chapter-progress-percent">
          {progress.target ? `${percent}%` : `${progress.ready} из ${progress.total} сцен готовы`}
        </span>
        <span
          className="chapter-progress-track"
          role="progressbar"
          aria-label={`Прогресс главы «${chapterTitle}»`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, percent)}
        >
          <span className="chapter-progress-fill" style={{ width: `${Math.min(100, percent)}%` }} />
        </span>
      </button>

      {open && (
        <>
          <button className="chapter-progress-backdrop" aria-label="Закрыть прогресс главы" onClick={() => setOpen(false)} />
          <section className="chapter-progress-panel card" role="dialog" aria-modal="true" aria-label={`Прогресс главы «${chapterTitle}»`}>
            <header className="chapter-progress-head">
              <div>
                <span className="eyebrow">Прогресс главы</span>
                <h2>{chapterTitle}</h2>
              </div>
              <button className="icon-btn" aria-label="Закрыть" onClick={() => setOpen(false)}>×</button>
            </header>

            <div className="chapter-goal-editor">
              <label htmlFor="chapter-goal-input">Цель главы</label>
              <div className="chapter-goal-input-row">
                <input
                  id="chapter-goal-input"
                  className="input"
                  inputMode="numeric"
                  value={goalDraft}
                  placeholder="например, 40 000"
                  onChange={(event) => setGoalDraft(event.target.value.replace(/[^\d\s]/g, ''))}
                  onBlur={() => void saveGoal()}
                  onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                />
                <span>знаков</span>
              </div>
              <div className="chapter-goal-presets" aria-label="Быстрый выбор цели главы">
                {[10_000, 20_000, 40_000].map((value) => (
                  <button key={value} className="chip" onClick={() => void saveGoal(String(value))}>
                    {number(value)}
                  </button>
                ))}
                {!!progress.target && <button className="link small muted" onClick={() => void saveGoal('')}>без лимита</button>}
              </div>
              <span className="chapter-goal-hint">Действует для всех глав. Изменить можно здесь в любой момент.</span>
            </div>

            <div className={`chapter-progress-hero ${tone}`}>
              <div className="chapter-progress-number">
                {progress.target ? <><strong>{number(progress.chars)}</strong><span>написано из {number(progress.target)} знаков</span></> : <><strong>{progress.ready}/{progress.total}</strong><span>сцен готовы</span></>}
              </div>
              <div className="chapter-progress-bigtrack"><span style={{ width: `${Math.min(100, percent)}%` }} /></div>
              <div className="chapter-progress-message">
                {complete ? 'Глава собрана. Можно двигаться дальше ✦' : progress.over ? `Лимит превышен на ${number(progress.over)} знаков` : progress.target ? `Ещё ${number(progress.left ?? 0)} знаков — ${Math.max(0, 100 - percent)}% пути` : 'Задай лимит, чтобы видеть путь по знакам'}
              </div>
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

            <footer className="chapter-progress-book">
              <span>Вся книга</span>
              {project.targetWords ? <strong>{Math.min(100, Math.round((bookWords / project.targetWords) * 100))}% · {number(bookWords)} из {number(project.targetWords)} слов</strong> : <strong>{readyBook.ready} из {readyBook.total} глав готовы</strong>}
            </footer>
          </section>
        </>
      )}
    </div>
  )
}
