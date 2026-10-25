import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { recordWords } from '../lib/pace'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Focus, Placeholder } from '@tiptap/extensions'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db, type Note, type Scene, type SceneText } from '../db/db'
import { patch, save, snapshotScene } from '../db/repo'
import { docCharCount, docParagraphs, docWordCount } from '../lib/text'
import { makeExcerpt } from '../lib/importer'
import { session } from '../lib/session'
import { MarkerMark } from './MarkerMark'
import { EditHints } from './EditHints'
import { Typography } from './Typography'
import { FindHighlight } from './FindHighlight'
import { CommentMark } from './CommentMark'
import { InlineNote } from './InlineNote'
import { toast } from '../lib/ui'
import { findInEditor } from '../lib/search'
import { createSaver } from '../lib/saver'

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
  onSaved,
  onSelectionAction,
  onMarkerClick,
  onCommentClick,
}: {
  scene: Scene
  initial: SceneText
  onReady: (editor: Editor) => void
  onWords: (n: number, chars: number) => void
  /** False while there are unsaved changes, true once they are on the device. */
  onSaved?: (saved: boolean) => void
  onSelectionAction: (a: SelectionAction) => void
  onMarkerClick: (markerId: string) => void
  onCommentClick?: (noteId: string) => void
}) {
  const lastSavedAt = useRef(initial.updatedAt)
  /** Latest editor state, kept so the final save still works after the editor is destroyed. */
  const latest = useRef<Editor['state'] | null>(null)
  /** Always the newest props, so the saver (created once) never works with stale callbacks. */
  const live = useRef({ scene, initial, onWords, onSaved })
  useEffect(() => {
    live.current = { scene, initial, onWords, onSaved }
  })
  const errorShown = useRef(false)

  const [saver] = useState(() =>
    createSaver<Editor['state']>({
      delay: 800,
      retryDelay: 3000,
      write: async (state) => {
        const { scene, initial, onWords } = live.current
        const content = state.doc.toJSON()
        const wordCount = docWordCount(content)
        const charCount = docCharCount(content)
        // Another device's (or tab's) text arrived while this one was being typed: keep it in versions before writing over it.
        // Check and write in one transaction, so no other write can slip in between them.
        const saved = await db.transaction('rw', db.texts, db.snapshots, db.outbox, async () => {
          const stored = await db.texts.get(scene.id)
          if (stored && stored.updatedAt > lastSavedAt.current && JSON.stringify(stored.content) !== JSON.stringify(content)) {
            await snapshotScene(stored, 'Версия с другого устройства (конфликт синхронизации)')
          }
          return save<SceneText>('texts', { ...initial, content, wordCount })
        })
        lastSavedAt.current = saved.updatedAt
        onWords(wordCount, charCount)
        const current = await db.scenes.get(scene.id)
        const paras = docParagraphs(content).map((p) => p.trim()).filter(Boolean)
        const excerpt = makeExcerpt(current?.epigraph && paras[0] === current.epigraph ? paras.slice(1) : paras)
        if (
          current &&
          (current.wordCount !== wordCount || current.charCount !== charCount || current.lastPos !== state.selection.from || current.excerpt !== excerpt)
        ) {
          await patch<Scene>('scenes', scene.id, { wordCount, charCount, lastPos: state.selection.from, excerpt })
        }
        // Counted only once everything is written, so a retry does not count the words twice.
        if (current) recordWords(current.projectId, wordCount - current.wordCount)
      },
      onState: (s) => {
        live.current.onSaved?.(s === 'saved')
        if (s === 'error') {
          if (!errorShown.current) toast('Не получилось сохранить текст. Пробую ещё раз…')
          errorShown.current = true
        } else if (s === 'saved') errorShown.current = false
      },
    }),
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, horizontalRule: false }),
      Placeholder.configure({ placeholder: 'Любая фраза. Можно из середины.' }),
      Focus.configure({ className: 'has-focus', mode: 'deepest' }),
      MarkerMark,
      EditHints,
      CommentMark,
      Typography,
      FindHighlight,
      InlineNote.configure({
        onNote: (id, text) => {
          const now = Date.now()
          void save<Note>('notes', { id, text, kind: 'note', projectId: scene.projectId, sceneId: scene.id, archived: false, createdAt: now, updatedAt: now })
          toast('Ушло на поля')
        },
      }),
    ],
    // Only our own typing shortcuts and **bold** / *italic*: a dash or «>» at the start of a line stays text,
    // it never turns into a list or a quote block (dialogue starts with a dash).
    enableInputRules: ['bold', 'italic', 'strike', 'mnTypography'],
    content: initial.content as object,
    editorProps: {
      // Spelling underlines follow the setting: while writing they only distract.
      attributes: () => ({ spellcheck: spellOn() ? 'true' : 'false', lang: 'ru', 'aria-label': 'Текст сцены' }),
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
      keepLineCentered(editor)
    },
    onUpdate: ({ editor }) => {
      latest.current = editor.state
      keepLineCentered(editor)
      saver.change(() => latest.current ?? editor.state)
    },
  })

  // Restore the cursor where the author left it.
  useEffect(() => {
    if (!editor) return
    session.editor = editor
    onReady(editor)
    const pos = Math.min(scene.lastPos ?? editor.state.doc.content.size, editor.state.doc.content.size - 1)
    editor.commands.setTextSelection(Math.max(1, pos))
    requestAnimationFrame(() => {
      // The scene may already be closed (a quick jump to the next one).
      if (editor.isDestroyed) return
      if (session.find) {
        const q = session.find
        session.find = undefined
        if (findInEditor(editor, q)) return
      }
      if (matchMedia('(pointer: fine)').matches) editor.commands.focus(undefined, { scrollIntoView: true })
      else editor.commands.scrollIntoView()
    })
    const onHidden = () => document.visibilityState === 'hidden' && void saver.flush()
    const onPageHide = () => void saver.flush()
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      const pos = (latest.current ?? editor.state).selection.from
      if (saver.isDirty()) {
        void saver.flush()
        saver.dispose()
      } else
        void db.scenes.get(scene.id).then((s) => {
          if (s && s.lastPos !== pos) void patch<Scene>('scenes', scene.id, { lastPos: pos })
        })
      if (session.editor === editor) session.editor = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Closing the tab inside the quiet window, or while a write is failing, asks first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!saver.isDirty()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [saver])

  // If another device changed this scene and nothing is being typed here, show the new text.
  const remote = useLiveQuery(() => db.texts.get(scene.id), [scene.id])
  useEffect(() => {
    if (!editor || !remote || saver.isDirty()) return
    if (remote.updatedAt > lastSavedAt.current) {
      lastSavedAt.current = remote.updatedAt
      const { from } = editor.state.selection
      editor.commands.setContent(remote.content as object, { emitUpdate: false })
      editor.commands.setTextSelection(Math.min(from, editor.state.doc.content.size - 1))
      latest.current = editor.state
      onWords(remote.wordCount, docCharCount(remote.content))
    }
  }, [remote, editor, onWords, saver])

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

/** Typewriter mode: keep the line being written a little above the middle of the screen. */
function keepLineCentered(editor: Editor) {
  if (document.documentElement.dataset.typewriter !== 'on' || !editor.view.hasFocus()) return
  const { top } = editor.view.coordsAtPos(editor.state.selection.head)
  const delta = top - window.innerHeight * 0.42
  if (Math.abs(delta) > 6) window.scrollBy({ top: delta })
}

function spellOn() {
  const { spell = 'edit', writemode } = document.documentElement.dataset
  return spell === 'always' || (spell === 'edit' && writemode === 'edit')
}
