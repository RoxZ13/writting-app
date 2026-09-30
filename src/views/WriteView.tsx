import type { Editor } from '@tiptap/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { db, type Marker, type Note, type Project, type Scene, type SceneText } from '../db/db'
import { createMarker, createNote, patch, save, snapshotScene } from '../db/repo'
import { SceneNow, ScenePlan, sceneMarkers } from '../components/ScenePlan'
import { Icon } from '../components/Icon'
import { TypoControls } from '../components/TypoControls'
import { MarkerCard } from '../components/MarkerCard'
import { PlacePicker } from '../components/Refs'
import { SceneEditor, type SelectionAction } from '../components/SceneEditor'
import { editHintsKey } from '../components/EditHints'
import { countHints } from '../lib/editcheck'
import { markerPayoffChapter, markerSetupChapter, markerStatus, sceneName, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { hotkey, session } from '../lib/session'
import { clock, useSprint } from '../lib/sprint'
import { endFocus, FocusStart } from '../components/Focus'
import { dayKey, wordsOn } from '../lib/pace'
import { MARKER_STATES, statusOf } from '../lib/status'
import { docParagraphs, emptyDoc, formatWords, lastSentences } from '../lib/text'
import { loadTypo } from '../lib/typography'
import { diffParagraphs } from '../lib/diff'
import { InlineEdit, Modal, toast } from '../lib/ui'

type Mode = 'write' | 'edit' | 'rewrite'
const PANELS_KEY = 'manuscript.panels'
const MODE_KEY = 'manuscript.mode'
const HINTS_KEY = 'manuscript.hints'

function loadPanels(): { nav: boolean; plan: boolean } {
  const wide = typeof matchMedia !== 'undefined' && matchMedia('(min-width: 1101px)').matches
  try {
    const saved = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}')
    // Side panels only stay open between visits on a wide screen; on a phone they cover the text.
    // In the quiet view (as in Calmly) the page starts alone; the structure opens on request.
    const calm = document.documentElement.dataset.calm === 'on'
    return wide ? { nav: !calm, plan: false, ...(calm ? {} : saved) } : { nav: false, plan: false }
  } catch {
    return { nav: wide, plan: false }
  }
}
const isWide = () => matchMedia('(min-width: 1101px)').matches
function loadMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return m === 'edit' || m === 'rewrite' ? m : 'write'
  } catch {
    return 'write'
  }
}

