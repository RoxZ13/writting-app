import { useState } from 'react'
import type { Marker } from '../db/db'
import { createLine, findOrCreateCharacter, toggleSceneRef } from '../db/repo'
import { sceneName, type ProjectData } from '../lib/hooks'

/** Toggleable chips for a scene's story lines (ветки) or characters, with inline "+ new". */
export function RefChips({
  data,
  sceneId,
  field,
  selected,
}: {
  data: ProjectData
  sceneId: string
  field: 'lineIds' | 'characterIds'
  selected: string[]
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const items = field === 'lineIds' ? data.lines.map((l) => ({ id: l.id, name: l.name, color: l.color })) : data.characters
  const add = async () => {
    const n = name.trim()
    setAdding(false)
    setName('')
    if (!n) return
    const existingLine = field === 'lineIds' ? data.lines.find((l) => l.name.trim().toLowerCase() === n.toLowerCase()) : undefined
    const created =
      field === 'lineIds' ? (existingLine ?? (await createLine(data.project.id, n))) : await findOrCreateCharacter(data.project.id, n)
    if (!selected.includes(created.id)) await toggleSceneRef(sceneId, field, created.id)
  }
  return (
    <div className="chips">
      {items.map((it) => {
        const on = selected.includes(it.id)
        return (
          <button
            key={it.id}
            className={`ref-chip ${on ? 'on' : ''}`}
            style={{ '--c': it.color } as React.CSSProperties}
            onClick={() => void toggleSceneRef(sceneId, field, it.id)}
          >
            <span className="dot" />
            {it.name}
          </button>
        )
      })}
      {adding ? (
        <input
          className="ref-input"
          autoFocus
          placeholder={field === 'lineIds' ? 'Название ветки' : 'Имя героя'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void add()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
            if (e.key === 'Escape') setAdding(false)
          }}
        />
      ) : (
        <button className="ref-chip add" onClick={() => setAdding(true)}>
          + {field === 'lineIds' ? 'ветка' : 'герой'}
        </button>
      )}
    </div>
  )
}

/** Small read-only markers of people/lines: coloured initials. */
export function Faces({ data, ids, max = 4 }: { data: ProjectData; ids: string[]; max?: number }) {
  const people = ids.map((id) => data.characterById.get(id)).filter(Boolean)
  if (!people.length) return null
  return (
    <span className="faces">
      {people.slice(0, max).map((c) => (
        <span key={c!.id} className="face" style={{ background: c!.color }} title={c!.name}>
          {c!.name.trim()[0]?.toUpperCase()}
        </span>
      ))}
      {people.length > max && <span className="face more">+{people.length - max}</span>}
    </span>
  )
}

/**
 * Where a marker is planted or pays off: a whole chapter (while planning) or an exact scene.
 * Value format: "ch:<id>" or "sc:<id>".
 */
export function PlacePicker({
  data,
  marker,
  side,
  emptyLabel,
  onChange,
}: {
  data: ProjectData
  marker: Marker
  side: 'setup' | 'payoff'
  emptyLabel: string
  onChange: (changes: Partial<Marker>) => void
}) {
  const sceneId = side === 'setup' ? marker.setupSceneId : marker.payoffSceneId
  const chapterId = side === 'setup' ? marker.setupChapterId : marker.payoffChapterId
  const value = sceneId ? `sc:${sceneId}` : chapterId ? `ch:${chapterId}` : ''
  return (
    <select
      className="select"
      value={value}
      onChange={(e) => {
        const [kind, id] = e.target.value.split(':')
        const sKey = side === 'setup' ? 'setupSceneId' : 'payoffSceneId'
        const cKey = side === 'setup' ? 'setupChapterId' : 'payoffChapterId'
        if (!kind) onChange({ [sKey]: undefined, [cKey]: undefined })
        else if (kind === 'ch') onChange({ [sKey]: undefined, [cKey]: id })
        else onChange({ [sKey]: id, [cKey]: data.sceneById.get(id)?.chapterId })
      }}
    >
      <option value="">{emptyLabel}</option>
      {data.outline.map(({ chapter, scenes }) => (
        <optgroup key={chapter.id} label={chapter.title}>
          <option value={`ch:${chapter.id}`}>{chapter.title} — где-то в главе</option>
          {scenes.map((s) => (
            <option key={s.id} value={`sc:${s.id}`}>
              {'   '}
              {sceneName(data, s)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
