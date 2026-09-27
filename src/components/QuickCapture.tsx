import { useRef, useState } from 'react'
import type { NoteKind } from '../db/db'
import { createMarker, createNote } from '../db/repo'
import { sceneLabel, type ProjectData } from '../lib/hooks'
import { session } from '../lib/session'
import { NOTE_KINDS } from '../lib/status'
import { Modal, toast } from '../lib/ui'

type Kind = NoteKind | 'marker'

/**
 * One field, no folders, no tags. Enter saves and puts the author back where she was.
 * Sorting happens later, in the inbox.
 */
export function QuickCapture({ data, onClose }: { data: ProjectData; onClose: () => void }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<Kind>('idea')
  const sceneId = session.sceneId && data.sceneById.has(session.sceneId) ? session.sceneId : undefined
  const [attach, setAttach] = useState(!!sceneId)
  const input = useRef<HTMLTextAreaElement>(null)
  const pick = (k: Kind) => {
    setKind(k)
    input.current?.focus()
  }

  const saveIt = async () => {
    const t = text.trim()
    if (!t) return onClose()
    if (kind === 'marker') {
      await createMarker(data.project.id, { title: t, setupSceneId: attach ? sceneId : undefined })
      toast('Маячок сохранён — он не потеряется')
    } else {
      await createNote(t, kind, data.project.id, attach ? sceneId : undefined)
      toast(attach ? 'Сохранено к этой сцене' : 'Сохранено во «Входящие»')
    }
    onClose()
  }

  return (
    <Modal onClose={onClose} label="Быстрая запись">
      <div className="stack">
        <textarea
          ref={input}
          className="capture-text"
          autoFocus
          placeholder="Что пришло в голову?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void saveIt()
            }
          }}
        />
        <div className="seg" role="group" aria-label="Тип записи">
          {NOTE_KINDS.map((k) => (
            <button key={k.id} aria-pressed={kind === k.id} onClick={() => pick(k.id)}>
              {k.icon} {k.label}
            </button>
          ))}
          <button aria-pressed={kind === 'marker'} onClick={() => pick('marker')}>
            ✦ Маячок
          </button>
        </div>
        {sceneId && (
          <label className="row small muted">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            Привязать к сцене «{sceneLabel(data, sceneId)}»
          </label>
        )}
        <div className="row">
          <span className="small muted">Enter — сохранить · Shift+Enter — новая строка · Esc — закрыть</span>
          <span className="spacer" />
          <button className="btn primary" onClick={() => void saveIt()}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}