/** Expand an empty selection to the word under the cursor, so a marker can be dropped mid-sentence. */
function selectionForMarker(editor: Editor): SelectionAction {
  let { from, to } = editor.state.selection
  if (from === to) {
    const $pos = editor.state.selection.$from
    const text = $pos.parent.textContent
    let a = $pos.parentOffset
    let b = a
    const word = /[\p{L}\p{N}'’-]/u
    // At the end of a sentence or paragraph, take the word just before the cursor.
    if (!word.test(text[a] ?? '') && !word.test(text[a - 1] ?? '')) {
      while (a > 0 && !word.test(text[a - 1])) a--
      b = a
    }
    while (a > 0 && word.test(text[a - 1])) a--
    while (b < text.length && word.test(text[b])) b++
    from = $pos.start() + a
    to = $pos.start() + b
  }
  return { kind: 'setup', from, to, text: editor.state.doc.textBetween(from, to, ' ') }
}

export function WriteView({ data, sceneId, onCapture, onSearch }: { data: ProjectData; sceneId: string; onCapture: () => void; onSearch: () => void }) {
  const scene = data.sceneById.get(sceneId)
  const text = useLiveQuery(() => db.texts.get(sceneId), [sceneId])
  const [panels, setPanels] = useState(loadPanels)
  const [mode, setModeState] = useState<Mode>(loadMode)
  const [words, setWords] = useState<number | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [action, setAction] = useState<SelectionAction | null>(null)
  const [openMarker, setOpenMarker] = useState<string | null>(null)
  const [openComment, setOpenComment] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [askRewrite, setAskRewrite] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [typoOpen, setTypoOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { sprint, left } = useSprint()
  const [focusOpen, setFocusOpen] = useState(false)
  const [hintsOn, setHintsOn] = useState(() => {
    try {
      // Off until asked for: the text is the author's, hints come only on request.
      return localStorage.getItem(HINTS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [hintCounts, setHintCounts] = useState<ReturnType<typeof countHints> | null>(null)

  // The mode is read by the editor for spelling underlines; a setting change re-applies them.
  useEffect(() => {
    document.documentElement.dataset.writemode = mode
    if (!editor) return
    const refresh = () => editor.view.dispatch(editor.state.tr)
    window.addEventListener('manuscript:typo', refresh)
    return () => window.removeEventListener('manuscript:typo', refresh)
  }, [editor, mode])

  // «Править»: repeats, long sentences and filler words are underlined while the hints are on.
  useEffect(() => {
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setMeta(editHintsKey, mode === 'edit' && hintsOn))
    let last = ''
    const update = () => {
      const st = editHintsKey.getState(editor.state)
      const next = st?.on ? countHints(st.hints) : null
      const key = JSON.stringify(next)
      if (key !== last) {
        last = key
        setHintCounts(next)
      }
    }
    update()
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editor, mode, hintsOn])
  const toggleHints = () => {
    setHintsOn(!hintsOn)
    try {
      localStorage.setItem(HINTS_KEY, hintsOn ? '0' : '1')
    } catch {
      /* ignore */
    }
  }
  const [bannerHidden, setBannerHidden] = useState(() => sessionStorage.getItem('manuscript.banner') === '1')

  // While typing, everything around the text fades out; moving the mouse or touching brings it back.
  useEffect(() => {
    const wake = () => setTyping(false)
    const onKey = (e: KeyboardEvent) => {
      const inEditor = (e.target as HTMLElement | null)?.closest?.('.ProseMirror')
      if (inEditor && !e.metaKey && !e.ctrlKey && e.key.length === 1) setTyping(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousemove', wake)
    window.addEventListener('touchstart', wake)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('touchstart', wake)
    }
  }, [])

  // ⌘/Ctrl+M: drop a marker right where the cursor is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm' && editor) {
        e.preventDefault()
        setAction(selectionForMarker(editor))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor])

  // Remember where the author is — this powers "continue where I stopped" on every device.
  useEffect(() => {
    session.sceneId = sceneId
    if (data.project.lastSceneId !== sceneId) void patch<Project>('projects', data.project.id, { lastSceneId: sceneId })
    return () => {
      if (session.sceneId === sceneId) session.sceneId = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId])

  const persistPanels = (next: typeof panels) => {
    setPanels(next)
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  const togglePanel = (k: 'nav' | 'plan') => {
    // Narrow screens have room for one panel at a time.
    const next = isWide() ? { ...panels, [k]: !panels[k] } : { nav: false, plan: false, [k]: !panels[k] }
    persistPanels(next)
  }
  const openPlan = () => !panels.plan && togglePanel('plan')
  const closeOverlays = () => setPanels((p) => ({ ...p, nav: false, plan: false }))

  const setMode = (m: Mode) => {
    if (m === 'rewrite' && !scene?.rewriteFrom) {
      setAskRewrite(true)
      return
    }
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* ignore */
    }
  }

  const onWords = useCallback((n: number) => setWords(n), [])
  const onReady = useCallback((ed: Editor) => setEditor(ed), [])

  if (!scene) return null

  const rewriting = mode === 'rewrite' && !!scene.rewriteFrom
  const cls = [
    'write',
    `mode-${mode}`,
    panels.nav && 'nav-open',
    panels.plan && 'brief-open',
    typing && 'typing',
    rewriting && 'rewriting',
  ]
    .filter(Boolean)
    .join(' ')
  const chapter = data.chapterById.get(scene.chapterId)
  const due = sceneMarkers(data, scene).toPay.length
  const beatsDone = scene.beats.filter((b) => b.done).length

  return (
    <div className={cls}>
      <aside className="write-side" aria-label="Структура">
        <div className="inner">
          <Structure data={data} sceneId={sceneId} onPick={() => !isWide() && closeOverlays()} />
        </div>
      </aside>

      <div className="write-center">
        <div className="write-top">
          <button className={`tool ${panels.nav ? 'on' : ''}`} title={panels.nav ? 'Скрыть структуру книги' : 'Показать структуру книги'} onClick={() => togglePanel('nav')}>
            <Icon name="panel" size={17} />
            <span className="tool-label">Структура</span>
          </button>
          <div className="crumbs">
            <span className="hide-sm" style={{ whiteSpace: 'nowrap' }}>
              {chapter?.title} ›
            </span>
            <InlineEdit value={scene.title} placeholder={sceneName(data, scene)} onSave={(title) => void patch<Scene>('scenes', scene.id, { title })} />
            {mode !== 'write' && <span className="mode-chip">{mode === 'edit' ? 'правка' : 'переписываю'}</span>}
          </div>
          {mode === 'edit' && (
            <span className="hints-bar">
              <button className={`chip-toggle sm ${hintsOn ? 'on' : ''}`} onClick={toggleHints} title="Подчёркивать повторы, длинные предложения и лишние слова">
                Подсказки
              </button>
              {hintCounts && (
                <span className="hints-legend hide-sm">
                  <span className="eh-repeat">повторы {hintCounts.repeat}</span>
                  <span className="eh-long">длинные {hintCounts.long}</span>
                  <span className="eh-filler">лишние {hintCounts.filler}</span>
                </span>
              )}
            </span>
          )}
          <span className="spacer" />
          {sprint && sprint.projectId === data.project.id && left > 0 && (
            <button className="tool sprint-pill" title="Фокус идёт. Нажми, чтобы остановить" onClick={() => confirm('Остановить фокус?') && endFocus()}>
              ⏱ {clock(left)}
            </button>
          )}
          <button
            className={`tool ${panels.plan ? 'on' : ''}`}
            title={panels.plan ? 'Скрыть план сцены' : 'План сцены: зачем она, по пунктам, маячки, кто в ней'}
            onClick={() => togglePanel('plan')}
          >
            <Icon name="sidebar" size={17} />
            <span className="tool-label">План</span>
            {scene.beats.length > 0 && (
              <span className="tool-count">
                {beatsDone}/{scene.beats.length}
              </span>
            )}
            {due > 0 && <span className="tool-due" title="Здесь нужно раскрыть маячок" />}
          </button>
          <div className="typo-anchor">
            <button className={`tool ${typoOpen ? 'on' : ''}`} title="Шрифт, размер, ширина текста" onClick={() => setTypoOpen(!typoOpen)}>
              <span className="aa">Aa</span>
              <span className="tool-label">Шрифт</span>
            </button>
            {typoOpen && (
              <>
                <div className="typo-back" onClick={() => setTypoOpen(false)} />
                <div className="typo-pop card">
                  <TypoControls />
                </div>
              </>
            )}
          </div>
          <div className="typo-anchor">
            <button className={`tool ${menuOpen ? 'on' : ''}`} title="Режимы и прочее" aria-label="Ещё" onClick={() => setMenuOpen(!menuOpen)}>
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="typo-back" onClick={() => setMenuOpen(false)} />
                <div className="typo-pop card write-menu">
                  <button
                    className="mode-item"
                    onClick={() => {
                      setMenuOpen(false)
                      if (editor) setAction(selectionForMarker(editor))
                    }}
                  >
                    <span className="mode-dot">✦</span>
                    <span>
                      <strong>Маячок здесь</strong>
                      <span className="mode-hint">Деталь, которую раскроешь потом{hotkey(' · ⌘/Ctrl + M')}</span>
                    </span>
                  </button>
                  <div className="hr" />
                  <div className="menu-label">Режим</div>
                  {(
                    [
                      ['write', 'Писать', 'Только текст. Ничего лишнего.'],
                      ['edit', 'Править', 'Текст на странице, маячки подсвечены.'],
                      ['rewrite', 'Переписывать', 'Прежний текст тихо сбоку, новый — рядом.'],
                    ] as [Mode, string, string][]
                  ).map(([m, label, hint]) => (
                    <button
                      key={m}
                      className={`mode-item ${mode === m ? 'on' : ''}`}
                      onClick={() => {
                        setMenuOpen(false)
                        setMode(m)
                      }}
                    >
                      <span className="mode-dot">{mode === m ? '●' : '○'}</span>
                      <span>
                        <strong>{label}</strong>
                        <span className="mode-hint">{hint}</span>
                      </span>
                    </button>
                  ))}
                  <div className="hr" />
                  <button
                    className="mode-item"
                    onClick={() => {
                      setMenuOpen(false)
                      setFocusOpen(true)
                    }}
                  >
                    <span className="mode-dot">⏱</span>
                    <span>
                      <strong>Фокус</strong>
                      <span className="mode-hint">Только текст и таймер, без уведомлений. В конце — сколько написала</span>
                    </span>
                  </button>
                  <button
                    className="mode-item"
                    onClick={() => {
                      setMenuOpen(false)
                      onCapture()
                    }}
                  >
                    <span className="mode-dot">⚡</span>
                    <span>
                      <strong>Быстрая запись</strong>
                      <span className="mode-hint">Мысль, цитата, вопрос{hotkey(' · ⌘/Ctrl + J')}</span>
                    </span>
                  </button>
                  <button
                    className="mode-item"
                    onClick={() => {
                      setMenuOpen(false)
                      onSearch()
                    }}
                  >
                    <span className="mode-dot">⌕</span>
                    <span>
                      <strong>Поиск по книге</strong>
                      <span className="mode-hint">Где у меня было…{hotkey(' · ⌘/Ctrl + Shift + F')}</span>
                    </span>
                  </button>
                  <button
                    className="mode-item"
                    onClick={() => {
                      setMenuOpen(false)
                      setFinishing(true)
                    }}
                  >
                    <span className="mode-dot">✓</span>
                    <span>
                      <strong>Закончить на сегодня</strong>
                      <span className="mode-hint">Оставить записку себе на следующий раз</span>
                    </span>
                  </button>
                  <div className="small muted" style={{ padding: '8px 10px 2px' }}>
                    {formatWords(words ?? scene.wordCount)} в сцене · сегодня +{wordsOn(data.project, dayKey()).toLocaleString('ru-RU')}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {text && editor && !rewriting && (
          <Resume
            key={scene.id}
            note={bannerHidden ? '' : (data.project.nextStep ?? '')}
            doc={text.content}
            editor={editor}
            onNoteSeen={() => {
              sessionStorage.setItem('manuscript.banner', '1')
              setBannerHidden(true)
            }}
          />
        )}
        <div className="passport-wrap">
          <SceneNow data={data} scene={scene} onOpenPlan={openPlan} />
        </div>

        <div className="editor-area">
          {rewriting && <RewriteOld scene={scene} editor={editor} onDone={() => setModeState('write')} />}
          <div className="editor-wrap">
            {text && (
              <SceneEditor
                scene={scene}
                initial={text}
                onReady={onReady}
                onWords={onWords}
                onSelectionAction={setAction}
                onMarkerClick={setOpenMarker}
                onCommentClick={setOpenComment}
              />
            )}
          </div>
        </div>
      </div>

      <div className="calm-count" aria-hidden="true">
        {formatWords(words ?? scene.wordCount)}
      </div>

      <aside className="write-brief" aria-label="План сцены">
        <div className="inner">
          {panels.plan && (
            <ScenePlan key={scene.id} data={data} scene={scene} editor={editor} onOpenMarker={setOpenMarker} onClose={() => togglePanel('plan')} />
          )}
        </div>
      </aside>

      <div className="write-backdrop" onClick={closeOverlays} />

      {action && editor && action.kind === 'comment' && (
        <CommentDialog data={data} scene={scene} action={action} editor={editor} onClose={() => setAction(null)} />
      )}
      {openComment && <CommentPopup data={data} noteId={openComment} editor={editor} onClose={() => setOpenComment(null)} />}
      {action && editor && action.kind !== 'comment' && <MarkerFromSelection data={data} scene={scene} action={action} editor={editor} onClose={() => setAction(null)} />}
      {openMarker && <MarkerPopup data={data} markerId={openMarker} editor={editor} onClose={() => setOpenMarker(null)} />}
      {askRewrite && (
        <StartRewrite
          scene={scene}
          editor={editor}
          onClose={() => setAskRewrite(false)}
          onStarted={() => {
            setAskRewrite(false)
            setModeState('rewrite')
            try {
              localStorage.setItem(MODE_KEY, 'rewrite')
            } catch {
              /* ignore */
            }
          }}
        />
      )}
      {focusOpen && (
        <FocusStart
          data={data}
          onClose={() => setFocusOpen(false)}
          onStarted={() => {
            setFocusOpen(false)
            persistPanels({ nav: false, plan: false })
            editor?.commands.focus()
          }}
        />
      )}
      {finishing && <FinishSession project={data.project} onClose={() => setFinishing(false)} />}
    </div>
  )
}

/** Chapters and scenes of the book; the current one is highlighted. */
function Structure({ data, sceneId, onPick }: { data: ProjectData; sceneId: string; onPick: () => void }) {
  const current = data.sceneById.get(sceneId)
  const [closed, setClosed] = useState<Set<string>>(
    () => new Set(data.chapters.filter((c) => c.id !== current?.chapterId).map((c) => c.id)),
  )
  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <>
      <div className="eyebrow" style={{ margin: '4px 8px 10px' }}>
        Структура
      </div>
      {[...data.outline, ...(data.pool.scenes.length && data.pool.chapter ? [{ chapter: data.pool.chapter, scenes: data.pool.scenes }] : [])].map(({ chapter, scenes }) => (
        <div key={chapter.id} className={chapter.pool ? 'nav-pool' : undefined}>
          <button className="nav-chapter" onClick={() => toggle(chapter.id)}>
            <span className="caret">{closed.has(chapter.id) ? '▸' : '▾'}</span>
            {chapter.title}
          </button>
          {!closed.has(chapter.id) &&
            scenes.map((s) => (
              <button
                key={s.id}
                className={`nav-scene ${s.id === sceneId ? 'active' : ''}`}
                onClick={() => {
                  go({ view: 'text', sceneId: s.id })
                  onPick()
                }}
              >
                <span className="dot" style={{ background: statusOf(s.status).color }} />
                <span className="nav-scene-title">{sceneName(data, s)}</span>
              </button>
            ))}
        </div>
      ))}
    </>
  )
}

/** The previous text, quiet and to the side, while the scene is being rewritten. */
function RewriteOld({ scene, editor, onDone }: { scene: Scene; editor: Editor | null; onDone: () => void }) {
  const snap = useLiveQuery(() => (scene.rewriteFrom ? db.snapshots.get(scene.rewriteFrom) : undefined), [scene.rewriteFrom])
  const [hidden, setHidden] = useState(false)
  const [changes, setChanges] = useState(false)
  const now = useLiveQuery(() => (changes ? db.texts.get(scene.id) : undefined), [changes, scene.id])
  const finish = async (keepNew: boolean) => {
    if (!keepNew && snap && editor) {
      if (!confirm('Вернуть старый текст? Новый черновик сохранится в версиях.')) return
      const t = await db.texts.get(scene.id)
      if (t) await snapshotScene(t, 'Черновик переписывания')
      editor.commands.setContent(snap.content as object, { emitUpdate: true })
    }
    await patch<Scene>('scenes', scene.id, { rewriteFrom: undefined })
    toast(keepNew ? 'Новая версия осталась. Старая — в «Версиях»' : 'Старый текст вернулся')
    onDone()
  }
  if (hidden) {
    return (
      <button className="old-tab" onClick={() => setHidden(false)} title="Показать прежний текст">
        Было
      </button>
    )
  }
  return (
    <aside className="old-text">
      <div className="old-head">
        <div className="seg old-seg">
          <button aria-pressed={!changes} onClick={() => setChanges(false)}>
            Было
          </button>
          <button aria-pressed={changes} onClick={() => setChanges(true)} title="Убранное — зачёркнуто, новое — подчёркнуто">
            Что изменилось
          </button>
        </div>
        <span className="spacer" />
        <button className="link" onClick={() => setHidden(true)}>
          скрыть
        </button>
      </div>
      <div className="old-body">
        {!snap ? (
          <p>…</p>
        ) : changes && now ? (
          diffParagraphs(docParagraphs(snap.content), docParagraphs(now.content)).map((para, i) => (
            <p key={i}>
              {para.map((piece, k) =>
                piece.kind === 'same' ? piece.text : piece.kind === 'del' ? <del key={k}>{piece.text}</del> : <ins key={k}>{piece.text}</ins>,
              )}
            </p>
          ))
        ) : (
          docParagraphs(snap.content).map((p, i) => <p key={i}>{p}</p>)
        )}
      </div>
      <div className="old-foot">
        <button className="btn sm primary" onClick={() => void finish(true)}>
          Готово, оставить новый
        </button>
        <button className="btn sm ghost" onClick={() => void finish(false)}>
          Вернуть старый
        </button>
      </div>
    </aside>
  )
}

function StartRewrite({ scene, editor, onClose, onStarted }: { scene: Scene; editor: Editor | null; onClose: () => void; onStarted: () => void }) {
  const start = async (clean: boolean) => {
    const t = await db.texts.get(scene.id)
    if (!t) return
    const snap = await snapshotScene(t, 'До переписывания')
    await patch<Scene>('scenes', scene.id, { rewriteFrom: snap.id })
    if (clean) {
      await save<SceneText>('texts', { ...t, content: emptyDoc(), wordCount: 0 })
      editor?.commands.setContent(emptyDoc() as object, { emitUpdate: false })
    }
    onStarted()
  }
  return (
    <Modal onClose={onClose} label="Переписать сцену">
      <div className="stack">
        <h2>Переписать сцену</h2>
        <p className="muted" style={{ margin: 0 }}>
          Прежний текст будет тихо стоять сбоку — подглядывать можно, мешать не будет. Он сохранится в версиях в любом случае.
        </p>
        <button className="btn primary" onClick={() => void start(true)}>
          С чистого листа
        </button>
        <button className="btn" onClick={() => void start(false)}>
          Править копию старого текста
        </button>
        <button className="btn ghost" onClick={onClose}>
          Отмена
        </button>
      </div>
    </Modal>
  )
}

/**
 * «Подхватить мысль»: on opening a scene, the note left last time and the last two sentences,
 * so the way back into the text is one tap. Goes away with the first typed letter.
 */
function Resume({ note, doc, editor, onNoteSeen }: { note: string; doc: unknown; editor: Editor; onNoteSeen: () => void }) {
  const [tail] = useState(() => lastSentences(doc, 2))
  const [open, setOpen] = useState(() => loadTypo().resume === 'on' && Boolean(note || tail))
  const close = useCallback(() => {
    setOpen(false)
    if (note) onNoteSeen()
  }, [note, onNoteSeen])
  useEffect(() => {
    if (!open) return
    const onUpdate = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) close()
    }
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
    }
  }, [open, editor, close])
  if (!open) return null
  const resume = () => {
    close()
    editor.chain().focus('end', { scrollIntoView: true }).run()
  }
  return (
    <div className="resume" role="note">
      {note && (
        <div className="resume-note">
          <span className="muted">В прошлый раз:</span> {note}
        </div>
      )}
      {tail && <div className="resume-tail">…{tail}</div>}
      <div className="row">
        {tail && (
          <button className="btn primary" onClick={resume}>
            Продолжить отсюда
          </button>
        )}
        <span className="spacer" />
        <button className="icon-btn" aria-label="Скрыть" onClick={close}>
          ×
        </button>
      </div>
    </div>
  )
}

function FinishSession({ project, onClose }: { project: Project; onClose: () => void }) {
  const [v, setV] = useState(project.nextStep ?? '')
  const today = wordsOn(project, dayKey())
  const goal = project.dailyGoal
  const done = async () => {
    await patch<Project>('projects', project.id, { nextStep: v.trim() })
    sessionStorage.removeItem('manuscript.banner')
    toast('Сохранено. Завтра начнёшь отсюда')
    onClose()
  }
  return (
    <Modal onClose={onClose} label="Закончить на сегодня">
      <div className="stack">
        <h2>На сегодня всё?</h2>
        {today > 0 && (
          <div className="day-total">
            Сегодня <strong>+{today.toLocaleString('ru-RU')}</strong> {goal ? `из ${goal.toLocaleString('ru-RU')} ` : ''}слов
            {goal && today >= goal ? ' — цель дня есть' : ''}
          </div>
        )}
        <label>
          <span className="field-label">Записка себе на следующий раз</span>
          <textarea
            className="textarea"
            rows={3}
            autoFocus
            placeholder="Где остановилась и что дальше — пара слов, чтобы завтра начать без раскачки"
            value={v}
            onChange={(e) => setV(e.target.value)}
          />
        </label>
        <div className="row">
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={() => void done()}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}

function MarkerFromSelection({
  data,
  scene,
  action,
  editor,
  onClose,
}: {
  data: ProjectData
  scene: Scene
  action: SelectionAction
  editor: Editor
  onClose: () => void
}) {
  const quote = action.text.length > 80 ? action.text.slice(0, 78) + '…' : action.text
  const [title, setTitle] = useState('')
  const [draft, setDraft] = useState<Partial<Marker>>({})

  const mark = (id: string, role: 'setup' | 'payoff') => {
    if (action.from === action.to) return
    editor.chain().focus().setTextSelection({ from: action.from, to: action.to }).setMark('marker', { id, role }).run()
  }

  if (action.kind === 'setup') {
    const create = async () => {
      const m = await createMarker(data.project.id, {
        title: title.trim() || quote || 'Маячок',
        note: action.text ? `«${action.text}»` : '',
        setupSceneId: scene.id,
        setupChapterId: scene.chapterId,
        payoffSceneId: draft.payoffSceneId,
        payoffChapterId: draft.payoffChapterId,
      })
      mark(m.id, 'setup')
      toast(m.payoffChapterId ? 'Маячок заложен, раскрытие запланировано' : 'Маячок заложен. Он будет гореть красным, пока не выберешь, где раскрыть')
      onClose()
    }
    return (
      <Modal onClose={onClose} label="Новый маячок">
        <div className="stack">
          <h2>✦ Маячок</h2>
          {quote && <div className="quote-text">«{quote}»</div>}
          <label>
            <span className="field-label">Что потом нужно раскрыть?</span>
            <input
              className="input"
              autoFocus
              placeholder="Что потом нужно раскрыть — одной фразой"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void create()}
            />
          </label>
          <label>
            <span className="field-label">Где раскроется (можно потом)</span>
            <PlacePicker
              data={data}
              marker={draft as Marker}
              side="payoff"
              emptyLabel="? Пока не знаю — решу потом"
              onChange={(c) => setDraft((d) => ({ ...d, ...c }))}
            />
          </label>
          <div className="row">
            <span className="spacer" />
            <button className="btn ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="btn primary" onClick={() => void create()}>
              Посеять
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  // Payoff: which marker fires here? Those planned for this chapter come first.
  const open = data.markers
    .filter((m) => !m.resolved)
    .sort(
      (a, b) =>
        Number(markerPayoffChapter(b, data) === scene.chapterId) - Number(markerPayoffChapter(a, data) === scene.chapterId),
    )
  const resolve = async (m: Marker) => {
    await patch<Marker>('markers', m.id, { payoffSceneId: scene.id, payoffChapterId: scene.chapterId, resolved: true })
    mark(m.id, 'payoff')
    toast(`Маячок «${m.title}» раскрыт`)
    onClose()
  }
  return (
    <Modal onClose={onClose} label="Раскрытие маячка">
      <div className="stack">
        <h2>◎ Что здесь раскрывается?</h2>
        {open.length === 0 && <div className="muted">Открытых маячков нет.</div>}
        {open.map((m) => {
          const st = MARKER_STATES[markerStatus(m, data)]
          const from = markerSetupChapter(m, data)
          return (
            <button
              key={m.id}
              className="marker-item"
              style={{ '--mk-color': st.color, textAlign: 'left', cursor: 'pointer' } as React.CSSProperties}
              onClick={() => void resolve(m)}
            >
              <span className="t">{m.title}</span>
              <span className="small muted">
                {from ? `заложен: ${data.chapterById.get(from)?.title}` : ''}
                {markerPayoffChapter(m, data) === scene.chapterId && ' · запланирован в этой главе'}
              </span>
            </button>
          )
        })}
        <div className="row">
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </Modal>
  )
}

function MarkerPopup({ data, markerId, editor, onClose }: { data: ProjectData; markerId: string; editor: Editor | null; onClose: () => void }) {
  const marker = data.markers.find((m) => m.id === markerId)
  const unmark = () => {
    if (!editor) return
    const { state } = editor
    const tr = state.tr
    state.doc.descendants((node, pos) => {
      node.marks.forEach((mk) => {
        if (mk.type.name === 'marker' && mk.attrs.id === markerId) tr.removeMark(pos, pos + node.nodeSize, mk)
      })
    })
    editor.view.dispatch(tr)
    onClose()
  }
  return (
    <Modal onClose={onClose} label="Маячок">
      <div className="stack">
        {marker ? <MarkerCard marker={marker} data={data} open /> : <div className="muted">Этот маячок удалён.</div>}
        <div className="row">
          <button className="btn ghost sm" onClick={unmark}>
            Снять подсветку в тексте
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Remove a mark (marker or comment) with the given id from the whole scene. */
function unmarkAll(editor: Editor, markName: string, id: string) {
  const { state } = editor
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    node.marks.forEach((mk) => {
      if (mk.type.name === markName && mk.attrs.id === id) tr.removeMark(pos, pos + node.nodeSize, mk)
    })
  })
  editor.view.dispatch(tr)
}

function CommentDialog({
  data,
  scene,
  action,
  editor,
  onClose,
}: {
  data: ProjectData
  scene: Scene
  action: SelectionAction
  editor: Editor
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const quote = action.text.length > 90 ? action.text.slice(0, 88) + '…' : action.text
  const create = async () => {
    if (!text.trim()) return onClose()
    const n = await createNote(text.trim(), 'note', data.project.id, scene.id)
    if (action.from !== action.to) {
      editor.chain().focus().setTextSelection({ from: action.from, to: action.to }).setMark('comment', { id: n.id }).run()
    }
    toast('Заметка на полях сохранена')
    onClose()
  }
  return (
    <Modal onClose={onClose} label="Заметка на полях">
      <div className="stack">
        <h2>Заметка на полях</h2>
        {quote && <div className="quote-text">«{quote}»</div>}
        <textarea
          className="textarea"
          rows={3}
          autoFocus
          placeholder="Что здесь поправить или проверить?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void create()
          }}
        />
        <div className="row">
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={() => void create()}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CommentPopup({ data, noteId, editor, onClose }: { data: ProjectData; noteId: string; editor: Editor | null; onClose: () => void }) {
  const note = data.notes.find((n) => n.id === noteId)
  const resolve = async () => {
    if (note) await patch<Note>('notes', note.id, { archived: true })
    if (editor) unmarkAll(editor, 'comment', noteId)
    toast('Готово — заметка убрана')
    onClose()
  }
  return (
    <Modal onClose={onClose} label="Заметка на полях">
      <div className="stack">
        <span className="eyebrow">Заметка на полях</span>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 16 }}>{note && !note.archived ? note.text : 'Эта заметка уже закрыта.'}</div>
        <div className="row">
          <button className="btn primary" onClick={() => void resolve()}>
            ✓ Сделано
          </button>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </Modal>
  )
}
