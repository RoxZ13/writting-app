import { db, type SceneText, type SyncedTable } from '../db/db'
import { save, setWriteRecorder, snapshotScene } from '../db/repo'
import { toast } from './ui'

/**
 * Undo / redo for board actions. In memory only: it lives as long as the page and is not synced.
 *
 * An action is wrapped in `undoable(label, fn)`. While `fn` runs, every write made through `save()` is
 * recorded: for each (table, id) the row as it was before the FIRST write, and as it is after the last.
 * Only the fields that really changed are kept, so undoing a scene move does not roll back a word count
 * the editor saved in the meantime.
 *
 * Assumptions, on purpose:
 * - `fn` awaits everything it starts. The recorder is global and set only while `fn` runs, so a write
 *   started by `fn` and not awaited could escape the record, and an unrelated write (the text editor's
 *   autosave, 800 ms debounced) landing exactly while `fn` runs would be recorded into the action.
 *   Board actions take a few milliseconds, so that window is accepted.
 * - Never call `undoable` from inside another `undoable` (jobs run one after another; it would wait for itself).
 * - Removal is the `deleted` flag like everywhere, so an undone «create» soft-deletes the row.
 */

type Fields = Record<string, unknown>
type Change = {
  table: SyncedTable
  id: string
  /** The row did not exist before the action: undo hides it, redo brings `after` back whole. */
  created: boolean
  before: Fields
  after: Fields
}
type Entry = { label: string; changes: Change[] }

const LIMIT = 50
let past: Entry[] = []
let future: Entry[] = []

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/** Jobs (actions, undo, redo) run strictly one after another. */
let queue: Promise<unknown> = Promise.resolve()
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.catch(() => undefined)
  return run
}

/** Reduce what was recorded to the changes that matter. */
function summarize(seen: Map<string, { table: SyncedTable; id: string; before?: Fields; after: Fields }>): Change[] {
  const changes: Change[] = []
  for (const { table, id, before, after } of seen.values()) {
    if (!before) {
      changes.push({ table, id, created: true, before: {}, after: { ...after } })
      continue
    }
    const b: Fields = {}
    const a: Fields = {}
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (k === 'updatedAt' || same(before[k], after[k])) continue
      b[k] = before[k]
      a[k] = after[k]
    }
    if (Object.keys(a).length) changes.push({ table, id, created: false, before: b, after: a })
  }
  return changes
}

/** Run a board action and remember how to take it back. Returns what `fn` returns. */
export function undoable<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return exclusive(async () => {
    const seen = new Map<string, { table: SyncedTable; id: string; before?: Fields; after: Fields }>()
    setWriteRecorder((table, before, after) => {
      const key = `${table}:${after.id}`
      const known = seen.get(key)
      if (known) known.after = after as unknown as Fields
      else seen.set(key, { table, id: after.id, before: before as unknown as Fields | undefined, after: after as unknown as Fields })
    })
    try {
      return await fn()
    } finally {
      setWriteRecorder(null)
      // Even a half-done action can be taken back.
      const changes = summarize(seen)
      if (changes.length) {
        past.push({ label, changes })
        if (past.length > LIMIT) past = past.slice(-LIMIT)
        future = []
      }
    }
  })
}

/** Put the listed fields of one row back (or forward); a missing field means the key is removed. */
async function setFields(c: Change, fields: Fields, whole: boolean) {
  const row = (await db.table(c.table).get(c.id)) as (Fields & { id: string }) | undefined
  if (!row) {
    if (whole) await save(c.table, { ...fields } as never)
    return
  }
  // A scene text written over by undo/redo: if the author typed in it since the action, that text goes to versions first.
  if (c.table === 'texts' && 'content' in fields && !same(row.content, fields.content)) {
    const expected = fields === c.before ? c.after.content : c.before.content
    if (!same(row.content, expected)) await snapshotScene(row as unknown as SceneText, 'Перед отменой на доске')
  }
  const next: Fields = whole ? { ...fields } : { ...row }
  if (!whole) {
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) delete next[k]
      else next[k] = v
    }
  }
  await save(c.table, next as never)
}

async function apply(entry: Entry, direction: 'undo' | 'redo') {
  for (const c of entry.changes) {
    if (c.created) {
      if (direction === 'undo') {
        const row = (await db.table(c.table).get(c.id)) as Fields | undefined
        if (row && !row.deleted) await save(c.table, { ...row, deleted: true } as never)
      } else await setFields(c, c.after, true)
    } else await setFields(c, direction === 'undo' ? c.before : c.after, false)
  }
}

async function step(direction: 'undo' | 'redo'): Promise<boolean> {
  return exclusive(async () => {
    const from = direction === 'undo' ? past : future
    const entry = from.pop()
    if (!entry) return false
    try {
      await apply(entry, direction)
    } catch (e) {
      console.error(e)
      from.push(entry)
      toast('Не получилось: данные остались как были')
      return false
    }
    ;(direction === 'undo' ? future : past).push(entry)
    toast(`${direction === 'undo' ? 'Отменено' : 'Возвращено'}: ${entry.label}`)
    return true
  })
}

/** Take back the last board action. Resolves to false when there was nothing to undo. */
export const undo = () => step('undo')
/** Do again what was just undone. */
export const redo = () => step('redo')
export const canUndo = () => past.length > 0
export const canRedo = () => future.length > 0
export function clearHistory() {
  past = []
  future = []
}

const running = new Set<string>()
/** Run an action once at a time: a second click while it is still running does nothing (it would double the result). */
export async function once<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (running.has(key)) return undefined
  running.add(key)
  try {
    return await fn()
  } finally {
    running.delete(key)
  }
}

/** Is this key event the board's undo (Ctrl/⌘ Z) or redo (Ctrl/⌘ Shift Z, Ctrl Y)? Layout-independent: «я» is also KeyZ. */
export function undoKey(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  if (e.code === 'KeyZ') return e.shiftKey ? 'redo' : 'undo'
  if (e.code === 'KeyY' && !e.shiftKey) return 'redo'
  return null
}

/**
 * After a quiet action (no toast of its own): on a touch screen, where there is no Ctrl+Z, a note with
 * «Отменить». With a keyboard or mouse the action stays silent.
 */
export function offerUndo(msg: string) {
  if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) toast(msg, () => void undo())
}

/** A toast whose «Отменить» takes back the last board action. */
export const toastUndo = (msg: string) => toast(msg, () => void undo())
