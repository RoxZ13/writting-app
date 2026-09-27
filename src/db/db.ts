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
  /** "Note to future self", written when finishing a session. */
  nextStep?: string
}

export interface Chapter extends Base {
  projectId: string
  title: string
  order: number
  /** What this chapter is for, in one or two sentences. */
  goal: string
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
  resolved: boolean
  createdAt: number
}

export type NoteKind = 'idea' | 'question' | 'note'

/** A quick capture. Lives in the inbox until the author attaches or archives it. */
export interface Note extends Base {
  projectId?: string
  sceneId?: string
  text: string
  kind: NoteKind
  archived: boolean
  createdAt: number
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

export const SYNCED_TABLES = ['projects', 'chapters', 'scenes', 'texts', 'markers', 'notes', 'snapshots'] as const
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
  }
}

export let db = new ManuscriptDB()

/** Tests swap in a fresh database. */
export function useDatabase(next: ManuscriptDB) {
  db = next
}

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
