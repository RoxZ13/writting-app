import type { Editor } from '@tiptap/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { db, type Beat, type Marker, type Project, type Scene, type SceneText } from '../db/db'
import { createMarker, patch, save, snapshotScene } from '../db/repo'
import { ChapterContext, updateBeats } from '../components/ChapterContext'
import { Icon } from '../components/Icon'
import { MarkerCard } from '../components/MarkerCard'
import { PlacePicker } from '../components/Refs'
import { SceneEditor, type SelectionAction } from '../components/SceneEditor'
import { markerPayoffChapter, markerSetupChapter, markerStatus, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { session } from '../lib/session'
import { MARKER_STATES, statusOf } from '../lib/status'
import { docParagraphs, emptyDoc, formatWords } from '../lib/text'
import { InlineEdit, Modal, toast } from '../lib/ui'

type Mode = 'write' | 'edit' | 'rewrite'
const PANELS_KEY = 'manuscript.panels'
const MODE_KEY = 'manuscript.mode'

function loadPanels(): { nav: boolean; brief: boolean } {
  const wide = typeof matchMedia !== 'undefined' && matchMedia('(min-width: 1101px)').matches
  try {
    return { nav: wide, brief: false, ...JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') }
  } catch {
    return { nav: wide, brief: false }
  }
}
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

export function WriteView({ data, sceneId, onCapture }: { data: ProjectData; sceneId: string; onCapture: () => void }) {
  const scene = data.sceneById.get(sceneId)
  const text = useLiveQuery(() => db.texts.get(sceneId), [sceneId])
  const [panels, setPanels] = useState(loadPanels)
  const [mode, setModeState] = useState<Mode>(loadMode)
  const [words, setWords] = useState<number | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [action, setAction] = useState<SelectionAction | null>(null)
  const [openMarker, setOpenMarker] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [askRewrite, setAskRewrite] = useState(false)
  const [finishing, setFinishing] = useState(false)
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
  const togglePanel = (k: 'nav' | 'brief') => {
    const next = { ...panels, [k]: !panels[k] }
    if (!matchMedia('(min-width: 1101px)').matches) next[k === 'nav' ? 'brief' : 'nav'] = false
    persistPanels(next)
  }
  const closeOverlays = () => setPanels((p) => ({ ...p, nav: false, brief: false }))

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
    if (m === 'edit' && !panels.brief && matchMedia('(min-width: 1101px)').matches) persistPanels({ ...panels, brief: true })
  }

  const onWords = useCallback((n: number) => setWords(n), [])
  const onReady = useCallback((ed: Editor) => setEditor(ed), [])

  if (!scene) return null

  const rewriting = mode === 'rewrite' && !!scene.rewriteFrom
  const cls = [
    'write',
    `mode-${mode}`,
    panels.nav && 'nav-open',
    panels.brief && 'brief-open',
    typing && 'typing',
    rewriting && 'rewriting',
  ]
    .filter(Boolean)
    .join(' ')
  const chapter = data.chapterById.get(scene.chapterId)

  return (
    <div className={cls}>
      <aside className="write-side" aria-label="Структура">
        <div className="inner">
          <Structure data={data} sceneId={sceneId} onPick={() => !matchMedia('(min-width: 1101px)').matches && closeOverlays()} />
        </div>
      </aside>

      <div className="write-center">
        <div className="write-top">
          <button className="icon-btn" title={panels.nav ? 'Скрыть структуру' : 'Показать структуру'} onClick={() => togglePanel('nav')}>
            <Icon name="panel" size={18} />
          </button>
          <div className="crumbs">
            <span className="hide-sm" style={{ whiteSpace: 'nowrap' }}>
              {chapter?.title} ›
            </span>
            <InlineEdit value={scene.title} onSave={(title) => void patch<Scene>('scenes', scene.id, { title })} />
          </div>
          <div className="modes" role="group" aria-label="Режим">
            {(
              [
                ['write', 'Писать'],
                ['edit', 'Править'],
                ['rewrite', 'Переписывать'],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {label}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <span className="small muted hide-sm" style={{ whiteSpace: 'nowrap' }}>
            {formatWords(words ?? scene.wordCount)}
          </span>
          <button className="icon-btn" title="Маячок здесь (⌘/Ctrl + M)" onClick={() => editor && setAction(selectionForMarker(editor))}>
            <Icon name="spark" size={18} />
          </button>
          <button className="icon-btn" title="Быстрая запись: мысль, цитата, вопрос (⌘/Ctrl + J)" onClick={onCapture}>
            <Icon name="bolt" size={18} />
          </button>
          <button className={`icon-btn ${panels.brief ? 'on' : ''}`} title="Всё к этой главе" onClick={() => togglePanel('brief')}>
            <Icon name="sidebar" size={18} />
          </button>
          <button className="btn sm ghost hide-sm" onClick={() => setFinishing(true)}>
            Закончить
          </button>
        </div>

        {!bannerHidden && data.project.nextStep && (
          <div className="last-time">
            <span className="muted">В прошлый раз:</span> {data.project.nextStep}
            <button
              className="icon-btn"
              aria-label="Скрыть"
              onClick={() => {
                sessionStorage.setItem('manuscript.banner', '1')
                setBannerHidden(true)
              }}
            >
              ×
            </button>
          </div>
        )}
        <Compass scene={scene} onOpenBrief={() => !panels.brief && togglePanel('brief')} />

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
              />
            )}
          </div>
        </div>
      </div>

      <aside className="write-brief" aria-label="Всё к этой главе">
        <div className="inner">
          <div className="row" style={{ marginBottom: 4 }}>
            <span className="eyebrow">Всё к этой главе</span>
            <span className="spacer" />
            <button className="icon-btn" onClick={() => togglePanel('brief')} aria-label="Скрыть">
              ×
            </button>
          </div>
          <ChapterContext data={data} scene={scene} editor={editor} />
        </div>
      </aside>
      <div className="write-backdrop" onClick={closeOverlays} />

      {action && editor && <MarkerFromSelection data={data} scene={scene} action={action} editor={editor} onClose={() => setAction(null)} />}
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
      {data.outline.map(({ chapter, scenes }) => (
        <div key={chapter.id}>
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
                <span className="nav-scene-title">{s.title}</span>
              </button>
            ))}
        </div>
      ))}
    </>
  )
}

