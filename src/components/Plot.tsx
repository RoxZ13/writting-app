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
export function Arc({ scenes, isNode }: { scenes: Scene[]; isNode: (s: Scene) => boolean }) {
  if (!scenes.length) return null
  return (
    <div
      className="arc"
      aria-label="Эмоциональная арка главы"
      title="Накал сцен главы по порядку: чем выше столбик, тем сильнее сцена. Чёрный — узловая точка, серый — накал не отмечен"
    >
      <span className="arc-label">накал сцен</span>
      {scenes.map((s) => (
        <span
          key={s.id}
          className={`arc-bar ${isNode(s) ? 'node' : ''} ${s.heat ? '' : 'unset'}`}
          style={{ height: `${s.heat ? 4 + s.heat * 5 : 3}px` }}
          title={s.heat ? `Накал ${s.heat} из 5` : 'Накал не отмечен'}
        />
      ))}
    </div>
  )
}

const ESSENCE_KEY = 'manuscript.essence'

/** What the story is about, how it ends and what drives it — kept in sight above the board. */
export function Essence({ project, embedded }: { project: Project; embedded?: boolean }) {
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

  // On the board only as a reminder once filled in; it is written on «Книга» (embedded).
  if (!embedded && !filled) return null
  if (!open && !embedded) {
    return (
      <button className={`essence-bar ${filled ? '' : 'empty'}`} onClick={() => setOpen(true)}>
        {filled ? (
          <>
            {project.premise && (
              <>
                <span className="essence-k">О чём</span>
                <span className="essence-v">{project.premise}</span>
              </>
            )}
            {project.ending && (
              <>
                <span className="essence-k">Финал</span>
                <span className="essence-v">{project.ending}</span>
              </>
            )}
            {!project.premise && !project.ending && (
              <>
                <span className="essence-k">Что движет</span>
                <span className="essence-v">{project.drive}</span>
              </>
            )}
          </>
        ) : (
          '+ О чём история — можно одной строкой, можно позже'
        )}
      </button>
    )
  }
  return (
    <section className="essence card">
      <div className="essence-head">
        <span className={embedded ? 'essence-title' : 'eyebrow'}>Замысел</span>
        <span className="spacer" />
        {!embedded && (
          <button className="link small" onClick={() => setOpen(false)}>
            свернуть
          </button>
        )}
      </div>
      <div className="essence-grid">
        <label>
          <span className="essence-k">О чём история</span>
          <InlineEdit multiline value={project.premise ?? ''} placeholder="Смысл в двух фразах" onSave={(premise) => set({ premise })} />
        </label>
        <label>
          <span className="essence-k">Чем закончится</span>
          <InlineEdit multiline value={project.ending ?? ''} placeholder="Если уже знаешь — к нему поведёт всё остальное" onSave={(ending) => set({ ending })} />
        </label>
        <label>
          <span className="essence-k">Что движет героями</span>
          <InlineEdit multiline value={project.drive ?? ''} placeholder="Мотивы, страхи, цели" onSave={(drive) => set({ drive })} />
        </label>
      </div>
    </section>
  )
}
