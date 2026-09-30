import { useRef, useState } from 'react'
import type { Note, NoteKind } from '../db/db'
import { createMarker, createNote, findOrCreateCharacter, patch } from '../db/repo'
import { sceneName, type ProjectData } from '../lib/hooks'
import { isTouch, session } from '../lib/session'
import { Modal, toast } from '../lib/ui'

type Kind = NoteKind | 'marker'

const KINDS: { id: Kind; label: string }[] = [
  { id: 'idea', label: 'Мысль' },
  { id: 'quote', label: 'Цитата' },
  { id: 'dialogue', label: 'Диалог' },
  { id: 'question', label: 'Вопрос' },
  { id: 'marker', label: 'Маячок' },
]

/**
 * One field, no folders. Enter saves and puts the author back where she was.
 * Quotes and dialogues take the people they belong to — they surface later in chapters with those people.
 */
export function QuickCapture({ data, onClose }: { data: ProjectData; onClose: () => void }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<Kind>('idea')
  const [people, setPeople] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const sceneId = session.sceneId && data.sceneById.has(session.sceneId) ? session.sceneId : undefined
  const [attach, setAttach] = useState(!!sceneId)
  const input = useRef<HTMLTextAreaElement>(null)
  const pick = (k: Kind) => {
    setKind(k)
    input.current?.focus()
  }
  const withPeople = kind === 'quote' || kind === 'dialogue'

  const saveIt = async () => {
    const t = text.trim()
    if (!t) return onClose()
    const scene = attach ? sceneId : undefined
    if (kind === 'marker') {
      await createMarker(data.project.id, {
        title: t,
        setupSceneId: scene,
        setupChapterId: scene ? data.sceneById.get(scene)?.chapterId : undefined,
      })
      toast('Маячок сохранён — он не потеряется')
    } else {
      // A name typed but not confirmed with Enter still counts.
      const who = [...people]
      if (withPeople && newName.trim()) {
        const c = await findOrCreateCharacter(data.project.id, newName.trim())
        if (!who.includes(c.id)) who.push(c.id)
      }
      const n = await createNote(t, kind, data.project.id, withPeople ? undefined : scene)
      if (withPeople && who.length) await patch<Note>('notes', n.id, { characterIds: who })
      toast(withPeople && who.length ? 'Сохранено — всплывёт в главах с этими героями' : 'Сохранено во «Входящие»')
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
          placeholder={
            kind === 'quote'
              ? '«…» — чья-то реплика, которую жалко потерять'
              : kind === 'dialogue'
                ? '— Реплика\n— Ответ'
                : kind === 'marker'
                  ? 'Что потом обязательно раскрыть?'
                  : 'Что пришло в голову?'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && kind !== 'dialogue') {
              e.preventDefault()
              void saveIt()
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void saveIt()
            }
          }}
        />
        <div className="seg capture-kinds" role="group" aria-label="Что это — можно не выбирать">
          {KINDS.map((k) => (
            <button key={k.id} aria-pressed={kind === k.id} onClick={() => pick(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
        {withPeople && (
          <div className="chips">
            {data.characters.map((c) => {
              const on = people.includes(c.id)
              return (
                <button
                  key={c.id}
                  className={`ref-chip ${on ? 'on' : ''}`}
                  style={{ '--c': c.color } as React.CSSProperties}
                  onClick={() => {
                    setPeople(on ? people.filter((x) => x !== c.id) : [...people, c.id])
                    input.current?.focus()
                  }}
                >
                  <span className="dot" />
                  {c.name}
                </button>
              )
            })}
            <input
              className="ref-input"
              placeholder="+ герой"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter' || !newName.trim()) return
                e.preventDefault()
                const c = await findOrCreateCharacter(data.project.id, newName.trim())
                setPeople((p) => [...p, c.id])
                setNewName('')
                input.current?.focus()
              }}
            />
          </div>
        )}
        {sceneId && !withPeople && (
          <label className="row small muted">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            К сцене «{sceneName(data, data.sceneById.get(sceneId)!)}»
          </label>
        )}
        <div className="row">
          <span className="small muted">
            {isTouch() ? '' : kind === 'dialogue' ? '⌘/Ctrl+Enter — сохранить' : 'Enter — сохранить · Shift+Enter — новая строка'}
          </span>
          <span className="spacer" />
          <button className="btn primary" onClick={() => void saveIt()}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}
