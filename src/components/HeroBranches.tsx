import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db, type Line, type Scene } from '../db/db'
import { alive, createLine, patch } from '../db/repo'
import { heroScenes } from '../lib/heroes'
import type { ProjectData } from '../lib/hooks'
import { docParagraphs } from '../lib/text'
import { Modal, toast } from '../lib/ui'

/**
 * «Ветки из героев»: for a book that came in written, its branches are already in the text —
 * each main hero's scenes. The author ticks the heroes; each becomes a branch in the hero's colour,
 * running through the scenes where the hero is. Ticked at first: up to three heroes seen in five
 * scenes or more — but not the one who is almost everywhere: that is the story itself, not a branch.
 */
export function HeroBranches({ data, onClose }: { data: ProjectData; onClose: () => void }) {
  const texts = useLiveQuery(async () => {
    const rows = alive(await db.texts.where('projectId').equals(data.project.id).toArray())
    return new Map(rows.map((t) => [t.id, docParagraphs(t.content).join('\n')]))
  }, [data.project.id])
  const all = useMemo(() => [...data.scenes, ...data.pool.scenes], [data.scenes, data.pool.scenes])
  const found = useMemo(() => (texts ? heroScenes(all, texts, data.characters) : undefined), [texts, all, data.characters])
  const heroes = useMemo(
    () => [...data.characters].sort((a, b) => (found?.get(b.id)?.length ?? 0) - (found?.get(a.id)?.length ?? 0)),
    [data.characters, found],
  )
  const everywhere = (id: string) => (found?.get(id)?.length ?? 0) > all.length * 0.75
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const chosen =
    picked ??
    new Set(
      heroes
        .filter((c) => (found?.get(c.id)?.length ?? 0) >= 5 && !everywhere(c.id))
        .slice(0, 3)
        .map((c) => c.id),
    )
  const lineOf = (name: string) => data.lines.find((l) => l.name.trim().toLowerCase() === name.trim().toLowerCase())

  const apply = async () => {
    if (!found) return
    const add = new Map<string, Set<string>>()
    for (const c of heroes) {
      if (!chosen.has(c.id)) continue
      let line = lineOf(c.name)
      if (!line) {
        line = await createLine(data.project.id, c.name)
        await patch<Line>('lines', line.id, { color: c.color })
      }
      for (const sid of found.get(c.id) ?? []) add.set(sid, (add.get(sid) ?? new Set()).add(line.id))
    }
    for (const [sid, ids] of add) {
      const s = data.sceneById.get(sid)
      if (!s) continue
      const next = [...new Set([...(s.lineIds ?? []), ...ids])]
      if (next.length !== (s.lineIds ?? []).length) await patch<Scene>('scenes', sid, { lineIds: next })
    }
    toast(`Ветки готовы: ${chosen.size}. Где они сходятся — видно на «Линии»`)
    onClose()
  }

  return (
    <Modal onClose={onClose} label="Ветки из героев">
      <div className="stack">
        <h2>Ветки из героев</h2>
        <div className="small muted">
          Ветка героя проходит через сцены, где он отмечен или назван в тексте хотя бы дважды. Сцены, где сходятся несколько героев, станут
          узлами. Лишнее потом можно снять в самой сцене.
        </div>
        {!found ? (
          <div className="muted">Читаю книгу…</div>
        ) : (
          <>
            {heroes.map((c) => {
              const n = found.get(c.id)?.length ?? 0
              return (
                <label key={c.id} className="row" style={{ flexWrap: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={chosen.has(c.id)}
                    disabled={!n}
                    onChange={(e) => {
                      const next = new Set(chosen)
                      if (e.target.checked) next.add(c.id)
                      else next.delete(c.id)
                      setPicked(next)
                    }}
                  />
                  <span className="avatar small" style={{ background: c.color }}>
                    {c.name.trim()[0]?.toUpperCase()}
                  </span>
                  <span style={{ flex: 1 }}>
                    {c.name}
                    {lineOf(c.name) ? (
                      <span className="muted small"> · ветка уже есть, сцены добавятся</span>
                    ) : (
                      everywhere(c.id) && <span className="muted small"> · почти в каждой сцене — это сама история, а не ветка</span>
                    )}
                  </span>
                  <span className="muted small">{n ? `${n} сц.` : 'нет в тексте'}</span>
                </label>
              )
            })}
            <div className="row">
              <span className="spacer" />
              <button className="btn ghost" onClick={onClose}>
                Отмена
              </button>
              <button className="btn primary" disabled={!chosen.size} onClick={() => void apply()}>
                Сделать ветки
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
