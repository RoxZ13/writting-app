import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Scene } from '../db/db'
import { duplicateScene, ensurePool, moveScene, remove } from '../db/repo'
import { isLocked, sceneName, type ProjectData } from '../lib/hooks'
import { Modal } from '../lib/ui'
import { toastUndo, undoable } from '../lib/undo'

/** A scene row stays visually quiet: familiar gestures reveal the actions when they are wanted. */
export function GestureActionButton({
  className,
  onOpen,
  onActions,
  ariaDescription,
  ariaExpanded,
  children,
}: {
  className?: string
  onOpen: () => void
  onActions: () => void
  ariaDescription: string
  ariaExpanded?: boolean
  children: ReactNode
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const clear = () => {
    clearTimeout(timer.current)
    timer.current = undefined
  }
  const actions = () => {
    suppressClick.current = true
    navigator.vibrate?.(12)
    onActions()
  }
  const down = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') return
    start.current = { x: event.clientX, y: event.clientY }
    clear()
    timer.current = setTimeout(actions, 430)
  }
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!start.current) return
    if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) clear()
  }
  const up = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clear()
    if (start.current) {
      const dx = event.clientX - start.current.x
      const dy = event.clientY - start.current.y
      if (dx < -56 && Math.abs(dx) > Math.abs(dy) * 1.25) actions()
    }
    start.current = null
  }
  return (
    <button
      type="button"
      className={`${className ?? ''} gesture-scene`}
      aria-description={ariaDescription}
      aria-expanded={ariaExpanded}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        clear()
        start.current = null
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        actions()
      }}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          actions()
        }
      }}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false
          event.preventDefault()
          return
        }
        onOpen()
      }}
    >
      {children}
    </button>
  )
}

export function SceneGestureButton(props: Omit<Parameters<typeof GestureActionButton>[0], 'ariaDescription'>) {
  return <GestureActionButton {...props} ariaDescription="Нажми, чтобы открыть. Зажми или смахни влево для действий" />
}

/** Telegram-like action sheet opened by hold, swipe, or right click — never by a permanent ellipsis. */
export function SceneActions({ data, scene, onClose }: { data: ProjectData; scene: Scene; onClose: () => void }) {
  const [moving, setMoving] = useState(false)
  const locked = isLocked(data, scene.chapterId)
  const inPool = scene.chapterId === data.pool.chapter?.id
  const place = async (target: string) => {
    if (target === scene.chapterId || (target === 'pool' && inPool)) return onClose()
    await undoable('перенос сцены', async () => {
      if (target === 'pool') await moveScene(scene.id, (await ensurePool(data.project.id)).id, data.pool.scenes.length)
      else await moveScene(scene.id, target, data.scenes.filter((item) => item.chapterId === target && item.id !== scene.id).length)
    })
    onClose()
    toastUndo(target === 'pool' ? 'Сцена убрана в «Пока без места»' : 'Сцена перенесена')
  }
  return (
    <Modal onClose={onClose} label={`Действия со сценой «${sceneName(data, scene)}»`} className="scene-action-sheet">
      <div className="scene-action-head">
        <div className="sheet-grab" />
        <h2>{sceneName(data, scene)}</h2>
        <div className="small muted">{data.chapterById.get(scene.chapterId)?.title ?? 'Пока без места'}</div>
      </div>
      {locked ? (
        <div className="scene-action-note">Глава зафиксирована. Сначала открепи её на доске.</div>
      ) : (
        <div className="scene-action-list">
          <button
            onClick={async () => {
              await undoable('дублирование сцены', () => duplicateScene(scene.id))
              onClose()
              toastUndo('Копия сцены создана рядом')
            }}
          >
            <span>Дублировать</span><span className="action-hint">копия рядом</span>
          </button>
          <button onClick={() => setMoving((value) => !value)} aria-expanded={moving}>
            <span>Переместить</span><span className="action-hint">{moving ? 'свернуть' : 'в другую главу'}</span>
          </button>
          {moving && (
            <div className="scene-move-list">
              {!inPool && <button onClick={() => void place('pool')}>Пока без места</button>}
              {data.chapters.map((chapter) => (
                <button key={chapter.id} disabled={chapter.id === scene.chapterId || chapter.locked} onClick={() => void place(chapter.id)}>
                  {chapter.title}{chapter.id === scene.chapterId ? ' · здесь' : chapter.locked ? ' · зафиксирована' : ''}
                </button>
              ))}
            </div>
          )}
          {!inPool && <button onClick={() => void place('pool')}><span>Убрать из плана</span><span className="action-hint">в «Пока без места»</span></button>}
          <button
            className="danger"
            onClick={async () => {
              await undoable('удаление сцены', async () => {
                await remove('scenes', scene.id)
                await remove('texts', scene.id)
              })
              onClose()
              toastUndo('Сцена удалена')
            }}
          >
            Удалить
          </button>
        </div>
      )}
    </Modal>
  )
}
