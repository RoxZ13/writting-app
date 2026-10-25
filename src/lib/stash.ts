import type { Editor } from '@tiptap/react'
import { Fragment, Slice } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import { uid, db, type Note, type Scene } from '../db/db'
import { createNote, patch, remove } from '../db/repo'
import { go } from './router'
import { session } from './session'
import { toast } from './ui'

/** What the editor remembers about the last «В запас», so Ctrl+Z can undo the note together with the text. */
export interface StashMemory {
  noteId: string
  /** Resolves once the note is written, so an instant undo never races the save. */
  written: Promise<unknown>
  /** The document right after the stash; null once anything else was typed. */
  docAfter: Editor['state']['doc'] | null
  /** Where the piece was, kept in step with later edits (for the toast's «Отменить»). */
  from: number
  /** Paragraph nodes of the piece (TipTap JSON). */
  nodes: unknown[]
  /** Already put back (by Ctrl+Z or the toast): a second «Отменить» must not insert the piece again. */
  reverted?: boolean
}

export const STASH_STORAGE = 'stashUndo'
export const getStashMemory = (editor: Editor): StashMemory | null => (editor.storage as any)[STASH_STORAGE]?.last ?? null
const setStashMemory = (editor: Editor, last: StashMemory | null) => {
  const st = (editor.storage as any)[STASH_STORAGE]
  if (st) st.last = last
}

/** Paragraph nodes of a stored piece: its TipTap JSON, or plain text split into paragraphs. */
export function stashNodes(note: Pick<Note, 'content' | 'text'>): unknown[] {
  const c = note.content as { content?: unknown[] } | undefined
  if (c && Array.isArray(c.content) && c.content.length) return c.content
  return note.text
    .split('\n')
    .map((t) => (t ? { type: 'paragraph', content: [{ type: 'text', text: t }] } : { type: 'paragraph' }))
}

/** The note a stashed piece becomes: kind «note», attached to its scene, with the formatting kept in `content`. */
export function createStashNote(projectId: string, sceneId: string, text: string, nodes: unknown[], id: string = uid()) {
  return createNote(text, 'note', projectId, sceneId, { id, content: { type: 'doc', content: nodes } })
}

/** The piece has gone back into the text: the note is done (soft, nothing is deleted). */
export const archiveStash = (noteId: string) => patch<Note>('notes', noteId, { archived: true })

/** «Убрать в запас»: the selection leaves the text in one step and becomes a note of this scene. */
export function stashSelection(editor: Editor, scene: Scene) {
  const { from, to, empty } = editor.state.selection
  if (empty) return
  const state = editor.state
  const nodes = state.doc.slice(from, to).content.toJSON() as unknown[]
  const text = state.doc.textBetween(from, to, '\n')
  const noteId = uid()

  // Closed on both sides, so one Ctrl+Z takes back exactly this step, not the typing around it.
  editor.view.dispatch(closeHistory(state.tr))
  editor.view.dispatch(editor.state.tr.delete(from, to))
  editor.view.dispatch(closeHistory(editor.state.tr))
  const written = createStashNote(scene.projectId, scene.id, text, nodes, noteId)
  const entry: StashMemory = { noteId, written, docAfter: editor.state.doc, from, nodes }
  setStashMemory(editor, entry)
  editor.commands.focus()
  toast('Убрано в запас', () => revertStash(editor, entry))
}

/** Put the piece back and drop the note. Used by Ctrl+Z (right after the stash) and the toast's «Отменить». */
export async function revertStash(editor: Editor, entry: StashMemory) {
  if (entry.reverted) return
  entry.reverted = true
  if (!editor.isDestroyed) {
    if (entry.docAfter && editor.state.doc.eq(entry.docAfter)) editor.commands.undo()
    else insertNodes(editor, entry.nodes, Math.min(entry.from, editor.state.doc.content.size))
    if (getStashMemory(editor) === entry) setStashMemory(editor, null)
  }
  await entry.written.catch(() => undefined)
  await remove('notes', entry.noteId)
}

/** Insert paragraphs like a paste does: the first and last join the paragraph at the cursor. */
function insertNodes(editor: Editor, nodes: unknown[], at?: number) {
  const { schema } = editor.state
  const slice = new Slice(Fragment.fromJSON(schema, nodes), 1, 1)
  const tr = editor.state.tr
  if (at === undefined) tr.replaceSelection(slice)
  else tr.replaceRange(at, at, slice)
  editor.view.dispatch(tr.scrollIntoView())
}

/**
 * «Вернуть в текст»: the piece goes in at the cursor of the scene it came from and the note is archived.
 * If that scene is not open, it opens first and the piece is inserted as soon as its editor is ready.
 */
export async function returnToText(note: Note) {
  if (!note.sceneId) return
  const editor = session.editor
  if (editor && !editor.isDestroyed && session.sceneId === note.sceneId) {
    insertNodes(editor, stashNodes(note))
    editor.commands.focus()
    await archiveStash(note.id)
    toast('Вернулось в текст')
    return
  }
  session.restore = note.id
  go({ view: 'write', sceneId: note.sceneId })
}

/** Called by the editor once it is ready: finishes a «Вернуть в текст» that had to open the scene first. */
export async function applyPendingRestore(editor: Editor, sceneId: string) {
  const id = session.restore
  if (!id) return
  session.restore = undefined
  const note = await db.notes.get(id)
  if (!note || note.sceneId !== sceneId || note.archived || editor.isDestroyed) return
  insertNodes(editor, stashNodes(note))
  await archiveStash(note.id)
  toast('Вернулось в текст')
}
