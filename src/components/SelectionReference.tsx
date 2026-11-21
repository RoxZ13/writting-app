import { useState } from 'react'
import { db, type Scene } from '../db/db'
import { createNote, findOrCreateCharacter, patch } from '../db/repo'
import type { ProjectData } from '../lib/hooks'
import { Modal, toast } from '../lib/ui'
import type { SelectionAction } from './SceneEditor'

type Choice = Exclude<SelectionAction['kind'], 'reference'> | 'stash'

export function SelectionReference({ data, scene, text, onChoose, onClose }: {
  data: ProjectData
  scene: Scene
  text: string
  onChoose: (choice: Choice) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'menu' | 'hero' | 'detail'>('menu')
  const [name, setName] = useState(text.trim().slice(0, 100))
  const [hero, setHero] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (busy || (mode === 'hero' ? !name.trim() : !hero)) return
    setBusy(true)
    try {
      if (mode === 'hero') {
        const character = await findOrCreateCharacter(data.project.id, name.trim())
        await db.transaction('rw', db.scenes, db.outbox, db.meta, async () => {
          const current = await db.scenes.get(scene.id)
          if (!current || current.deleted || current.characterIds?.includes(character.id)) return
          await patch<Scene>('scenes', scene.id, { characterIds: [...(current.characterIds ?? []), character.id] })
        })
        toast(`«${character.name}» в составе сцены`)
      } else {
        await createNote(text, 'note', data.project.id, scene.id, { characterIds: [hero] })
        toast(`Деталь сохранена у героя «${data.characterById.get(hero)?.name ?? ''}»`)
      }
      onClose()
    } catch {
      toast('Не удалось сохранить. Попробуй ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal label="Добавить из текста" onClose={onClose} className="selection-reference">
      <h2>Добавить из текста</h2>
      <p className="selection-reference-quote">{text}</p>
      {mode === 'menu' ? <div className="stack">
        <button className="btn" onClick={() => onChoose('comment')}>Заметку на полях</button>
        <button className="btn" onClick={() => setMode('hero')}>Героя</button>
        {data.characters.length > 0 && <button className="btn" onClick={() => setMode('detail')}>Деталь о герое</button>}
        <button className="btn" onClick={() => onChoose('setup')}>Маячок</button>
        <details>
          <summary>Другие действия</summary>
          <div className="stack">
            <button className="btn" onClick={() => onChoose('payoff')}>Отметить раскрытие</button>
            <button className="btn" onClick={() => onChoose('stash')}>В запас</button>
          </div>
        </details>
      </div> : <form className="stack" onSubmit={(event) => { event.preventDefault(); void save() }}>
        {mode === 'hero'
          ? <label>Имя героя<input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label>
          : <label>Чья это деталь<select className="input" value={hero} onChange={(event) => setHero(event.target.value)}>
            <option value="">Выбрать героя</option>
            {data.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
          </select></label>}
        <button className="btn primary" disabled={busy || !(mode === 'hero' ? name.trim() : hero)}>Сохранить</button>
      </form>}
    </Modal>
  )
}
