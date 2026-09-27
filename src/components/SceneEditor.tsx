import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Focus, Placeholder } from '@tiptap/extensions'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { db, type Scene, type SceneText } from '../db/db'
import { patch, save } from '../db/repo'
import { docParagraphs, docWordCount } from '../lib/text'
import { makeExcerpt } from '../lib/importer'
import { session } from '../lib/session'
import { MarkerMark } from './MarkerMark'
import { CommentMark } from './CommentMark'
import { findInEditor } from '../lib/search'

export interface SelectionAction {
  kind: 'setup' | 'payoff' | 'comment'
  from: number
  to: number
  text: string
}

/**
 * The writing surface. Saves locally ~0.8s after typing stops (and immediately when the tab
 * is hidden), so nothing is lost offline or when the app is swiped away.
 */
export function SceneEditor({
  scene,
  initial,
  onReady,
  onWords,
  onSelectionAction,
  onMarkerClick,
  onCommentClick,
}: {
  scene: Scene
  initial: SceneText
  onReady: (editor: Editor) => void
  onWords: (n: number) => void
  onSelectionAction: (a: SelectionAction) => void
  onMarkerClick: (markerId: string) => void
  onCommentClick?: (noteId: string) => void
}) {
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastSavedAt = useRef(initial.updatedAt)
  const dirty = useRef(false)
  const saving = useRef(false)
  /** Latest editor state, kept so the final save still works after the editor is destroyed. */
  const latest = useRef<Editor['state'] | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, horizontalRule: false }),
      Placeholder.configure({ placeholder: 'Начни с одной фразы. Остальное подтянется.' }),
      Focus.configure({ className: 'has-focus', mode: 'deepest' }),
      MarkerMark,
      CommentMark,
    ],
    content: initial.content as object,
    editorProps: {
      attributes: { spellcheck: 'true', lang: 'ru', 'aria-label': 'Текст сцены' },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const target = event.target as HTMLElement
        const note = target.closest('[data-comment]')
        if (note) {
          onCommentClick?.(note.getAttribute('data-comment')!)
          return false
        }
        const el = target.closest('[data-marker]')
        if (el) onMarkerClick(el.getAttribute('data-marker')!)
        return false
      },
    },
    onSelectionUpdate: ({ editor }) => {
      latest.current = editor.state
    },
    onUpdate: ({ editor }) => {
      latest.current = editor.state
      dirty.current = true
      clearTimeout(pending.current)
      pending.current = setTimeout(() => void flush(editor), 800)
    },
  })

  async function flush(ed: Editor | null = editor) {
    clearTimeout(pending.current)
    const state = latest.current ?? ed?.state
    if (!state || !dirty.current) return
    dirty.current = false
    saving.current = true
    const content = state.doc.toJSON()
    const wordCount = docWordCount(content)
    try {
      const saved = await save<SceneText>('texts', { ...initial, content, wordCount })
      lastSavedAt.current = saved.updatedAt
    } finally {
      saving.current = false
    }
    onWords(wordCount)
    const current = await db.scenes.get(scene.id)
    const paras = docParagraphs(content).map((p) => p.trim()).filter(Boolean)
    const excerpt = makeExcerpt(current?.epigraph && paras[0] === current.epigraph ? paras.slice(1) : paras)
    if (current && (current.wordCount !== wordCount || current.lastPos !== state.selection.from || current.excerpt !== excerpt)) {
      await patch<Scene>('scenes', scene.id, { wordCount, lastPos: state.selection.from, excerpt })
    }
  }

  // Restore the cursor where the author left it.
  useEffect(() => {
    if (!editor) return
    session.editor = editor
    onReady(editor)
    const pos = Math.min(scene.lastPos ?? editor.state.doc.content.size, editor.state.doc.content.size - 1)
    editor.commands.setTextSelection(Math.max(1, pos))
    requestAnimationFrame(() => {
      if (session.find) {
        const q = session.find
        session.find = undefined
        if (findInEditor(editor, q)) return
      }
      if (matchMedia('(pointer: fine)').matches) editor.commands.focus(undefined, { scrollIntoView: true })
      else editor.commands.scrollIntoView()
    })
    const onHide = () => document.visibilityState === 'hidden' && void flush(editor)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      const pos = (latest.current ?? editor.state).selection.from
      if (dirty.current) void flush(editor)
      else
        void db.scenes.get(scene.id).then((s) => {
          if (s && s.lastPos !== pos) void patch<Scene>('scenes', scene.id, { lastPos: pos })
        })
      if (session.editor === editor) session.editor = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // If another device changed this scene and nothing is being typed here, show the new text.
  const remote = useLiveQuery(() => db.texts.get(scene.id), [scene.id])
  useEffect(() => {
    if (!editor || !remote || dirty.current || saving.current) return
    if (remote.updatedAt > lastSavedAt.current) {
      lastSavedAt.current = remote.updatedAt
      const { from } = editor.state.selection
      editor.commands.setContent(remote.content as object, { emitUpdate: false })
      editor.commands.setTextSelection(Math.min(from, editor.state.doc.content.size - 1))
      latest.current = editor.state
      onWords(remote.wordCount)
    }
  }, [remote, editor, onWords])

  if (!editor) return null

  const act = (kind: SelectionAction['kind']) => {
    const { from, to } = editor.state.selection
    onSelectionAction({ kind, from, to, text: editor.state.doc.textBetween(from, to, ' ') })
  }

  return (
    <>
      <BubbleMenu
        editor={editor}
        shouldShow={({ state }) => !state.selection.empty}
        options={{ placement: 'top' }}
      >
        <div className="bubble">
          <button className={editor.isActive('italic') ? 'on' : ''} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <i>К</i>
          </button>
          <button className={editor.isActive('bold') ? 'on' : ''} onClick={() => editor.chain().focus().toggleBold().run()}>
            <b>Ж</b>
          </button>
          <button onClick={() => act('setup')} title="Посеять маячок в этом месте">
            ✦ Маячок
          </button>
          <button onClick={() => act('payoff')} title="Отметить, что здесь раскрывается маячок">
            ◎ Раскрытие
          </button>
          <button onClick={() => act('comment')} title="Заметка на полях к этому месту">
            ✎ Заметка
          </button>
        </div>
      </BubbleMenu>
      <EditorContent editor={editor} />
    </>
  )
}
