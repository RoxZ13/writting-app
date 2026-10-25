import type { Editor, JSONContent } from '@tiptap/react'
import { db, type Project, type Scene, type SceneText } from '../db/db'
import { alive, createScene, moveScene, patch, save, splitChapterAt } from '../db/repo'
import { makeExcerpt } from '../lib/importer'
import { docCharCount, docParagraphs, docWordCount } from '../lib/text'
import { chapterLength, lengthText, normText } from '../lib/length'
import { go } from '../lib/router'
import { toast } from '../lib/ui'

/** Step 1 of a split: the tail becomes a new scene right after `scene`, opening a new chapter. Does not touch `scene`. */
export async function createTailChapter(project: Project, scene: Scene, tail: JSONContent): Promise<Scene> {
  const next = await createScene(
    project.id,
    scene.chapterId,
    '',
    { status: scene.status === 'idea' ? 'draft' : scene.status, excerpt: makeExcerpt(docParagraphs(tail).map((x) => x.trim()).filter(Boolean)) },
    tail,
    docWordCount(tail),
  )
  const order = alive(await db.scenes.where('chapterId').equals(scene.chapterId).sortBy('order')).map((s) => s.id)
  await moveScene(next.id, scene.chapterId, order.indexOf(scene.id) + 1)
  await splitChapterAt(next.id, 'Новая глава')
  return next
}

/** Step 2 of a split: only after the tail is safe, shorten the original scene to the head. */
export async function trimHead(sceneId: string, head: JSONContent): Promise<void> {
  const t = await db.texts.get(sceneId)
  if (t) await save<SceneText>('texts', { ...t, content: head, wordCount: docWordCount(head) })
  await patch<Scene>('scenes', sceneId, { wordCount: docWordCount(head), charCount: docCharCount(head) })
}

/**
 * The paragraph with the cursor and everything after it become a new scene opening a new chapter.
 * Called from the «⋯» menu of the text view: the meter itself has no buttons.
 */
export async function splitChapterHere(project: Project, scene: Scene, editor: Editor | null): Promise<void> {
  if (!editor) return
  const doc = editor.state.doc.toJSON() as JSONContent
  const at = editor.state.doc.resolve(editor.state.selection.from).index(0)
  const before = (doc.content ?? []).slice(0, at)
  const after = (doc.content ?? []).slice(at)
  if (!before.length || !after.length) return toast('Поставь курсор на абзац, с которого начнётся новая глава')
  const head = { type: 'doc', content: before }
  const tail = { type: 'doc', content: after }
  // Order matters: the tail is first copied into the new chapter, and only then cut from this scene.
  // If anything fails on the way, the worst case is a duplicated paragraph, never a lost one.
  let next: Scene
  try {
    next = await createTailChapter(project, scene, tail)
  } catch {
    return toast('Не получилось разделить главу — текст не тронут')
  }
  try {
    await trimHead(scene.id, head)
    // Saved right away, not on the editor's next pause: the page moves to the new chapter at once.
    editor.commands.setContent(head, { emitUpdate: true })
  } catch {
    return toast('Новая глава создана, но из этой сцены конец не убрался — абзацы теперь продублированы')
  }
  toast('Новая глава начинается с этого абзаца. Название — на доске')
  go({ view: 'text', sceneId: next.id })
}

/**
 * The chapter's length against the norm: a thin line across the top of the page that fills up.
 * The bar is the indicator. Its words (how much is left, by how much the norm is passed) are small,
 * neutral, shown only on a wide screen and only while the author is not typing. Nothing at all when
 * the author has set no norm. Starting the next chapter from the cursor is in the «⋯» menu.
 */
export function ChapterMeter({ project, chars }: { project: Project; chars: number }) {
  const L = chapterLength(project, chars)
  if (L.state === 'none') return null
  const len = (n: number) => lengthText(project, n)
  const minMark = project.chapterMin && project.chapterMax ? project.chapterMin / project.chapterMax : undefined

  return (
    <div className={`chapter-meter ${L.state}`}>
      <div className="cm-track" title={`Глава: ${len(chars)} · норма ${normText(project)}`}>
        <div className="cm-fill" style={{ width: `${L.fill * 100}%` }} />
        {minMark !== undefined && <div className="cm-min" style={{ left: `${minMark * 100}%` }} />}
      </div>
      <div className="cm-text">
        <span className="cm-k">
          глава · {len(chars)} · норма {normText(project)}
        </span>
        {L.state === 'near' && <span className="cm-say">до конца нормы ≈ {len(L.left ?? 0)}</span>}
        {L.state === 'over' && <span className="cm-say">длиннее нормы на {len(L.over)}</span>}
      </div>
    </div>
  )
}
