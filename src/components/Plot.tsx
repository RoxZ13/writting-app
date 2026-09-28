import { useState } from 'react'
import type { Project, Scene } from '../db/db'
import { patch } from '../db/repo'
import { InlineEdit } from '../lib/ui'

const HEAT = ['спокойно', 'чуть острее', 'напряжённо', 'сильно', 'пик']

/**
 * Emotional intensity of a scene, 1–5, set with one tap. Tapping the current value clears it.
 * Stops pointer events so a tap on a board card does not start a drag or open the card.
 */
export function Heat({ scene, large }: { scene: Scene; large?: boolean }) {
  const value = scene.heat ?? 0
  const set = (v: number) => void patch<Scene>('scenes', scene.id, { heat: v === value ? undefined : v })
  return (
    <span
      className={`heat ${large ? 'large' : ''} ${value ? '' : 'unset'}`}
      title={value ? `Накал: ${HEAT[value - 1]}` : 'Накал сцены: от спокойной до пика'}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {[1, 2, 3, 4, 5].map((v) => (
        <button key={v} className={v <= value ? 'on' : ''} aria-label={`Накал ${v} из 5: ${HEAT[v - 1]}`} onClick={() => set(v)} />
      ))}
      {large && <span className="heat-label">{value ? HEAT[value - 1] : 'не отмечен'}</span>}
    </span>
  )
}

/** The emotional arc of a chapter: one bar per scene, key points drawn dark. Side by side, the columns show the whole book. */
export function Arc({ scenes }: { scenes: Scene[] }) {
  if (!scenes.length) return null
  return (
    <div
      className="arc"
      aria-label="Эмоциональная арка главы"
      title="Накал сцен главы по порядку: чем выше столбик, тем сильнее сцена. Чёрный — узловая точка, серый — накал не отмечен"
    >
      <span className="arc-label">накал</span>
      {scenes.map((s) => (
        <span
          key={s.id}
          className={`arc-bar ${s.node ? 'node' : ''} ${s.heat ? '' : 'unset'}`}
          style={{ height: `${s.heat ? 4 + s.heat * 5 : 3}px` }}
          title={s.heat ? `Накал ${s.heat} из 5` : 'Накал не отмечен'}
        />
      ))}
    </div>
  )
}

const ESSENCE_KEY = 'manuscript.essence'

/** What the story is about, how it ends and what drives it — kept in sight above the board. */
export function Essence({ project }: { project: Project }) {
  const filled = !!(project.premise || project.ending || project.drive)
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(ESSENCE_KEY) === '1'
    } catch {
      return false
    }
  })
  const setOpen = (v: boolean) => {
    setOpenState(v)
    try {
      localStorage.setItem(ESSENCE_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  const set = (changes: Partial<Project>) => void patch<Project>('projects', project.id, changes)

  if (!open) {
    return (
      <button className={`essence-bar ${filled ? '' : 'empty'}`} onClick={() => setOpen(true)}>
        {filled ? (
          <>
            <span className="essence-k">Финал</span>
            <span className="essence-v">{project.ending || 'ещё не решён'}</span>
            {project.premise && (
              <>
                <span className="essence-k">О чём</span>
                <span className="essence-v">{project.premise}</span>
              </>
            )}
          </>
        ) : (
          '+ Суть истории: о чём она и чем закончится'
        )}
      </button>
    )
  }
  return (
    <section className="essence card">
      <div className="essence-head">
        <span className="eyebrow">Суть истории</span>
        <span className="spacer" />
        <button className="link small" onClick={() => setOpen(false)}>
          свернуть
        </button>
      </div>
      <div className="essence-grid">
        <label>
          <span className="essence-k">О чём история</span>
          <InlineEdit multiline value={project.premise ?? ''} placeholder="Смысл в двух фразах" onSave={(premise) => set({ premise })} />
        </label>
        <label>
          <span className="essence-k">Чем закончится</span>
          <InlineEdit multiline value={project.ending ?? ''} placeholder="Финал — к нему ведёт всё остальное" onSave={(ending) => set({ ending })} />
        </label>
        <label>
          <span className="essence-k">Что движет героями</span>
          <InlineEdit multiline value={project.drive ?? ''} placeholder="Мотивы, страхи, цели" onSave={(drive) => set({ drive })} />
        </label>
      </div>
    </section>
  )
}
