import { useState } from 'react'
import { db, type Scene } from '../db/db'
import { heroesFromDescription } from '../lib/heroes'
import { pluralRu } from '../lib/text'
import type { Character, Note } from '../db/db'
import { createNote, findOrCreateCharacter, mergeCharacters, patch, remove } from '../db/repo'
import type { ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { InlineEdit, toast } from '../lib/ui'
import { WorldNav } from './LoreView'
import { ColorDot } from '../components/ColorDot'
import { useWhereFound, WhereFound } from '../components/WhereFound'
import type { Found } from '../lib/mentions'

/** People of the story: a few free lines about each, their own story line, their quotes. */
export function CharactersView({ data }: { data: ProjectData }) {
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(() =>
    typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches ? null : (data.characters[0]?.id ?? null),
  )
  const add = async () => {
    const entered = name.trim()
    if (!entered) return
    setName('')
    const alreadyExists = data.characters.some((character) => character.name.trim().toLocaleLowerCase('ru') === entered.toLocaleLowerCase('ru'))
    await findOrCreateCharacter(data.project.id, entered)
    if (alreadyExists) toast('Такой герой уже есть')
    setAdding(false)
  }
  const norm = (x: string) => x.trim().toLowerCase().replace(/ё/g, 'е')
  const known = new Set(data.characters.map((c) => norm(c.name)))
  const suggested = heroesFromDescription(data.project.description).filter((n) => !known.has(norm(n)))
  const found = useWhereFound(data)
  const active = activeId ? data.characterById.get(activeId) : undefined
  const roleOrder = { main: 0, supporting: 1, episodic: 2 } as const
  const characters = [...data.characters].sort((a, b) => ((a.role ? roleOrder[a.role] : 3) - (b.role ? roleOrder[b.role] : 3)) || a.order - b.order)

  return (
    <div>
      <div className="toolbar">
        <WorldNav current="characters" />
      </div>
      {suggested.length > 0 && (
        <div className="card suggest">
          <div>
            <strong>В описании истории нашлись герои:</strong> {suggested.join(', ')}
          </div>
          <button
            className="btn primary"
            onClick={async () => {
              for (const n of suggested) await findOrCreateCharacter(data.project.id, n)
              toast('Герои добавлены. Теперь можно найти, в каких сценах они есть')
            }}
          >
            Добавить их
          </button>
        </div>
      )}
      <div className={`characters-layout ${active ? 'has-active' : ''}`}>
        <section className="character-master card">
          <div className="character-list-head">
            <div>
              <h1>Герои</h1>
              <div className="small muted">{characters.length ? `${characters.length} ${pluralRu(characters.length, 'герой', 'героя', 'героев')}` : 'Пока никого'}</div>
            </div>
            <button className="icon-btn character-add-toggle" aria-label={adding ? 'Закрыть добавление героя' : 'Добавить героя'} onClick={() => setAdding((value) => !value)}>
              {adding ? '×' : '+'}
            </button>
          </div>
          {adding && <form
            className="person add person-add"
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
          >
            <input autoFocus className="quick-add" placeholder="Имя нового героя" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary sm compact-add" type="submit" disabled={!name.trim()} aria-label="Добавить">
              <span aria-hidden="true">+</span>
            </button>
          </form>}
          <div className="character-list">
            {characters.map((character) => (
              <HeroRow
                key={character.id}
                character={character}
                active={character.id === activeId}
                onOpen={() => setActiveId(character.id)}
              />
            ))}
          </div>
        </section>
        {active && (
          <section className="character-detail">
            <button className="hero-back btn ghost" onClick={() => setActiveId(null)}>← Все герои</button>
            <Person data={data} c={active} found={found?.get(active.id) ?? (found ? [] : undefined)} onDeleted={() => setActiveId(null)} />
          </section>
        )}
      </div>
    </div>
  )
}

const ROLE_LABELS: Record<NonNullable<Character['role']>, string> = {
  main: 'Главный',
  supporting: 'Второстепенный',
  episodic: 'Эпизодический',
}

function HeroRow({ character, active, onOpen }: { character: Character; active: boolean; onOpen: () => void }) {
  return (
    <button className={`hero-row ${active ? 'active' : ''}`} aria-pressed={active} onClick={onOpen}>
      <span className="hero-row-color" style={{ background: character.color }} />
      <span className="hero-row-main">
        <span className="hero-row-title"><strong>{character.name}</strong>{character.role && <span>{ROLE_LABELS[character.role]}</span>}</span>
      </span>
      <span className="hero-row-arrow" aria-hidden="true">›</span>
    </button>
  )
}

function Person({ data, c, found, onDeleted }: { data: ProjectData; c: Character; found?: Found[]; onDeleted?: () => void }) {
  const [quote, setQuote] = useState('')
  const line = data.lines.find((l) => l.name === c.name)
  const lines = data.notes.filter((n) => (n.kind === 'quote' || n.kind === 'dialogue') && n.characterIds?.includes(c.id) && !n.archived)
  const set = (changes: Partial<Character>) => void patch<Character>('characters', c.id, changes)
  // Scenes and quotes stay; they just no longer name this hero.
  const delHero = async () => {
    if (!confirm(`Удалить героя «${c.name}»? Сцены и цитаты останутся, с них снимется отметка.`)) return
    for (const s of [...data.scenes, ...data.pool.scenes])
      if (s.characterIds?.includes(c.id)) await patch<Scene>('scenes', s.id, { characterIds: s.characterIds.filter((x) => x !== c.id) })
    await remove('characters', c.id)
    onDeleted?.()
  }

  return (
    <article className="person card hero-profile">
      <div className="hero-identity">
        <ColorDot
          className="avatar"
          color={c.color}
          label={c.name}
          onChange={(color) => set({ color })}
        >
          {c.name.trim()[0]?.toUpperCase()}
        </ColorDot>
        <div className="hero-identity-main">
          <InlineEdit className="person-name" label="Имя героя" value={c.name} onSave={(name) => set({ name })} />
          <select className="hero-role-select" aria-label="Роль героя" value={c.role ?? ''} onChange={(event) => set({ role: (event.target.value || undefined) as Character['role'] })}>
            <option value="">Роль не выбрана</option>
            {(Object.entries(ROLE_LABELS) as [NonNullable<Character['role']>, string][]).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
          </select>
        </div>
      </div>
      <div className="hero-core">
        <span className="hero-section-label">Суть героя</span>
        <InlineEdit
          className="person-about"
          multiline
          placeholder="Чего хочет — и что ему мешает?"
          value={c.about}
          onSave={(about) => set({ about })}
        />
      </div>
      <section className="hero-in-story">
        <div className="hero-section-label">В истории</div>
        {line && <div className="hero-story-facts" style={{ color: line.color }}>● линия «{line.name}»</div>}
        <WhereFound data={data} found={found}
          onNotThis={(sid) => set({ ignoreSceneIds: [...(c.ignoreSceneIds ?? []), sid] })}
          onInclude={async (sid) => {
            await db.transaction('rw', db.scenes, db.outbox, db.meta, async () => {
              const scene = await db.scenes.get(sid)
              if (!scene || scene.deleted || scene.characterIds?.includes(c.id)) return
              await patch<Scene>('scenes', sid, { characterIds: [...(scene.characterIds ?? []), c.id] })
            })
          }}
        />
      </section>
      <details className="hero-fold">
        <summary><span>Имена и реплики</span><span className="small muted">{lines.length || ''}</span></summary>
        <div className="hero-fold-body">
          <InlineEdit className="aliases" value={c.aliases ?? ''} placeholder="Фамилия, прозвище, другие имена" onSave={(aliases) => set({ aliases: aliases.trim() || undefined })} />
          <div className="person-quotes">
            {lines.map((n) => <QuoteRow key={n.id} n={n} data={data} />)}
            <input
              className="quick-add small"
              placeholder="Новая цитата или реплика"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter' || !quote.trim()) return
                const n = await createNote(quote.trim(), 'quote', data.project.id)
                await patch<Note>('notes', n.id, { characterIds: [c.id] })
                setQuote('')
              }}
            />
          </div>
        </div>
      </details>
      <details className="hero-fold hero-settings">
        <summary>Настроить героя</summary>
        <div className="hero-fold-body stack">
          {data.characters.length > 1 && <label>
            <span className="field-label">Объединить с другим героем</span>
            <select className="select" defaultValue="" onChange={async (event) => {
              const target = data.characters.find((other) => other.id === event.target.value)
              if (!target) return
              event.currentTarget.value = ''
              if (!confirm(`Слить «${c.name}» в «${target.name}»? Сцены, цитаты и заметки перейдут к «${target.name}», карточка «${c.name}» исчезнет.`)) return
              await mergeCharacters(c.id, target.id)
              toast(`Теперь это один герой — «${target.name}»`)
            }}>
              <option value="">Выбрать…</option>
              {data.characters.filter((other) => other.id !== c.id).map((other) => <option key={other.id} value={other.id}>{other.name}</option>)}
            </select>
          </label>}
          <button className="btn ghost mobile-danger" onClick={() => void delHero()}>Удалить героя</button>
        </div>
      </details>
    </article>
  )
}

function QuoteRow({ n, data }: { n: Note; data: ProjectData }) {
  const where = n.sceneId ? data.sceneById.get(n.sceneId) : undefined
  return (
    <div className={`quote-row ${n.used ? 'used' : ''}`}>
      <span className="q">{n.kind === 'dialogue' ? '💬' : '❝'}</span>
      <span className="quote-text">{n.text}</span>
      {n.used && where ? (
        <button className="link small" onClick={() => go({ view: 'text', sceneId: where.id })}>
          в тексте
        </button>
      ) : (
        <button
          className="icon-btn"
          title={n.used ? 'Вернуть в неиспользованные' : 'Уже в тексте'}
          onClick={() => void patch<Note>('notes', n.id, { used: !n.used })}
        >
          {n.used ? '↩' : '✓'}
        </button>
      )}
    </div>
  )
}
