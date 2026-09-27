import type { Editor } from '@tiptap/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, uid, type Beat, type Note, type Project, type Scene, type SceneText } from '../db/db'
import { createMarker, patch, remove, save, snapshotScene } from '../db/repo'
import { markerStatus, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { noteKind, STATUSES, timeAgo } from '../lib/status'
import { toast } from '../lib/ui'
import { MarkerCard } from './MarkerCard'

/** Update beats from the freshest stored copy, so quick successive edits never overwrite each other. */
export async function updateBeats(sceneId: string, fn: (beats: Beat[]) => Beat[]) {
  await db.transaction('rw', db.scenes, db.outbox, async () => {
    const current = await db.scenes.get(sceneId)
    if (current) await patch<Scene>('scenes', sceneId, { beats: fn(current.beats) })
  })
}

export function SceneBrief({ data, scene, editor }: { data: ProjectData; scene: Scene; editor: Editor | null }) {
  const set = (changes: Partial<Scene>) => void patch<Scene>('scenes', scene.id, changes)
  const setups = data.markers.filter((m) => m.setupSceneId === scene.id)
  const payoffs = data.markers.filter((m) => m.payoffSceneId === scene.id && m.setupSceneId !== scene.id)
  const notes = data.notes.filter((n) => n.sceneId === scene.id && !n.archived)

  const setStatus = (status: Scene['status']) => {
    if (status === 'done') {
      const open = scene.beats.filter((b) => !b.done).length
      const hanging = setups.filter((m) => markerStatus(m, data) === 'hanging').length
      const unpaid = payoffs.filter((m) => !m.resolved).length
      const issues = [
        open && `не отмечено пунктов плана: ${open}`,
        hanging && `маячков без места раскрытия: ${hanging}`,
        unpaid && `здесь должны были раскрыться, но не отмечены: ${unpaid}`,
      ].filter(Boolean)
      if (issues.length && !confirm(`Перед тем как пометить «Готова»:\n\n• ${issues.join('\n• ')}\n\nВсё равно отметить?`)) return
    }
    set({ status })
  }

  return (
    <div className="inner">
      <section className="brief-section">
        <h3>Состояние</h3>
        <div className="seg" style={{ width: '100%' }}>
          {STATUSES.map((s) => (
            <button key={s.id} aria-pressed={scene.status === s.id} onClick={() => setStatus(s.id)} title={s.label}>
              <span className="status-dot" style={{ background: s.color, display: 'inline-block', marginRight: 5 }} />
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section className="brief-section">
        <h3>Зачем эта сцена</h3>
        <GoalField value={scene.goal} onSave={(goal) => set({ goal })} />
      </section>

      <section className="brief-section">
        <h3>
          Что должно произойти{' '}
          {scene.beats.length > 0 && (
            <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {scene.beats.filter((b) => b.done).length}/{scene.beats.length}
            </span>
          )}
        </h3>
        <Beats beats={scene.beats} onChange={(fn) => void updateBeats(scene.id, fn)} />
      </section>

      <section className="brief-section">
        <h3>Маячки</h3>
        <div className="stack" style={{ gap: 8 }}>
          {payoffs.length > 0 && <div className="small muted">Должны раскрыться здесь:</div>}
          {payoffs.map((m) => (
            <MarkerCard key={m.id} marker={m} data={data} compact />
          ))}
          {setups.length > 0 && <div className="small muted">Посеяны здесь:</div>}
          {setups.map((m) => (
            <MarkerCard key={m.id} marker={m} data={data} compact />
          ))}
          {!setups.length && !payoffs.length && (
            <div className="small muted">Выдели фразу в тексте → «✦ Маячок», и она не потеряется.</div>
          )}
          <button
            className="btn sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => void createMarker(data.project.id, { title: 'Новый маячок', setupSceneId: scene.id })}
          >
            + Маячок в этой сцене
          </button>
        </div>
      </section>

      {notes.length > 0 && (
        <section className="brief-section">
          <h3>Заметки к сцене</h3>
          {notes.map((n) => (
            <div key={n.id} className="row small" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', padding: '4px 0' }}>
              <span>{noteKind(n.kind).icon}</span>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{n.text}</span>
              <button className="icon-btn" title="Разобрано" onClick={() => void patch<Note>('notes', n.id, { archived: true })}>
                ✓
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="brief-section">
        <h3>Записка себе на следующий раз</h3>
        <NextStep project={data.project} />
      </section>

      <Versions scene={scene} editor={editor} />

      <section className="brief-section">
        <h3>Сцена</h3>
        <label className="small muted">
          Глава
          <select className="select" value={scene.chapterId} onChange={(e) => set({ chapterId: e.target.value, order: 9999 })}>
            {data.chapters.map((c, i) => (
              <option key={c.id} value={c.id}>
                {i + 1}. {c.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn ghost sm"
          style={{ marginTop: 10, color: 'var(--accent)' }}
          onClick={async () => {
            if (!confirm(`Удалить сцену «${scene.title}» вместе с текстом?`)) return
            await remove('scenes', scene.id)
            await remove('texts', scene.id)
            go({ view: 'plan' })
          }}
        >
          Удалить сцену
        </button>
      </section>
    </div>
  )
}

function GoalField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <textarea
      className="textarea"
      rows={2}
      placeholder="Что в этой сцене должно измениться? Ради чего она?"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
    />
  )
}

function Beats({ beats, onChange }: { beats: Beat[]; onChange: (fn: (b: Beat[]) => Beat[]) => void }) {
  const [draft, setDraft] = useState('')
  const update = (id: string, changes: Partial<Beat>) => onChange((all) => all.map((b) => (b.id === id ? { ...b, ...changes } : b)))
  const drop = (id: string) => onChange((all) => all.filter((x) => x.id !== id))
  const move = (i: number, dir: -1 | 1) => {
    onChange((all) => {
      const j = i + dir
      if (j < 0 || j >= all.length) return all
      const next = [...all]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  return (
    <div>
      {beats.map((b, i) => (
        <div key={b.id} className={`beat ${b.done ? 'done' : ''}`}>
          <input type="checkbox" checked={b.done} onChange={(e) => update(b.id, { done: e.target.checked })} />
          <BeatText value={b.text} onSave={(text) => (text.trim() ? update(b.id, { text }) : drop(b.id))} />
          <button className="icon-btn" title="Выше" onClick={() => move(i, -1)}>
            ↑
          </button>
          <button className="icon-btn" title="Удалить" onClick={() => drop(b.id)}>
            ×
          </button>
        </div>
      ))}
      <input
        className="input"
        style={{ marginTop: 6 }}
        placeholder={beats.length ? '+ ещё пункт' : 'Например: Тео выбирает Гермиону'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            const text = draft.trim()
            onChange((all) => [...all, { id: uid(), text, done: false }])
            setDraft('')
          }
        }}
      />
    </div>
  )
}

function BeatText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <textarea rows={1} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
}

function NextStep({ project }: { project: Project }) {
  const [v, setV] = useState(project.nextStep ?? '')
  useEffect(() => setV(project.nextStep ?? ''), [project.nextStep])
  return (
    <textarea
      className="textarea"
      rows={3}
      placeholder="Где остановилась и что дальше? Например: «Дописать реплику Тома, потом — почему Коллум вмешивается»"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (project.nextStep ?? '') && void patch<Project>('projects', project.id, { nextStep: v })}
    />
  )
}

function Versions({ scene, editor }: { scene: Scene; editor: Editor | null }) {
  const snaps = useLiveQuery(
    async () =>
      (await db.snapshots.where('sceneId').equals(scene.id).toArray())
        .filter((s) => !s.deleted)
        .sort((a, b) => b.createdAt - a.createdAt),
    [scene.id],
  )
  const current = async () => db.texts.get(scene.id)

  const saveVersion = async () => {
    const t = await current()
    if (!t) return
    const reason = prompt('Как назвать эту версию?', 'Вариант') ?? undefined
    if (reason === undefined) return
    await snapshotScene(t, reason || 'Вариант')
    toast('Версия сохранена')
  }

  const restore = async (content: unknown, wordCount: number) => {
    const t = await current()
    if (!t || !editor) return
    if (!confirm('Вернуть эту версию? Текущий текст тоже сохранится как версия.')) return
    await snapshotScene(t, 'Перед восстановлением')
    await save<SceneText>('texts', { ...t, content, wordCount })
    editor.commands.setContent(content as object, { emitUpdate: false })
    toast('Версия восстановлена')
  }

  return (
    <section className="brief-section">
      <h3>Версии и варианты</h3>
      <button className="btn sm" onClick={() => void saveVersion()}>
        Сохранить текущий текст как версию
      </button>
      {snaps && snaps.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {snaps.map((s) => (
            <div key={s.id} className="snapshot">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{s.reason}</div>
                <div className="muted">
                  {timeAgo(s.createdAt)} · {s.wordCount} сл.
                </div>
              </div>
              <button className="btn sm ghost" onClick={() => void restore(s.content, s.wordCount)}>
                Вернуть
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
