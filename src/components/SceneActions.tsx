import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Scene } from '../db/db'
import { deleteScene, duplicateScene, ensurePool, moveScene } from '../db/repo'
import { isLocked, sceneName, type ProjectData } from '../lib/hooks'
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
  const [pressing, setPressing] = useState(false)
  const clear = () => {
    clearTimeout(timer.current)
    timer.current = undefined
  }
  const actions = () => {
    clear()
    setPressing(false)
    suppressClick.current = true
    navigator.vibrate?.(12)
    onActions()
  }
  const down = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') return
    start.current = { x: event.clientX, y: event.clientY }
    setPressing(true)
    clear()
    timer.current = setTimeout(actions, 380)
  }
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!start.current) return
    if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 18) {
      clear()
      setPressing(false)
    }
  }
  const up = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clear()
    setPressing(false)
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
      className={`${className ?? ''} gesture-scene ${pressing ? 'gesture-pressing' : ''}`}
      aria-description={ariaDescription}
      aria-expanded={ariaExpanded}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        clear()
        setPressing(false)
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

/** Contextual actions stay next to their scene, so the author never loses what is being changed. */
export function SceneActions({ data, scene, onClose, onEdit }: { data: ProjectData; scene: Scene; onClose: () => void; onEdit?: () => void }) {
  const [moving, setMoving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    requestAnimationFrame(() => panel.current?.scrollIntoView({ block: 'center', behavior: 'auto' }))
  }, [])
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
    <div ref={panel} className="scene-action-panel" role="dialog" aria-label={`Действия со сценой «${sceneName(data, scene)}»`}>
      <div className="scene-action-context">
        <div>
          <strong>{sceneName(data, scene)}</strong>
          <span>{data.chapterById.get(scene.chapterId)?.title ?? 'Пока без места'}</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Закрыть действия" onClick={onClose}>×</button>
      </div>
      <div className="scene-action-list">
        {onEdit && <button onClick={() => { onClose(); onEdit() }}>Карточка сцены</button>}
        {locked ? (
          <div className="scene-action-note">Глава зафиксирована: перемещение отключено.</div>
        ) : (
          <>
          <button
            onClick={async () => {
              await undoable('дублирование сцены', () => duplicateScene(scene.id))
              onClose()
              toastUndo('Копия сцены создана рядом')
            }}
          >
            Дублировать
          </button>
          <button onClick={() => setMoving((value) => !value)} aria-expanded={moving}>
            {moving ? 'Скрыть главы' : 'Переместить'}
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
          {!inPool && <button onClick={() => void place('pool')}>Убрать из главы</button>}
          </>
        )}
        {!confirmDelete ? (
          <button className="danger" onClick={() => setConfirmDelete(true)}>Удалить сцену</button>
        ) : (
          <div className="scene-delete-confirm">
            <span>Удалить «{sceneName(data, scene)}» вместе с текстом?</span>
            <div>
              <button type="button" onClick={() => setConfirmDelete(false)}>Оставить</button>
              <button
                type="button"
                className="danger"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true)
                  try {
                    await undoable('удаление сцены', () => deleteScene(scene.id))
                    onClose()
                    toastUndo('Сцена удалена')
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                {deleting ? 'Удаляю…' : 'Удалить'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
