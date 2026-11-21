import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db/db'
import { alive } from '../db/repo'
import { sceneName, type ProjectData } from '../lib/hooks'
import { heroPatterns, whereFound, type Found } from '../lib/mentions'
import { go } from '../lib/router'
import { docParagraphs } from '../lib/text'
import { Icon } from './Icon'

/** Scene texts of the book as plain strings, kept fresh; read only by the pages that show «Где встречается». */
export function useWhereFound(data: ProjectData): Map<string, Found[]> | undefined {
  const texts = useLiveQuery(async () => {
    const rows = alive(await db.texts.where('projectId').equals(data.project.id).toArray())
    return new Map(rows.map((t) => [t.id, docParagraphs(t.content).join('\n')]))
  }, [data.project.id])
  return useMemo(
    () => (texts ? whereFound([...data.scenes, ...data.pool.scenes], texts, data.characters, data.lore) : undefined),
    [texts, data.scenes, data.pool.scenes, data.characters, data.lore],
  )
}

/**
 * «Где встречается»: the scenes of a hero or a lore entry, grouped by chapter. A tap opens the scene;
 * «×» on a scene found only by its name means «не то» — it will not show up there again.
 */
export function WhereFound({ data, found, onNotThis, onInclude, heroId }: { data: ProjectData; found?: Found[]; onNotThis: (sceneId: string) => void; onInclude?: (sceneId: string) => Promise<void>; heroId?: string }) {
  const heroPattern = useMemo(() => heroId ? heroPatterns(data.characters).get(heroId) : undefined, [data.characters, heroId])
  if (found === undefined) return null
  if (!found.length) return <div className="where-found muted small">Пока нигде в тексте</div>
  const byChapter = new Map<string, Found[]>()
  for (const f of found) {
    const s = data.sceneById.get(f.sceneId)
    if (!s) continue
    byChapter.set(s.chapterId, [...(byChapter.get(s.chapterId) ?? []), f])
  }
  return (
    <details className="where-found">
      <summary>
        Встречается в {found.length} {plural(found.length, 'сцене', 'сценах', 'сценах')}
      </summary>
      {[...byChapter].map(([chapterId, list]) => (
        <div key={chapterId} className="wf-chapter">
          <span className="wf-title">{data.chapterById.get(chapterId)?.title}</span>
          {list.map((f) => {
            const s = data.sceneById.get(f.sceneId)!
            return (
              <div key={f.sceneId} className="wf-scene-entry">
                <div className="wf-scene">
                  <button className="link-plain" title={s.goal || s.excerpt || ''} onClick={() => go({ view: 'text', sceneId: s.id })}>
                    {sceneName(data, s).replace(/^Сцена /, 'сц. ')}
                  </button>
                  {onInclude && (f.manual
                    ? <span className="small muted">В составе сцены</span>
                    : <button className="btn sm ghost" onClick={() => void onInclude(s.id)}>Добавить в состав сцены</button>)}
                  {!f.manual && (
                    <button className="wf-not" title="Не то — здесь это имя о другом" aria-label="Не то" onClick={() => onNotThis(s.id)}>
                      <Icon name="close" size={15} />
                    </button>
                  )}
                </div>
                {heroPattern && <HeroPassages sceneId={s.id} pattern={heroPattern} />}
              </div>
            )
          })}
        </div>
      ))}
    </details>
  )
}

function HeroPassages({ sceneId, pattern }: { sceneId: string; pattern: RegExp }) {
  const [open, setOpen] = useState(false)
  const passages = useLiveQuery(async () => {
    if (!open) return undefined
    const text = await db.texts.get(sceneId)
    return text && !text.deleted
      ? docParagraphs(text.content).filter((paragraph) => paragraph.search(pattern) >= 0)
      : []
  }, [sceneId, open, pattern])
  return <details className="wf-passages" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Абзацы с упоминанием</summary>
    {open && (passages?.length
      ? passages.map((paragraph, index) => <p key={index}>{paragraph}</p>)
      : <p className="small muted">{passages ? 'Имя в тексте сцены не найдено' : 'Открываю…'}</p>)}
  </details>
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}
