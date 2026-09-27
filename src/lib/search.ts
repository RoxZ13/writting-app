import type { Editor } from '@tiptap/react'
import { db } from '../db/db'
import { alive } from '../db/repo'
import { sceneName, type ProjectData } from './hooks'
import { docParagraphs } from './text'

/** Case- and ё-insensitive form that keeps string length, so indexes map back to the original. */
export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')

export interface Hit {
  sceneId: string
  where: string
  before: string
  match: string
  after: string
}

/** Every place in the book's text where the query occurs (up to `limit`). */
export async function searchBook(data: ProjectData, query: string, limit = 200): Promise<{ hits: Hit[]; total: number }> {
  const q = norm(query.trim())
  if (q.length < 2) return { hits: [], total: 0 }
  const texts = alive(await db.texts.where('projectId').equals(data.project.id).toArray())
  const byId = new Map(texts.map((t) => [t.id, t]))
  const hits: Hit[] = []
  let total = 0
  for (const scene of data.scenes) {
    const t = byId.get(scene.id)
    if (!t) continue
    for (const p of docParagraphs(t.content)) {
      const np = norm(p)
      let i = np.indexOf(q)
      while (i !== -1) {
        total++
        if (hits.length < limit) {
          hits.push({
            sceneId: scene.id,
            where: `${data.chapterById.get(scene.chapterId)?.title ?? ''} · ${sceneName(data, scene)}`,
            before: (i > 60 ? '…' : '') + p.slice(Math.max(0, i - 60), i),
            match: p.slice(i, i + q.length),
            after: p.slice(i + q.length, i + q.length + 80) + (i + q.length + 80 < p.length ? '…' : ''),
          })
        }
        i = np.indexOf(q, i + q.length)
      }
    }
  }
  return { hits, total }
}

/** Select the first occurrence of `query` in the open scene and bring it into view. */
export function findInEditor(editor: Editor, query: string): boolean {
  const q = norm(query.trim())
  if (!q) return false
  let found: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return !found
    const i = norm(node.text ?? '').indexOf(q)
    if (i !== -1) found = { from: pos + i, to: pos + i + q.length }
    return false
  })
  if (!found) return false
  editor.chain().focus().setTextSelection(found).scrollIntoView().run()
  return true
}
