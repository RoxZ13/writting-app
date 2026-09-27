import { useEffect, useState } from 'react'
import type { ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { findInEditor, searchBook, type Hit } from '../lib/search'
import { session } from '../lib/session'
import { Modal } from '../lib/ui'

/** Find a word or phrase anywhere in the book and jump straight to it. */
export function SearchModal({ data, onClose }: { data: ProjectData; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<{ hits: Hit[]; total: number }>({ hits: [], total: 0 })
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      const r = await searchBook(data, q)
      if (!cancelled) setRes(r)
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, data])

  const open = (h: Hit) => {
    onClose()
    if (session.sceneId === h.sceneId && session.editor) {
      findInEditor(session.editor, h.match)
      return
    }
    session.find = h.match
    go({ view: 'text', sceneId: h.sceneId })
  }

  return (
    <Modal onClose={onClose} label="Поиск по книге">
      <div className="stack">
        <input
          className="input search-input"
          autoFocus
          placeholder="Найти в книге — слово, имя, фразу"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && res.hits[0] && open(res.hits[0])}
        />
        {q.trim().length >= 2 && (
          <div className="small muted">{res.total ? `Найдено: ${res.total}${res.total > res.hits.length ? ` (показаны первые ${res.hits.length})` : ''}` : 'Ничего не нашлось'}</div>
        )}
        <div className="search-results">
          {res.hits.map((h, i) => (
            <button key={i} className="search-hit" onClick={() => open(h)}>
              <span className="hit-where">{h.where}</span>
              <span className="hit-text">
                {h.before}
                <mark>{h.match}</mark>
                {h.after}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
