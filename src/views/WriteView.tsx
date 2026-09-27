import type { Editor } from '@tiptap/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { db, type Beat, type Marker, type Project, type Scene } from '../db/db'
import { createMarker, patch } from '../db/repo'
import { MarkerCard } from '../components/MarkerCard'
import { ScenePicker } from '../components/ScenePicker'
import { SceneBrief, updateBeats } from '../components/SceneBrief'
import { SceneEditor, type SelectionAction } from '../components/SceneEditor'
import { markerStatus, sceneLabel, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { session } from '../lib/session'
import { MARKER_STATES, statusOf } from '../lib/status'
import { formatWords } from '../lib/text'
import { InlineEdit, Modal, toast } from '../lib/ui'

const PANELS_KEY = 'manuscript.panels'
function loadPanels(): { nav: boolean; brief: boolean } {
  try {
    const wide = matchMedia('(min-width: 1001px)').matches
    return { nav: false, brief: wide, ...JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') }
  } catch {
    return { nav: false, brief: false }
  }
}

export function WriteView({ data, sceneId, onCapture }: { data: ProjectData; sceneId: string; onCapture: () => void }) {
  const scene = data.sceneById.get(sceneId)
  const text = useLiveQuery(() => db.texts.get(sceneId), [sceneId])
  const [panels, setPanels] = useState(loadPanels)
  const [focus, setFocus] = useState(false)
  const [words, setWords] = useState<number | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [action, setAction] = useState<SelectionAction | null>(null)
  const [openMarker, setOpenMarker] = useState<string | null>(null)

  // Remember where the author is — this powers "Continue" on every device.
  useEffect(() => {
    session.sceneId = sceneId
    if (data.project.lastSceneId !== sceneId) void patch<Project>('projects', data.project.id, { lastSceneId: sceneId })
    return () => {
      if (session.sceneId === sceneId) session.sceneId = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId])

  const togglePanel = (k: 'nav' | 'brief') => {
    const next = { ...panels, [k]: !panels[k] }
    if (!matchMedia('(min-width: 1001px)').matches) next[k === 'nav' ? 'brief' : 'nav'] = false
    setPanels(next)
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  const closeOverlays = () => setPanels((p) => ({ ...p, nav: false, brief: false }))

  const onWords = useCallback((n: number) => setWords(n), [])
  const onReady = useCallback((ed: Editor) => setEditor(ed), [])

  if (!scene) {
    return (
      <div className="empty">
        <h2>Сцена не найдена</h2>
        <button className="btn" onClick={() => go({ view: 'plan' })}>
          К плану
        </button>
      </div>
    )
  }

  const chapterNo = (data.chapterIndex.get(scene.chapterId) ?? 0) + 1
  const st = statusOf(scene.status)
  const cls = ['write', panels.nav && 'nav-open', panels.brief && 'brief-open', focus && 'focus dim'].filter(Boolean).join(' ')

  const finishSession = () => {
    go({ view: 'home' })
    if (!data.project.nextStep) toast('Оставь записку себе в брифе — завтра будет легче начать')
  }

  return (
    <div className={cls}>
      <aside className="write-side" aria-label="Сцены">
        <div className="inner">
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="btn sm ghost" onClick={() => go({ view: 'plan' })}>
              ← План
            </button>
            <span className="spacer" />
            <button className="icon-btn" onClick={() => togglePanel('nav')} aria-label="Закрыть">
              ×
            </button>
          </div>
          {data.outline.map(({ chapter, scenes }, i) => (
            <div key={chapter.id}>
              <div className="nav-chapter">
                {i + 1}. {chapter.title}
              </div>
              {scenes.map((s) => (
                <button
                  key={s.id}
                  className={`nav-scene ${s.id === sceneId ? 'active' : ''}`}
                  onClick={() => {
                    go({ view: 'write', sceneId: s.id })
                    if (!matchMedia('(min-width: 1001px)').matches) closeOverlays()
                  }}
                >
                  <span className="dot" style={{ background: statusOf(s.status).color }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="write-center">
        <div className="write-top">
          <button className="icon-btn" title="Все сцены" onClick={() => togglePanel('nav')}>
            ☰
          </button>
          <div className="crumbs">
            <span style={{ whiteSpace: 'nowrap' }}>Гл. {chapterNo} ›</span>
            <InlineEdit value={scene.title} onSave={(title) => void patch<Scene>('scenes', scene.id, { title })} />
          </div>
          <span className="chip hide-sm" style={{ flex: 'none' }}>
            <span className="dot" style={{ background: st.color }} />
            {st.label}
          </span>
          <span className="small muted hide-sm" style={{ whiteSpace: 'nowrap' }}>
            {formatWords(words ?? scene.wordCount)}
          </span>
          <span className="spacer" />
          <button className="icon-btn" title="Режим фокуса: приглушить всё, кроме текущего абзаца" onClick={() => setFocus(!focus)} aria-pressed={focus}>
            {focus ? '◉' : '○'}
          </button>
          <button className="icon-btn" title="Быстро записать мысль (Ctrl/⌘ + J)" onClick={onCapture}>
            ✎
          </button>
          <button className="btn sm ghost" onClick={() => togglePanel('brief')}>
            Бриф
          </button>
          <button className="btn sm ghost" title="Закончить и вернуться на главный экран" onClick={finishSession}>
            <span className="hide-sm">Готово на сегодня</span>
            <span className="show-sm">⌂</span>
          </button>
        </div>

        <Compass scene={scene} onOpenBrief={() => !panels.brief && togglePanel('brief')} />

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

      <aside className="write-brief" aria-label="Бриф сцены">
        <div className="row" style={{ position: 'absolute', right: 8, top: 'calc(env(safe-area-inset-top) + 8px)', zIndex: 2 }}>
          <button className="icon-btn" onClick={() => togglePanel('brief')} aria-label="Закрыть бриф">
            ×
          </button>
        </div>
        <SceneBrief data={data} scene={scene} editor={editor} />
      </aside>
      <div className="write-backdrop" onClick={closeOverlays} />

      {action && editor && (
        <MarkerFromSelection data={data} scene={scene} action={action} editor={editor} onClose={() => setAction(null)} />
      )}
      {openMarker && (
        <MarkerPopup data={data} markerId={openMarker} editor={editor} onClose={() => setOpenMarker(null)} />
      )}
    </div>
  )
}

/**
 * Always-visible anchor above the text: the current beat of the scene's plan.
 * One tap ticks it off and moves to the next one.
 */
function Compass({ scene, onOpenBrief }: { scene: Scene; onOpenBrief: () => void }) {
  const next = scene.beats.find((b) => !b.done)
  const done = scene.beats.filter((b) => b.done).length
  const tick = (b: Beat) => void updateBeats(scene.id, (all) => all.map((x) => (x.id === b.id ? { ...x, done: true } : x)))

  if (!scene.beats.length) {
    return (
      <button className="compass" onClick={onOpenBrief}>
        <span>🧭</span>
        <span className="now muted">
          {scene.goal ? scene.goal : 'Что должно произойти в этой сцене? Запиши 2–3 пункта — и не будешь кружить.'}
        </span>
        <span className="prog">план →</span>
      </button>
    )
  }
  if (!next) {
    return (
      <button className="compass" onClick={onOpenBrief}>
        <span>✓</span>
        <span className="now">Всё, что планировала, в сцене есть. Можно дописывать или переходить дальше.</span>
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
        <span className="muted small">Сейчас: </span>
        {next.text}
      </span>
      <span className="prog">
        {done}/{scene.beats.length}
      </span>
    </div>
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
  const [note, setNote] = useState('')
  const [payoff, setPayoff] = useState<string | undefined>()

  const mark = (id: string, role: 'setup' | 'payoff') =>
    editor.chain().focus().setTextSelection({ from: action.from, to: action.to }).setMark('marker', { id, role }).run()

  if (action.kind === 'setup') {
    const create = async () => {
      const m = await createMarker(data.project.id, {
        title: title.trim() || quote,
        note: note.trim() ? `${note.trim()}\n\n«${action.text}»` : `«${action.text}»`,
        setupSceneId: scene.id,
        payoffSceneId: payoff,
      })
      mark(m.id, 'setup')
      toast(payoff ? 'Маячок посеян, раскрытие запланировано' : 'Маячок посеян. Место раскрытия можно выбрать позже')
      onClose()
    }
    return (
      <Modal onClose={onClose} label="Новый маячок">
        <div className="stack">
          <h2>✦ Посеять маячок</h2>
          <div className="excerpt" style={{ margin: 0, maxHeight: 'none', WebkitMaskImage: 'none', maskImage: 'none' }}>
            {quote}
          </div>
          <label>
            <span className="field-label">Что нельзя забыть раскрыть?</span>
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
            <span className="field-label">Где раскроется?</span>
            <ScenePicker data={data} value={payoff} emptyLabel="? Пока не знаю — пусть висит, напомню" onChange={setPayoff} />
          </label>
          <label>
            <span className="field-label">Подробности (необязательно)</span>
            <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row">
            <span className="spacer" />
            <button className="btn ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="btn accent" onClick={() => void create()}>
              Посеять
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  // Payoff: pick which marker fires here. Markers planned for this scene come first.
  const open = data.markers
    .filter((m) => !m.resolved)
    .sort((a, b) => Number(b.payoffSceneId === scene.id) - Number(a.payoffSceneId === scene.id))
  const resolve = async (m: Marker) => {
    await patch<Marker>('markers', m.id, { payoffSceneId: scene.id, resolved: true })
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
          return (
            <button
              key={m.id}
              className="marker-item"
              style={{ '--mk-color': st.color, textAlign: 'left', cursor: 'pointer' } as React.CSSProperties}
              onClick={() => void resolve(m)}
            >
              <span className="t">{m.title}</span>
              <span className="small muted">
                посеян: {sceneLabel(data, m.setupSceneId)}
                {m.payoffSceneId === scene.id && ' · запланирован здесь'}
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

function MarkerPopup({
  data,
  markerId,
  editor,
  onClose,
}: {
  data: ProjectData
  markerId: string
  editor: Editor | null
  onClose: () => void
}) {
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
        {marker ? (
          <MarkerCard marker={marker} data={data} />
        ) : (
          <div className="muted">Этот маячок удалён.</div>
        )}
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
