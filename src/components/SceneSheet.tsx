import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Scene } from '../db/db'
import { createMarker, deleteScene as deleteSceneRecord, ensurePool, mergeSceneIntoPrevious, moveScene, patch, splitChapterAt } from '../db/repo'
import { go } from '../lib/router'
import { modalRoot, useModal } from '../lib/ui'
import { isLocked, sceneName, type ProjectData } from '../lib/hooks'
import { STATUSES } from '../lib/status'
import { toastUndo, undoable } from '../lib/undo'
import { MarkerCard } from './MarkerCard'
import { RefChips } from './Refs'
import { Icon } from './Icon'

/** Quick edit of a scene from the board: what happens, lines, people, markers. No editor needed. */
export function SceneSheet({ data, scene, onClose }: { data: ProjectData; scene: Scene; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  useModal(sheetRef)
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

  const set = (changes: Partial<Scene>, label: string) => void undoable(label, () => patch<Scene>('scenes', scene.id, changes))
  const markers = data.markers.filter((m) => m.setupSceneId === scene.id || m.payoffSceneId === scene.id)
  const inPool = scene.chapterId === data.pool.chapter?.id
  const siblings = inPool ? data.pool.scenes : data.scenes.filter((s) => s.chapterId === scene.chapterId)
  const locked = isLocked(data, scene.chapterId)
  const canMerge = !inPool && !locked && siblings.indexOf(scene) > 0
  // No dragging on a phone: there the way to move a scene is right in sight, not under «Ещё».
  const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches
  const selectedLines = (scene.lineIds ?? []).map((id) => data.lineById.get(id)?.name).filter(Boolean)
  const selectedPeople = (scene.characterIds ?? []).map((id) => data.characterById.get(id)?.name).filter(Boolean)
  const where = (
    <label className="sheet-where">
      <span className="field-label">{phone ? 'Где стоит' : 'Перенести в'}</span>
      <select className="select" value={inPool ? 'pool' : scene.chapterId} disabled={locked} onChange={(e) => void place(e.target.value)}>
        <option value="pool">Пока без места</option>
        {data.chapters.map((c) => (
          <option key={c.id} value={c.id} disabled={c.locked && c.id !== scene.chapterId}>
            {c.title}
            {c.locked ? ' · зафиксирована' : ''}
          </option>
        ))}
      </select>
      {locked && <span className="small muted">Глава зафиксирована</span>}
    </label>
  )
  const plotControls = (
    <div className="sheet-plot">
      <div className="seg" role="group" aria-label="Темп сцены">
        {(
          [
            ['calm', 'Спокойная'],
            ['tense', 'Напряжённая'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} aria-pressed={scene.tempo === v} onClick={() => set({ tempo: scene.tempo === v ? undefined : v }, 'темп сцены')}>
            {label}
          </button>
        ))}
      </div>
      <button className={`chip-toggle sm ${scene.node ? 'on' : ''}`} onClick={() => set({ node: scene.node ? undefined : true }, 'отметка «Ключевая»')}>
        Ключевая
      </button>
    </div>
  )
  const place = async (to: string) => {
    if (to === 'pool') {
      await undoable('перенос сцены', async () => moveScene(scene.id, (await ensurePool(data.project.id)).id, data.pool.scenes.length))
      toastUndo('Сцена в «Пока без места»')
    } else {
      await undoable('перенос сцены', () => moveScene(scene.id, to, data.scenes.filter((s) => s.chapterId === to && s.id !== scene.id).length))
      toastUndo(`Сцена перенесена в «${data.chapterById.get(to)?.title}»`)
    }
  }
  const deleteScene = async () => {
    if (!confirm(`Удалить «${sceneName(data, scene)}» вместе с текстом?`)) return
    await undoable('удаление сцены', () => deleteSceneRecord(scene.id))
    onClose()
    toastUndo('Сцена удалена')
  }

  return createPortal(
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Сцена" tabIndex={-1} ref={sheetRef}>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="eyebrow">{data.chapterById.get(scene.chapterId)?.title}</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={15} />
          </button>
        </div>
        <input
          className="sheet-title"
          value={title}
          placeholder={sceneName(data, scene)}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== scene.title && set({ title }, 'название сцены')}
        />
        {scene.epigraph && <div className="card-epigraph">♪ {scene.epigraph}</div>}
        {scene.excerpt && <div className="card-excerpt">{scene.excerpt}</div>}
        <textarea
          className="textarea"
          rows={3}
          placeholder="Кратко: что происходит, что меняется"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onBlur={() => goal !== scene.goal && set({ goal }, 'описание сцены')}
        />
        <button className="btn primary" onClick={() => go({ view: 'write', sceneId: scene.id })}>
          Писать эту сцену →
        </button>
        {phone && where}
        {!phone && plotControls}

        <details className="sheet-section sheet-ref-fold">
          <summary><span>Линии</span><span className="small muted">{selectedLines.join(', ') || 'Не выбраны'}</span></summary>
          <div className="sheet-fold-body">
            <RefChips data={data} sceneId={scene.id} field="lineIds" selected={scene.lineIds ?? []} />
          </div>
        </details>
        <details className="sheet-section sheet-ref-fold">
          <summary><span>Герои</span><span className="small muted">{selectedPeople.join(', ') || 'Не выбраны'}</span></summary>
          <div className="sheet-fold-body">
            <RefChips data={data} sceneId={scene.id} field="characterIds" selected={scene.characterIds ?? []} />
          </div>
        </details>
        {markers.length > 0 && (
          <details className="sheet-section sheet-ref-fold">
            <summary><span>Маячки</span><span className="small muted">{markers.length}</span></summary>
            <div className="stack sheet-fold-body" style={{ gap: 8 }}>
              {markers.map((m) => (
                <MarkerCard key={m.id} data={data} marker={m} />
              ))}
            </div>
          </details>
        )}

        <details className="sheet-more">
          <summary>Ещё</summary>
          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
            {!phone && where}
            {phone && plotControls}
            <button
              className="btn"
              onClick={() =>
                void undoable('новый маячок', () => createMarker(data.project.id, { title: 'Новый маячок', setupSceneId: scene.id, setupChapterId: scene.chapterId }))
              }
            >
              Добавить маячок
            </button>
            {canMerge && (
              <button
                className="btn"
                title="Эта сцена и все после неё в главе уходят в новую главу"
                onClick={async () => {
                  const at = data.chapters.findIndex((c) => c.id === scene.chapterId)
                  await undoable('новая глава с этой сцены', () => splitChapterAt(scene.id, `Глава ${at + 2}`))
                  toastUndo('Новая глава начинается с этой сцены. Название можно поменять на доске')
                }}
              >
                ✂ Новая глава отсюда
              </button>
            )}
            <label>
              <span className="field-label">Состояние</span>
              <select className="select" value={scene.status} onChange={(e) => set({ status: e.target.value as Scene['status'] }, 'состояние сцены')}>
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
                  await undoable('склейка сцен', () => mergeSceneIntoPrevious(scene.id))
                  toastUndo('Сцены склеены')
                  onClose()
                }}
              >
                Склеить с предыдущей сценой
              </button>
            )}
            <button
              className="btn ghost"
              style={{ color: 'var(--danger-ink)' }}
              onClick={() => void deleteScene()}
            >
              Удалить сцену
            </button>
          </div>
        </details>
      </div>
    </>,
    modalRoot(),
  )
}
