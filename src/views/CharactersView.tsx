import { useEffect, useState } from 'react'
import { db, type Scene } from '../db/db'
import { alive, save } from '../db/repo'
import { countMentions, heroesFromDescription, mentionPatterns } from '../lib/heroes'
import { docParagraphs } from '../lib/text'
import { Modal } from '../lib/ui'
import type { Character, Line, Note } from '../db/db'
import { createLine, createNote, findOrCreateCharacter, mergeCharacters, patch, remove } from '../db/repo'
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
  const add = async () => {
    if (!name.trim()) return
    await findOrCreateCharacter(data.project.id, name.trim())
    setName('')
  }
  const norm = (x: string) => x.trim().toLowerCase().replace(/ё/g, 'е')
  const known = new Set(data.characters.map((c) => norm(c.name)))
  const suggested = heroesFromDescription(data.project.description).filter((n) => !known.has(norm(n)))
  const [tagging, setTagging] = useState(false)
  const found = useWhereFound(data)

  return (
    <div>
      <div className="toolbar">
        <WorldNav current="characters" />
        <span className="spacer" />
        {data.characters.length > 0 && (
          <button className="btn" onClick={() => setTagging(true)}>
            Найти героев в сценах
          </button>
        )}
      </div>
      {suggested.length > 0 && (
        <div className="card suggest">
          <div>
            <strong>В описании книги нашлись герои:</strong> {suggested.join(', ')}
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
      {tagging && <TagScenes data={data} onClose={() => setTagging(false)} />}
      <div className="people">
        {data.characters.map((c) => (
          <Person key={c.id} data={data} c={c} found={found?.get(c.id) ?? (found ? [] : undefined)} />
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
      <Branches data={data} />
    </div>
  )
}

/** Story branches (the lines on the board): their colour, name and removal, next to the people. */
function Branches({ data }: { data: ProjectData }) {
  const [name, setName] = useState('')
  const count = (id: string) => [...data.scenes, ...data.pool.scenes].filter((s) => s.lineIds?.includes(id)).length
  const del = async (id: string, title: string) => {
    if (!confirm(`Удалить ветку «${title}»? Сцены останутся, с них просто снимется отметка.`)) return
    for (const s of [...data.scenes, ...data.pool.scenes])
      if (s.lineIds?.includes(id)) await patch<Scene>('scenes', s.id, { lineIds: s.lineIds.filter((x) => x !== id) })
    await remove('lines', id)
  }
  return (
    <section className="branches card">
      <h3>Сюжетные ветки</h3>
      {data.lines.map((l) => (
        <div key={l.id} className="branch-row">
          <ColorDot color={l.color} label={l.name} onChange={(color) => void patch<Line>('lines', l.id, { color })} />
          <InlineEdit className="branch-name" value={l.name} onSave={(n) => n.trim() && void patch<Line>('lines', l.id, { name: n.trim() })} />
          <span className="small muted">{count(l.id)} сц.</span>
          <button className="icon-btn" aria-label={`Удалить ветку «${l.name}»`} title="Удалить ветку" onClick={() => void del(l.id, l.name)}>
            ×
          </button>
        </div>
      ))}
      <input
        className="quick-add"
        placeholder="+ ветка — например, линия второго героя"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key !== 'Enter' || !name.trim()) return
          await createLine(data.project.id, name.trim())
          setName('')
        }}
      />
    </section>
  )
}

function Person({ data, c, found }: { data: ProjectData; c: Character; found?: Found[] }) {
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
  }

  return (
    <article className="person card">
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <ColorDot
          className="avatar"
          color={c.color}
          label={c.name}
          onChange={(color) => {
            set({ color })
            // The hero's own branch follows the hero's colour.
            if (line) void patch<Line>('lines', line.id, { color })
          }}
        >
          {c.name.trim()[0]?.toUpperCase()}
        </ColorDot>
        <InlineEdit className="person-name" value={c.name} onSave={(name) => set({ name })} />
        <details className="menu">
          <summary className="icon-btn" aria-label="Действия">
            ⋯
          </summary>
          <div className="menu-list card">
            {data.characters.length > 1 && <div className="menu-label">Это тот же человек, что…</div>}
            {data.characters
              .filter((o) => o.id !== c.id)
              .map((o) => (
                <button
                  key={o.id}
                  onClick={async () => {
                    if (!confirm(`Слить «${c.name}» в «${o.name}»? Сцены, цитаты и заметки перейдут к «${o.name}», карточка «${c.name}» исчезнет.`)) return
                    await mergeCharacters(c.id, o.id)
                    toast(`Теперь это один герой — «${o.name}»`)
                  }}
                >
                  ⇢ {o.name}
                </button>
              ))}
            <button className="danger" onClick={() => void delHero()}>
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
      <InlineEdit className="aliases" value={c.aliases ?? ''} placeholder="другие имена: фамилия, прозвище…" onSave={(aliases) => set({ aliases: aliases.trim() || undefined })} />
      <WhereFound data={data} found={found} onNotThis={(sid) => set({ ignoreSceneIds: [...(c.ignoreSceneIds ?? []), sid] })} />
      <div className="person-meta">
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
      <button className="link small muted person-delete" onClick={() => void delHero()}>
        удалить героя
      </button>
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

/** Look through the whole book and mark each scene with the heroes who appear in it. */
function TagScenes({ data, onClose }: { data: ProjectData; onClose: () => void }) {
  const [found, setFound] = useState<Map<string, string[]> | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set(data.characters.map((c) => c.id)))

  useEffect(() => {
    void (async () => {
      const patterns = mentionPatterns(data.characters)
      const texts = alive(await db.texts.where('projectId').equals(data.project.id).toArray())
      const map = new Map<string, string[]>()
      for (const t of texts) {
        if (!data.sceneById.has(t.id)) continue
        const plain = docParagraphs(t.content).join('\n')
        for (const [cid, re] of patterns) {
          // Two mentions or more: a name dropped once in passing does not make someone part of the scene.
          if (countMentions(plain, re) >= 2) map.set(cid, [...(map.get(cid) ?? []), t.id])
        }
      }
      setFound(map)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = async () => {
    if (!found) return
    const add = new Map<string, Set<string>>()
    for (const [cid, scenes] of found) if (picked.has(cid)) for (const sid of scenes) add.set(sid, (add.get(sid) ?? new Set()).add(cid))
    for (const [sid, ids] of add) {
      const s = await db.scenes.get(sid)
      if (!s) continue
      const next = [...new Set([...(s.characterIds ?? []), ...ids])]
      if (next.length !== (s.characterIds ?? []).length) await save<Scene>('scenes', { ...s, characterIds: next })
    }
    toast(`Отмечено в ${add.size} сценах`)
    onClose()
  }

  return (
    <Modal onClose={onClose} label="Найти героев в сценах">
      <div className="stack">
        <h2>Где кто появляется</h2>
        {!found ? (
          <div className="muted">Читаю книгу…</div>
        ) : (
          <>
            <div className="small muted">Сцена отмечается, если имя встречается в ней хотя бы дважды. Уже отмеченное не снимается.</div>
            {data.characters.map((c) => (
              <label key={c.id} className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={picked.has(c.id)}
                  onChange={(e) => {
                    const next = new Set(picked)
                    if (e.target.checked) next.add(c.id)
                    else next.delete(c.id)
                    setPicked(next)
                  }}
                />
                <span className="avatar small" style={{ background: c.color }}>
                  {c.name.trim()[0]?.toUpperCase()}
                </span>
                <span style={{ flex: 1 }}>{c.name}</span>
                <span className="muted small">{found.get(c.id)?.length ?? 0} сц.</span>
              </label>
            ))}
            <div className="row">
              <span className="spacer" />
              <button className="btn ghost" onClick={onClose}>
                Отмена
              </button>
              <button className="btn primary" onClick={() => void apply()}>
                Отметить
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
