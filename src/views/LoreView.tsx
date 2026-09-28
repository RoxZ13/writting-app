import { useState } from 'react'
import type { Note } from '../db/db'
import { createNote, patch, remove } from '../db/repo'
import type { ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
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
        Места, магия, даты, кто что знает. Если запись упоминается в сцене, она всплывёт в плане этой сцены.
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
          <LoreCard key={n.id} n={n} />
        ))}
      </div>
      {!data.lore.length && <div className="empty">Пока пусто. Начни с того, что чаще всего приходится проверять.</div>}
    </div>
  )
}

function LoreCard({ n }: { n: Note }) {
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
    </article>
  )
}
