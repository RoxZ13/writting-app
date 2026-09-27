import { useState } from 'react'
import type { Character, Note } from '../db/db'
import { createCharacter, createLine, createNote, patch, remove } from '../db/repo'
import type { ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { InlineEdit, toast } from '../lib/ui'

/** People of the story: a few free lines about each, their own story line, their quotes. */
export function CharactersView({ data }: { data: ProjectData }) {
  const [name, setName] = useState('')
  const add = async () => {
    if (!name.trim()) return
    await createCharacter(data.project.id, name.trim())
    setName('')
  }
  return (
    <div>
      <div className="toolbar">
        <h1 style={{ marginRight: 'auto' }}>Герои</h1>
      </div>
      <div className="people">
        {data.characters.map((c) => (
          <Person key={c.id} data={data} c={c} />
        ))}
        <div className="person add">
          <input
            className="quick-add"
            placeholder="+ Новый герой"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <p className="small muted" style={{ margin: '4px 12px' }}>
            Отмечай героев в сценах — тогда в главах, где они есть, всплывут их неиспользованные цитаты и диалоги.
          </p>
        </div>
      </div>
    </div>
  )
}

function Person({ data, c }: { data: ProjectData; c: Character }) {
  const [quote, setQuote] = useState('')
  const scenes = data.scenes.filter((s) => s.characterIds?.includes(c.id))
  const line = data.lines.find((l) => l.name === c.name)
  const lines = data.notes.filter((n) => (n.kind === 'quote' || n.kind === 'dialogue') && n.characterIds?.includes(c.id) && !n.archived)
  const set = (changes: Partial<Character>) => void patch<Character>('characters', c.id, changes)

  return (
    <article className="person card">
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <span className="avatar" style={{ background: c.color }}>
          {c.name.trim()[0]?.toUpperCase()}
        </span>
        <InlineEdit className="person-name" value={c.name} onSave={(name) => set({ name })} />
        <details className="menu">
          <summary className="icon-btn" aria-label="Действия">
            ⋯
          </summary>
          <div className="menu-list card">
            <button className="danger" onClick={() => confirm(`Удалить героя «${c.name}»?`) && void remove('characters', c.id)}>
              Удалить героя
            </button>
          </div>
        </details>
      </div>
      <InlineEdit
        className="person-about"
        multiline
        placeholder="Кто это, чего хочет, что скрывает…"
        value={c.about}
        onSave={(about) => set({ about })}
      />
      <div className="person-meta">
        <span>{scenes.length ? `в ${scenes.length} сц.` : 'пока ни в одной сцене'}</span>
        {line ? (
          <span className="chip" style={{ color: line.color }}>
            ● ветка «{line.name}»
          </span>
        ) : (
          <button
            className="link small"
            onClick={async () => {
              await createLine(data.project.id, c.name)
              toast(`Ветка «${c.name}» создана — отмечай её сцены на доске`)
            }}
          >
            + своя сюжетная ветка
          </button>
        )}
      </div>
      <div className="person-quotes">
        {lines.map((n) => (
          <QuoteRow key={n.id} n={n} data={data} />
        ))}
        <input
          className="quick-add small"
          placeholder="+ цитата или реплика"
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
