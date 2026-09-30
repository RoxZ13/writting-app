import { useState } from 'react'
import type { Note } from '../db/db'
import { createNote, patch, remove } from '../db/repo'
import type { ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { sceneName } from '../lib/hooks'
import { useWhereFound, WhereFound } from '../components/WhereFound'
import type { Found } from '../lib/mentions'
import { InlineEdit, toast } from '../lib/ui'

/** "Герои · Матчасть": two sides of the same world, one tab. */
export function WorldNav({ current }: { current: 'characters' | 'lore' }) {
  return (
    <div className="seg world-nav">
      <button aria-pressed={current === 'characters'} onClick={() => go({ view: 'characters' })}>
        Герои
      </button>
      <button aria-pressed={current === 'lore'} onClick={() => go({ view: 'lore' })}>
        Матчасть
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
  }

  return (
    <div>
      <div className="toolbar">
        <WorldNav current="lore" />
        <span className="spacer" />
        <input className="input lore-search" placeholder="Найти в матчасти" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Места, магия, даты, кто что знает. Где запись встречается в тексте — видно в карточке. Прикрепи к герою, главе или сцене («+ где нужно») — она будет в плане этих сцен.
      </p>
      {topics.length > 0 && (
        <div className="row lore-topics">
          <button className={`chip-toggle ${topic === null ? 'on' : ''}`} onClick={() => setTopic(null)}>
            Всё
          </button>
          {topics.map((t) => (
            <button key={t} className={`chip-toggle ${topic === t ? 'on' : ''}`} onClick={() => setTopic(topic === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <input
        className="quick-add lore-add"
        placeholder={topic ? `+ запись в «${topic}»: название` : '+ запись: название — место, заклинание, событие…'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void add()}
      />
      <div className="lore-grid">
        {shown.map((n) => (
          <LoreCard key={n.id} n={n} data={data} found={found?.get(n.id) ?? (found ? [] : undefined)} />
        ))}
      </div>
      {!data.lore.length && <div className="empty">Пока пусто. Начни с того, что чаще всего приходится проверять.</div>}
    </div>
  )
}

function LoreCard({ n, data, found }: { n: Note; data: ProjectData; found?: Found[] }) {
  const set = (changes: Partial<Note>) => void patch<Note>('notes', n.id, changes)
  return (
    <article className="card lore-card">
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <InlineEdit className="lore-title" value={n.title ?? ''} placeholder="Название" onSave={(title) => title.trim() && set({ title })} />
        <button
          className="icon-btn"
          title="Удалить запись"
          onClick={() => {
            if (!confirm(`Удалить «${n.title}» из матчасти?`)) return
            void remove('notes', n.id)
            toast('Запись удалена')
          }}
        >
          ×
        </button>
      </div>
      <InlineEdit className="lore-topic" value={n.topic ?? ''} placeholder="тема: места, магия, даты…" onSave={(topic) => set({ topic: topic.trim() || undefined })} />
      <InlineEdit className="lore-text" multiline value={n.text} placeholder="Что важно помнить" onSave={(text) => set({ text })} />
      <InlineEdit className="aliases" value={n.aliases ?? ''} placeholder="ещё называют: …" onSave={(aliases) => set({ aliases: aliases.trim() || undefined })} />
      <LorePins n={n} data={data} />
      <WhereFound data={data} found={found} onNotThis={(sid) => set({ ignoreSceneIds: [...(n.ignoreSceneIds ?? []), sid] })} />
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
            ×
          </button>
        </span>
      ))}
      {chapters.map((c) => (
        <span key={c!.id} className="lore-pin">
          {c!.title}
          <button aria-label="Открепить" onClick={() => drop('chapterIds', c!.id)}>
            ×
          </button>
        </span>
      ))}
      {scenes.map((s) => (
        <span key={s!.id} className="lore-pin">
          {data.chapterById.get(s!.chapterId)?.title} · {sceneName(data, s!)}
          <button aria-label="Открепить" onClick={() => drop('sceneIds', s!.id)}>
            ×
          </button>
        </span>
      ))}
      <select className="lore-pin-add" value="" onChange={(e) => e.target.value && add(e.target.value)} title="Прикрепить к герою, главе или сцене — запись появится в плане этих сцен">
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
