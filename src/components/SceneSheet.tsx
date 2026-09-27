import { useEffect, useState } from 'react'
import type { Scene } from '../db/db'
import { createMarker, mergeSceneIntoPrevious, patch, remove } from '../db/repo'
import { go } from '../lib/router'
import type { ProjectData } from '../lib/hooks'
import { STATUSES } from '../lib/status'
import { toast } from '../lib/ui'
import { MarkerCard } from './MarkerCard'
import { RefChips } from './Refs'

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
  const siblings = data.scenes.filter((s) => s.chapterId === scene.chapterId)
  const canMerge = siblings.indexOf(scene) > 0

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
          placeholder="Название сцены"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== scene.title && set({ title })}
        />
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

        <section className="sheet-section">
          <h3>Ветки</h3>
          <RefChips data={data} sceneId={scene.id} field="lineIds" selected={scene.lineIds ?? []} />
        </section>
        <section className="sheet-section">
          <h3>Герои в сцене</h3>
          <RefChips data={data} sceneId={scene.id} field="characterIds" selected={scene.characterIds ?? []} />
        </section>
        <section className="sheet-section">
          <h3>Маячки</h3>
          <div className="stack" style={{ gap: 8 }}>
            {markers.map((m) => (
              <MarkerCard key={m.id} data={data} marker={m} />
            ))}
            <button
              className="btn sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => void createMarker(data.project.id, { title: 'Новый маячок', setupSceneId: scene.id, setupChapterId: scene.chapterId })}
            >
              + маячок в этой сцене
            </button>
          </div>
        </section>

        <details className="sheet-more">
          <summary>Ещё</summary>
          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
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
                if (!confirm(`Удалить сцену «${scene.title}» вместе с текстом?`)) return
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
