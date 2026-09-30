import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/db'
import { alive } from '../db/repo'
import { sceneName, type ProjectData } from '../lib/hooks'
import { whereFound, type Found } from '../lib/mentions'
import { go } from '../lib/router'
import { docParagraphs } from '../lib/text'

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
export function WhereFound({ data, found, onNotThis }: { data: ProjectData; found?: Found[]; onNotThis: (sceneId: string) => void }) {
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
              <span key={f.sceneId} className="wf-scene">
                <button className="link-plain" title={s.goal || s.excerpt || ''} onClick={() => go({ view: 'text', sceneId: s.id })}>
                  {sceneName(data, s).replace(/^Сцена /, 'сц. ')}
                </button>
                {!f.manual && (
                  <button className="wf-not" title="Не то — здесь это имя о другом" aria-label="Не то" onClick={() => onNotThis(s.id)}>
                    ×
                  </button>
                )}
              </span>
            )
          })}
        </div>
      ))}
    </details>
  )
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}
