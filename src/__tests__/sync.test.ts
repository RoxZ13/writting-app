import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db, type Base, type SceneText, type Project, type SyncedTable } from '../db/db'
import { createProject, patch } from '../db/repo'
import { syncOnce, type Remote, type RemoteRow } from '../db/sync'

/** In-memory stand-in for the Supabase table, with the same "older write never wins" rule. */
function fakeServer() {
  let seq = 0
  const rows = new Map<string, RemoteRow>()
  const remote: Remote = {
    async pull(since) {
      return [...rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq)
    },
    async push(batch) {
      for (const r of batch) {
        const key = `${r.kind}:${r.id}`
        const old = rows.get(key)
        if (old && r.updated_at < old.updated_at) continue
        rows.set(key, { ...r, data: structuredClone(r.data), seq: ++seq })
      }
    },
  }
  return { remote, rows }
}

let n = 0
async function freshDevice() {
  const d = new ManuscriptDB(`test-${++n}`)
  useDatabase(d)
  await d.open()
  return d
}

describe('sync', () => {
  beforeEach(async () => {
    await freshDevice()
  })

  it('copies a project from one device to another', async () => {
    const server = fakeServer()
    const a = db
    await createProject('Геката')
    await syncOnce(server.remote)
    expect(await a.outbox.count()).toBe(0)

    const b = await freshDevice()
    await syncOnce(server.remote)
    const projects = await b.projects.toArray()
    expect(projects.map((p) => p.title)).toEqual(['Геката'])
    expect(await b.scenes.count()).toBe(1)
  })

  it('works offline: writes stay queued until a sync succeeds', async () => {
    const server = fakeServer()
    await createProject('Офлайн')
    expect(await db.outbox.count()).toBeGreaterThan(0)
    const failing: Remote = { pull: async () => { throw new Error('offline') }, push: async () => {} }
    await expect(syncOnce(failing)).rejects.toThrow()
    expect(await db.outbox.count()).toBeGreaterThan(0)
    await syncOnce(server.remote)
    expect(await db.outbox.count()).toBe(0)
  })

  it('never loses local text when another device wrote the same scene later', async () => {
    const server = fakeServer()
    await createProject('Конфликт')
    await syncOnce(server.remote)
    const a = db
    const scene = (await a.scenes.toArray())[0]

    const b = await freshDevice()
    await syncOnce(server.remote)

    // Device A edits offline first…
    useDatabase(a)
    await patch<SceneText>('texts', scene.id, { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст с ноутбука' }] }] } })
    await new Promise((r) => setTimeout(r, 5))
    // …device B edits later and syncs first.
    useDatabase(b)
    await patch<SceneText>('texts', scene.id, { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст с айпада' }] }] } })
    await syncOnce(server.remote)

    useDatabase(a)
    const result = await syncOnce(server.remote)
    expect(result.conflicts).toBe(1)
    const merged = await a.texts.get(scene.id)
    expect(JSON.stringify(merged!.content)).toContain('айпада')
    const snaps = await a.snapshots.where('sceneId').equals(scene.id).toArray()
    expect(JSON.stringify(snaps[0].content)).toContain('ноутбука')
  })

  it('keeps a newer local edit instead of an older remote one', async () => {
    const server = fakeServer()
    await createProject('Новее')
    await syncOnce(server.remote)
    const p = (await db.projects.toArray())[0]
    // simulate an old remote write arriving
    server.rows.set(`projects:${p.id}`, {
      id: p.id, kind: 'projects' as SyncedTable, seq: 999,
      data: { ...p, title: 'Старое', updatedAt: 1 } as Base, updated_at: 1,
    })
    await patch<Project>('projects', p.id, { title: 'Новое' })
    await syncOnce(server.remote)
    expect((await db.projects.get(p.id))!.title).toBe('Новое')
  })
})
