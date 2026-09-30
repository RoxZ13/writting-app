import { useEffect, useState } from 'react'
import type { Scene } from '../db/db'
import { createMarker, ensurePool, mergeSceneIntoPrevious, moveScene, patch, remove, splitChapterAt } from '../db/repo'
import { go } from '../lib/router'
import { isNode, sceneBranches, sceneName, type ProjectData } from '../lib/hooks'
import { STATUSES } from '../lib/status'
import { toast } from '../lib/ui'
import { MarkerCard } from './MarkerCard'
import { RefChips } from './Refs'
import { Heat } from './Plot'

/** Quick edit of a scene from the board: what happens, lines, people, markers. No editor needed. */
export function SceneSheet({ data, scene, onClose }: { data: ProjectData; scene: Scene; onClose: () => void }) {
  const [title, setTitle] = useState(scene.title)
  const [goal, setGoal] = useState(scene.goal)
  useEffect(() => {
    setTitle(scene.title)
    setGoal(scene.goal)
  }, [scene.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (changes: Partial<Scene>) => void patch<Scene>('scenes', scene.id, changes)
  const markers = data.markers.filter((m) => m.setupSceneId === scene.id || m.payoffSceneId === scene.id)
  const inPool = scene.chapterId === data.pool.chapter?.id
  const siblings = inPool ? data.pool.scenes : data.scenes.filter((s) => s.chapterId === scene.chapterId)
  const canMerge = !inPool && siblings.indexOf(scene) > 0
  const [opened, setOpened] = useState<Set<'lines' | 'people'>>(new Set())
  const show = (k: 'lines' | 'people') => opened.has(k) || (k === 'lines' ? (scene.lineIds ?? []).length > 0 : (scene.characterIds ?? []).length > 0)
  const place = async (to: string) => {
    if (to === 'pool') {
      const pool = await ensurePool(data.project.id)
      await moveScene(scene.id, pool.id, data.pool.scenes.length)
      toast('Сцена в «Пока без места»')
    } else {
      await moveScene(scene.id, to, data.scenes.filter((s) => s.chapterId === to && s.id !== scene.id).length)
      toast(`Сцена перенесена в «${data.chapterById.get(to)?.title}»`)
    }
  }

  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-label="Сцена">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="eyebrow">{data.chapterById.get(scene.chapterId)?.title}</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <input
          className="sheet-title"
          value={title}
          placeholder={sceneName(data, scene)}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== scene.title && set({ title })}
        />
        {scene.epigraph && <div className="card-epigraph">♪ {scene.epigraph}</div>}
        {scene.excerpt && <div className="card-excerpt">{scene.excerpt}</div>}
        <textarea
          className="textarea"
          rows={3}
          placeholder="Кратко: что происходит, что меняется"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onBlur={() => goal !== scene.goal && set({ goal })}
        />
        <button className="btn primary" onClick={() => go({ view: 'write', sceneId: scene.id })}>
          Писать эту сцену →
        </button>
        <div className="sheet-plot">
          {isNode(scene, data) && (
            <span className="sheet-node" title="Сцена, где сходятся ветки, — узел истории">
              ◆ здесь сходятся {sceneBranches(scene, data).map((l) => l.name).join(' и ')}
            </span>
          )}
          <span className="sheet-heat">
            <span className="muted small">Накал</span>
            <Heat scene={scene} large />
          </span>
        </div>

        {show('lines') && (
          <section className="sheet-section">
            <h3>Ветки</h3>
            <RefChips data={data} sceneId={scene.id} field="lineIds" selected={scene.lineIds ?? []} />
          </section>
        )}
        {show('people') && (
          <section className="sheet-section">
            <h3>Герои в сцене</h3>
            <RefChips data={data} sceneId={scene.id} field="characterIds" selected={scene.characterIds ?? []} />
          </section>
        )}
        {markers.length > 0 && (
          <section className="sheet-section">
            <h3>Маячки</h3>
            <div className="stack" style={{ gap: 8 }}>
              {markers.map((m) => (
                <MarkerCard key={m.id} data={data} marker={m} />
              ))}
            </div>
          </section>
        )}
        <div className="pp-add">
          <span className="muted small">+ добавить:</span>
          {!show('people') && (
            <button className="pp-add-btn" onClick={() => setOpened((o) => new Set(o).add('people'))}>
              кто в сцене
            </button>
          )}
          {!show('lines') && (
            <button className="pp-add-btn" onClick={() => setOpened((o) => new Set(o).add('lines'))}>
              ветку
            </button>
          )}
          <button
            className="pp-add-btn"
            onClick={() => void createMarker(data.project.id, { title: 'Новый маячок', setupSceneId: scene.id, setupChapterId: scene.chapterId })}
          >
            маячок
          </button>
        </div>

        <details className="sheet-more">
          <summary>Ещё</summary>
          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
            <label className="sheet-where">
              <span className="field-label">Перенести в</span>
              <select className="select" value={inPool ? 'pool' : scene.chapterId} onChange={(e) => void place(e.target.value)}>
                <option value="pool">Пока без места</option>
                {data.chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            {canMerge && (
              <button
                className="btn"
                title="Эта сцена и все после неё в главе уходят в новую главу"
                onClick={async () => {
                  const at = data.chapters.findIndex((c) => c.id === scene.chapterId)
                  await splitChapterAt(scene.id, `Глава ${at + 2}`)
                  toast('Новая глава начинается с этой сцены. Название можно поменять на доске')
                }}
              >
                ✂ Новая глава отсюда
              </button>
            )}
            <label>
              <span className="field-label">Состояние</span>
              <select className="select" value={scene.status} onChange={(e) => set({ status: e.target.value as Scene['status'] })}>
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {canMerge && (
              <button
                className="btn"
                onClick={async () => {
                  if (!confirm('Склеить эту сцену с предыдущей? Текст станет одним.')) return
                  await mergeSceneIntoPrevious(scene.id)
                  toast('Сцены склеены')
                  onClose()
                }}
              >
                Склеить с предыдущей сценой
              </button>
            )}
            <button
              className="btn ghost"
              style={{ color: 'var(--mk-hanging)' }}
              onClick={async () => {
                if (!confirm(`Удалить «${sceneName(data, scene)}» вместе с текстом?`)) return
                await remove('scenes', scene.id)
                await remove('texts', scene.id)
                onClose()
              }}
            >
              Удалить сцену
            </button>
          </div>
        </details>
      </aside>
    </>
  )
}