/** Quiet line above the text: the current beat of the scene's plan. One tap ticks it off. */
function Compass({ scene, onOpenBrief }: { scene: Scene; onOpenBrief: () => void }) {
  const next = scene.beats.find((b) => !b.done)
  const done = scene.beats.filter((b) => b.done).length
  const tick = (b: Beat) => void updateBeats(scene.id, (all) => all.map((x) => (x.id === b.id ? { ...x, done: true } : x)))

  if (!scene.beats.length) {
    return (
      <button className="compass" onClick={onOpenBrief}>
        <span className="now muted">{scene.goal ? scene.goal : 'Что должно произойти в этой сцене? Набросай пару пунктов — не будешь кружить.'}</span>
        <span className="prog">план →</span>
      </button>
    )
  }
  if (!next) {
    return (
      <button className="compass" onClick={onOpenBrief}>
        <span className="now">Всё по плану сцены написано.</span>
        <span className="prog">
          {done}/{scene.beats.length}
        </span>
      </button>
    )
  }
  return (
    <div className="compass" role="group" aria-label="Сейчас в сцене">
      <button className="compass-check" title="Готово — к следующему пункту" onClick={() => tick(next)} />
      <span className="now" onClick={onOpenBrief}>
        <span className="muted">Сейчас: </span>
        {next.text}
      </span>
      <span className="prog">
        {done}/{scene.beats.length}
      </span>
    </div>
  )
}

/** The previous text, quiet and to the side, while the scene is being rewritten. */
function RewriteOld({ scene, editor, onDone }: { scene: Scene; editor: Editor | null; onDone: () => void }) {
  const snap = useLiveQuery(() => (scene.rewriteFrom ? db.snapshots.get(scene.rewriteFrom) : undefined), [scene.rewriteFrom])
  const [hidden, setHidden] = useState(false)
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
        <span>Было</span>
        <span className="spacer" />
        <button className="link" onClick={() => setHidden(true)}>
          скрыть
        </button>
      </div>
      <div className="old-body">
        {snap ? docParagraphs(snap.content).map((p, i) => <p key={i}>{p}</p>) : <p>…</p>}
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

function FinishSession({ project, onClose }: { project: Project; onClose: () => void }) {
  const [v, setV] = useState(project.nextStep ?? '')
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
        <label>
          <span className="field-label">Записка себе на следующий раз</span>
          <textarea
            className="textarea"
            rows={3}
            autoFocus
            placeholder="Где остановилась и что дальше. Например: «дописать молчание Тома, потом — почему вмешивается Коллум»"
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
      toast(m.payoffChapterId ? 'Маячок посеян, раскрытие запланировано' : 'Маячок посеян — он будет висеть, пока не выберешь, где раскрыть')
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
              placeholder="Например: откуда у Тома амулет"
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
              emptyLabel="? Пока не знаю — пусть висит"
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
                {from ? `посеян: ${data.chapterById.get(from)?.title}` : ''}
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
