import { useState } from 'react'
import type { Note } from '../db/db'
import { createNote, patch, remove } from '../db/repo'
import type { ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { sceneName } from '../lib/hooks'
import { useWhereFound, WhereFound } from '../components/WhereFound'
import type { Found } from '../lib/mentions'
import { InlineEdit, toast } from '../lib/ui'
import { Icon } from '../components/Icon'
import { pluralRu } from '../lib/text'

/** "Герои · Матчасть": two sides of the same world, one tab. */
export function WorldNav({ current }: { current: 'characters' | 'lore' }) {
  return (
    <div className="seg world-nav">
      <button aria-pressed={current === 'characters'} onClick={() => go({ view: 'characters' })}>
        Герои
      </button>
      <button aria-pressed={current === 'lore'} onClick={() => go({ view: 'lore' })}>
        Мир
      </button>
    </div>
  )
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')

/** Facts of the story's world: places, magic, dates, who knows what. They surface in the plan of scenes that mention them. */
export function LoreView({ data }: { data: ProjectData }) {
  const [q, setQ] = useState('')
  const [topic, setTopic] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const found = useWhereFound(data)
  const topics = [...new Set(data.lore.map((n) => n.topic?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'ru'))
  const shown = data.lore.filter(
    (n) => (!topic || n.topic?.trim() === topic) && (!q || norm(`${n.title} ${n.text} ${n.topic}`).includes(norm(q))),
  )

  const add = async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    const n = await createNote('', 'lore', data.project.id)
    await patch<Note>('notes', n.id, { title, topic: topic ?? undefined })
    setAdding(false)
  }

  const active = activeId ? data.lore.find((note) => note.id === activeId) : undefined

  return (
    <div>
      <div className="toolbar">
        <WorldNav current="lore" />
      </div>
      <div className={`lore-layout ${active ? 'has-active' : ''}`}>
        <section className="lore-master card">
          <div className="lore-master-head">
            <div>
              <h1>Мир истории</h1>
              <div className="small muted">
                {data.lore.length ? `${data.lore.length} ${pluralRu(data.lore.length, 'запись', 'записи', 'записей')}` : 'Пока пусто'}
              </div>
            </div>
            <button className="icon-btn lore-add-toggle" aria-label={adding ? 'Закрыть добавление записи' : 'Добавить запись'} onClick={() => setAdding((value) => !value)}>{adding ? '×' : '+'}</button>
          </div>
          {adding && <form className="lore-add" onSubmit={(e) => { e.preventDefault(); void add() }}>
            <input
              autoFocus
              className="quick-add"
              placeholder={topic ? `Новая запись в «${topic}»` : 'Новая запись'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn primary sm compact-add" type="submit" disabled={!draft.trim()} aria-label="Добавить">
              <span aria-hidden="true">+</span>
            </button>
          </form>}
          {data.lore.length > 4 && <input className="input lore-search" placeholder="Найти запись" value={q} onChange={(e) => setQ(e.target.value)} />}
          {topics.length > 0 && (
            <div className="lore-topics">
              <button className={`chip-toggle ${topic === null ? 'on' : ''}`} onClick={() => setTopic(null)}>Всё</button>
              {topics.map((t) => (
                <button key={t} className={`chip-toggle ${topic === t ? 'on' : ''}`} onClick={() => setTopic(topic === t ? null : t)}>{t}</button>
              ))}
            </div>
          )}
          <div className="lore-list">
            {shown.map((n) => (
              <button key={n.id} className={`lore-row ${activeId === n.id ? 'active' : ''}`} onClick={() => setActiveId(n.id)}>
                <span><strong>{n.title || 'Без названия'}</strong>{n.topic && <small>{n.topic}</small>}</span><span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
        {active && (
          <section className="lore-detail">
            <button className="lore-back btn ghost" onClick={() => setActiveId(null)}>← Все записи</button>
            <LoreCard n={active} data={data} found={found?.get(active.id) ?? (found ? [] : undefined)} onDeleted={() => setActiveId(null)} />
          </section>
        )}
      </div>
    </div>
  )
}

function LoreCard({ n, data, found, onDeleted }: { n: Note; data: ProjectData; found?: Found[]; onDeleted?: () => void }) {
  const set = (changes: Partial<Note>) => void patch<Note>('notes', n.id, changes)
  const removeNote = () => {
    if (!confirm(`Удалить «${n.title}» из мира?`)) return
    void remove('notes', n.id)
    onDeleted?.()
    toast('Запись удалена')
  }
  return (
    <article className="card lore-card lore-profile">
      <header className="lore-identity">
        <InlineEdit className="lore-title" value={n.title ?? ''} placeholder="Название" onSave={(title) => title.trim() && set({ title })} />
        <InlineEdit className="lore-topic" value={n.topic ?? ''} placeholder="Тема: место, правило, событие" onSave={(topic) => set({ topic: topic.trim() || undefined })} />
      </header>
      <div className="lore-core">
        <span className="hero-section-label">Что важно</span>
        <InlineEdit className="lore-text" multiline value={n.text} placeholder="Запишите главное об этом элементе мира" onSave={(text) => set({ text })} />
      </div>
      <details className="hero-fold lore-fold">
        <summary>Связи и упоминания</summary>
        <div className="hero-fold-body stack">
          <InlineEdit className="aliases" value={n.aliases ?? ''} placeholder="Другие названия" onSave={(aliases) => set({ aliases: aliases.trim() || undefined })} />
          <LorePins n={n} data={data} />
          {!!found?.length && <WhereFound data={data} found={found} onNotThis={(sid) => set({ ignoreSceneIds: [...(n.ignoreSceneIds ?? []), sid] })} />}
        </div>
      </details>
      <details className="hero-fold lore-fold">
        <summary>Настроить запись</summary>
        <div className="hero-fold-body"><button className="btn ghost mobile-danger" onClick={removeNote}>Удалить запись</button></div>
      </details>
    </article>
  )
}

/** Where this entry is needed: heroes, chapters, scenes. It then shows up in the plan of those scenes. */
function LorePins({ n, data }: { n: Note; data: ProjectData }) {
  const heroes = (n.characterIds ?? []).map((id) => data.characterById.get(id)).filter(Boolean)
  const chapters = (n.chapterIds ?? []).map((id) => data.chapterById.get(id)).filter(Boolean)
  const scenes = (n.sceneIds ?? []).map((id) => data.sceneById.get(id)).filter(Boolean)
  const drop = (field: 'characterIds' | 'chapterIds' | 'sceneIds', id: string) =>
    void patch<Note>('notes', n.id, { [field]: (n[field] ?? []).filter((x) => x !== id) })
  const add = (value: string) => {
    const [kind, id] = value.split(':')
    const field = kind === 'h' ? 'characterIds' : kind === 'c' ? 'chapterIds' : 'sceneIds'
    void patch<Note>('notes', n.id, { [field]: [...new Set([...(n[field] ?? []), id])] })
  }
  return (
    <div className="lore-pins">
      {heroes.map((h) => (
        <span key={h!.id} className="lore-pin">
          {h!.name}
          <button aria-label="Открепить" onClick={() => drop('characterIds', h!.id)}>
            <Icon name="close" size={15} />
          </button>
        </span>
      ))}
      {chapters.map((c) => (
        <span key={c!.id} className="lore-pin">
          {c!.title}
          <button aria-label="Открепить" onClick={() => drop('chapterIds', c!.id)}>
            <Icon name="close" size={15} />
          </button>
        </span>
      ))}
      {scenes.map((s) => (
        <span key={s!.id} className="lore-pin">
          {data.chapterById.get(s!.chapterId)?.title} · {sceneName(data, s!)}
          <button aria-label="Открепить" onClick={() => drop('sceneIds', s!.id)}>
            <Icon name="close" size={15} />
          </button>
        </span>
      ))}
      <select className="lore-pin-add" aria-label="Прикрепить запись" value="" onChange={(e) => e.target.value && add(e.target.value)} title="Прикрепить к герою, главе или сцене — запись появится в плане этих сцен">
        <option value="">+ где нужно</option>
        {data.characters.length > 0 && (
          <optgroup label="Герой">
            {data.characters.map((c) => (
              <option key={c.id} value={`h:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Глава целиком">
          {data.chapters.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              {c.title}
            </option>
          ))}
        </optgroup>
        {data.outline.map(({ chapter, scenes: list }) =>
          list.length ? (
            <optgroup key={chapter.id} label={`Сцены: ${chapter.title}`}>
              {list.map((s) => (
                <option key={s.id} value={`s:${s.id}`}>
                  {sceneName(data, s)}
                  {s.goal ? ` — ${s.goal.slice(0, 40)}` : ''}
                </option>
              ))}
            </optgroup>
          ) : null,
        )}
      </select>
    </div>
  )
}
