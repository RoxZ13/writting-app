import Dexie, { type Table } from 'dexie'

/** Every synced record carries these fields. `updatedAt` is client time in ms. */
export interface Base {
  id: string
  updatedAt: number
  deleted?: boolean
}

export interface Project extends Base {
  title: string
  createdAt: number
  /** Where the author stopped last time — synced so "Continue" works on every device. */
  lastSceneId?: string
  /** About the book: the header of an imported file (fandom, pairing, summary…) or the author's own words. */
  description?: string
  /** "Note to future self", written when finishing a session. */
  nextStep?: string
  /** Cover colour in the library. */
  color?: string
  /** Target date, YYYY-MM-DD. */
  deadline?: string
}

export interface Chapter extends Base {
  projectId: string
  title: string
  order: number
  /** What this chapter is for, in one or two sentences. */
  goal: string
  /** Target date, YYYY-MM-DD. */
  deadline?: string
}

export type SceneStatus = 'idea' | 'draft' | 'written' | 'logic' | 'style' | 'done'

export interface Beat {
  id: string
  text: string
  done: boolean
}

export interface Scene extends Base {
  projectId: string
  chapterId: string
  title: string
  order: number
  status: SceneStatus
  /** Why the scene exists. */
  goal: string
  /** "What must happen here" — the checklist that keeps the author on course. */
  beats: Beat[]
  /** Mirrored from the scene's text record, refreshed while writing. */
  wordCount: number
  /** Cursor position when the author last left the scene (per record, good enough across devices). */
  lastPos?: number
  /** The opening of the text, refreshed while writing — shown on cards when the scene has no title. */
  excerpt?: string
  /** A song or quote line that opens the scene. */
  epigraph?: string
  /** Story lines (ветки) this scene belongs to. */
  lineIds?: string[]
  /** Characters present in the scene. */
  characterIds?: string[]
  /** While rewriting: the snapshot holding the text as it was before, shown next to the new draft. */
  rewriteFrom?: string
}

/** A story line (ветка): the main plot or a character's micro-line running in parallel. */
export interface Line extends Base {
  projectId: string
  name: string
  color: string
  order: number
}

export interface Character extends Base {
  projectId: string
  name: string
  color: string
  /** Free-form notes: who they are, what they want, what they hide. */
  about: string
  order: number
}

/**
 * A marker (маячок): something planted in one place that must pay off in another.
 * State is derived: no payoff planned → "hanging", payoff planned → "waiting", resolved → "closed".
 */
export interface Marker extends Base {
  projectId: string
  title: string
  note: string
  setupSceneId?: string
  payoffSceneId?: string
  /** Planned at chapter level on the board, before the exact scene is known. */
  setupChapterId?: string
  payoffChapterId?: string
  resolved: boolean
  createdAt: number
}

export type NoteKind = 'idea' | 'question' | 'note' | 'quote' | 'dialogue'

/** A quick capture. Lives in the inbox until the author attaches or archives it. */
export interface Note extends Base {
  projectId?: string
  sceneId?: string
  text: string
  kind: NoteKind
  archived: boolean
  createdAt: number
  /** For quotes and dialogues: whose words these are. */
  characterIds?: string[]
  /** A quote or dialogue that has already made it into the text. */
  used?: boolean
}

/** A scene's text, stored apart from its card so plan edits and writing never collide. id = scene id. */
export interface SceneText extends Base {
  projectId: string
  /** TipTap JSON document. */
  content: unknown
  wordCount: number
}

/** A saved copy of a scene's text: manual versions and sync-conflict copies. */
export interface Snapshot extends Base {
  sceneId: string
  projectId: string
  content: unknown
  wordCount: number
  reason: string
  createdAt: number
}

export const SYNCED_TABLES = ['projects', 'chapters', 'scenes', 'texts', 'markers', 'notes', 'snapshots', 'lines', 'characters'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

export interface OutboxEntry {
  key: string // `${table}:${id}`
  table: SyncedTable
  id: string
}

export interface Meta {
  key: string
  value: unknown
}

export class ManuscriptDB extends Dexie {
  projects!: Table<Project, string>
  chapters!: Table<Chapter, string>
  scenes!: Table<Scene, string>
  texts!: Table<SceneText, string>
  markers!: Table<Marker, string>
  notes!: Table<Note, string>
  snapshots!: Table<Snapshot, string>
  lines!: Table<Line, string>
  characters!: Table<Character, string>
  outbox!: Table<OutboxEntry, string>
  meta!: Table<Meta, string>

  constructor(name = 'manuscript') {
    super(name)
    this.version(1).stores({
      projects: 'id, updatedAt',
      chapters: 'id, projectId, updatedAt',
      scenes: 'id, projectId, chapterId, updatedAt',
      texts: 'id, projectId, updatedAt',
      markers: 'id, projectId, setupSceneId, payoffSceneId, updatedAt',
      notes: 'id, projectId, sceneId, updatedAt',
      snapshots: 'id, sceneId, updatedAt',
      outbox: 'key',
      meta: 'key',
    })
    this.version(2).stores({
      lines: 'id, projectId, updatedAt',
      characters: 'id, projectId, updatedAt',
    })
  }
}

export let db = new ManuscriptDB()

/** Tests swap in a fresh database. */
export function useDatabase(next: ManuscriptDB) {
  db = next
}

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
