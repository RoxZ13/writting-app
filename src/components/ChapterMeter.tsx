import type { Editor, JSONContent } from '@tiptap/react'
import { db, type Project, type Scene, type SceneText } from '../db/db'
import { alive, createScene, moveScene, patch, save, splitChapterAt } from '../db/repo'
import { makeExcerpt } from '../lib/importer'
import { docCharCount, docParagraphs, docWordCount } from '../lib/text'
import { chapterLength, lengthText, normText } from '../lib/length'
import { go } from '../lib/router'
import { toast } from '../lib/ui'

/**
 * The chapter's length against the norm, always in sight while writing: a thin line across the top
 * of the page that fills up. Calm while there is room; in the last tenth it says how much is left;
 * past the bound it says by how much — and the rest can start the next chapter from the cursor.
 * Nothing at all when the author has set no norm.
 */
export function ChapterMeter({
  project,
  scene,
  chars,
  editor,
  locked,
}: {
  project: Project
  scene: Scene
  chars: number
  editor: Editor | null
  locked: boolean
}) {
  const L = chapterLength(project, chars)
  if (L.state === 'none') return null
  const len = (n: number) => lengthText(project, n)
  const minMark = project.chapterMin && project.chapterMax ? project.chapterMin / project.chapterMax : undefined

  // The paragraph with the cursor and everything after it become a new scene opening a new chapter.
  const splitHere = async () => {
    if (!editor) return
    const doc = editor.state.doc.toJSON() as JSONContent
    const at = editor.state.doc.resolve(editor.state.selection.from).index(0)
    const before = (doc.content ?? []).slice(0, at)
    const after = (doc.content ?? []).slice(at)
    if (!before.length || !after.length) return toast('Поставь курсор на абзац, с которого начнётся новая глава')
    const head = { type: 'doc', content: before }
    const tail = { type: 'doc', content: after }
    // Saved right away, not on the editor's next pause: the page moves to the new chapter at once.
    editor.commands.setContent(head, { emitUpdate: true })
    const t = await db.texts.get(scene.id)
    if (t) await save<SceneText>('texts', { ...t, content: head, wordCount: docWordCount(head) })
    await patch<Scene>('scenes', scene.id, { wordCount: docWordCount(head), charCount: docCharCount(head) })
    const next = await createScene(project.id, scene.chapterId, '', { status: scene.status === 'idea' ? 'draft' : scene.status, excerpt: makeExcerpt(docParagraphs(tail).map((x) => x.trim()).filter(Boolean)) }, tail, docWordCount(tail))
    const order = alive(await db.scenes.where('chapterId').equals(scene.chapterId).sortBy('order')).map((s) => s.id)
    await moveScene(next.id, scene.chapterId, order.indexOf(scene.id) + 1)
    await splitChapterAt(next.id, 'Новая глава')
    toast('Новая глава начинается с этого абзаца. Название — на доске')
    go({ view: 'text', sceneId: next.id })
  }

  return (
    <div className={`chapter-meter ${L.state}`}>
      <div className="cm-track" title={`Глава: ${len(chars)} · норма ${normText(project)}`}>
        <div className="cm-fill" style={{ width: `${L.fill * 100}%` }} />
        {minMark !== undefined && <div className="cm-min" style={{ left: `${minMark * 100}%` }} />}
      </div>
      <div className="cm-text">
        <span className="cm-k">
          глава · {len(chars)} из {normText(project)}
        </span>
        {L.state === 'near' && <span className="cm-say">до конца нормы ≈ {len(L.left ?? 0)} — пора вести главу к концу</span>}
        {L.state === 'over' && (
          <span className="cm-say">
            длиннее нормы на {len(L.over)}
            {!locked && (
              <>
                {' · '}
                <button className="link" title="Абзац с курсором и всё после него станут новой главой" onClick={() => void splitHere()}>
                  ✂ новая глава с этого абзаца
                </button>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
