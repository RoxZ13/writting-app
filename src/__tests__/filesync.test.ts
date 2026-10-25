import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db, type Project, type SceneText } from '../db/db'
import { createProject, patch, remove } from '../db/repo'
import type { Backup } from '../lib/backup'
import { syncWithStore, type FileStore } from '../lib/filesync'

/** A cloud disk in memory: one file and a version that changes on every write. */
function fakeDisk() {
  let file: { data: Backup; version: string } | null = null
  let n = 0
  const store: FileStore = {
    name: 'test',
    async read() {
      return file && { data: structuredClone(file.data), version: file.version }
    },
    async version() {
      return file?.version ?? null
    },
    async write(data) {
      file = { data: structuredClone(data), version: String(++n) }
    },
  }
  return { store, peek: () => file }
}

let k = 0
const device = () => useDatabase(new ManuscriptDB(`filesync-${++k}`))
const titles = async () => (await db.projects.toArray()).map((p) => p.title).sort()

describe('sync through a file in the cloud', () => {
  it('two devices end up with the same stories', async () => {
    const disk = fakeDisk()
    device()
    await createProject('С компьютера')
    await syncWithStore(disk.store)

    device()
    await createProject('С телефона')
    await syncWithStore(disk.store)
    expect(await titles()).toEqual(['С компьютера', 'С телефона'])
    expect((disk.peek()!.data.projects as Project[]).map((p) => p.title).sort()).toEqual(['С компьютера', 'С телефона'])
  })

  it('the newer change of a record wins', async () => {
    const disk = fakeDisk()
    device()
    const p = await createProject('Черновик')
    await syncWithStore(disk.store)
    await new Promise((r) => setTimeout(r, 5))
    await patch<Project>('projects', p.id, { title: 'Соль и пепел' })
    await syncWithStore(disk.store)

    device()
    await syncWithStore(disk.store)
    expect(await titles()).toEqual(['Соль и пепел'])
  })

  it('a write from another device in the middle is taken in, not overwritten', async () => {
    const disk = fakeDisk()
    device()
    await createProject('Первая')
    await syncWithStore(disk.store)

    // The other device writes right after this one has read the file.
    let sneaked = false
    const racy: FileStore = {
      ...disk.store,
      async version() {
        if (!sneaked) {
          sneaked = true
          const f = (await disk.store.read())!
          f.data.projects = [...(f.data.projects as Project[]), { id: 'x', title: 'С телефона', updatedAt: Date.now() } as Project]
          await disk.store.write(f.data)
        }
        return disk.store.version()
      },
    }
    await createProject('Вторая')
    await syncWithStore(racy)
    expect(await titles()).toEqual(['Вторая', 'Первая', 'С телефона'])
    expect((disk.peek()!.data.projects as Project[]).length).toBe(3)
  })

  describe('the same scene text edited on two devices', () => {
    const doc = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
    const textOf = (c: unknown) => JSON.stringify(c)
    const wait = () => new Promise((r) => setTimeout(r, 5))
    /** Two devices that have both synced the same story. */
    async function twoDevices() {
      const disk = fakeDisk()
      const A = new ManuscriptDB(`filesync-a-${++k}`)
      const B = new ManuscriptDB(`filesync-b-${++k}`)
      useDatabase(A)
      await createProject('Общая')
      await syncWithStore(disk.store)
      useDatabase(B)
      await syncWithStore(disk.store)
      const sceneId = (await B.scenes.toArray())[0].id
      return { disk, A, B, sceneId }
    }
    const edit = (id: string, t: string, updatedAt?: number) =>
      updatedAt === undefined
        ? patch<SceneText>('texts', id, { content: doc(t), wordCount: 1 })
        : db.transaction('rw', db.texts, db.outbox, async () => {
            await db.texts.update(id, { content: doc(t), wordCount: 1, updatedAt })
            await db.outbox.put({ key: `texts:${id}`, table: 'texts', id })
          })
    const snaps = async (sceneId: string) => (await db.snapshots.where('sceneId').equals(sceneId).toArray()).filter((s) => !s.deleted)
    const allTexts = async (sceneId: string) => [
      textOf((await db.texts.get(sceneId))!.content),
      ...(await snaps(sceneId)).map((s) => textOf(s.content)),
    ]

    it('keeps both versions: one as the text, the other as a snapshot', async () => {
      const { disk, A, B, sceneId } = await twoDevices()
      useDatabase(A)
      await edit(sceneId, 'правка с компьютера')
      await wait()
      useDatabase(B)
      await edit(sceneId, 'правка с телефона')

      useDatabase(A)
      await syncWithStore(disk.store)
      useDatabase(B)
      await syncWithStore(disk.store)
      useDatabase(A)
      await syncWithStore(disk.store)
      useDatabase(B)
      await syncWithStore(disk.store)

      for (const d of [A, B]) {
        useDatabase(d)
        const all = await allTexts(sceneId)
        expect(all, 'both versions must survive on every device').toContain(textOf(doc('правка с компьютера')))
        expect(all).toContain(textOf(doc('правка с телефона')))
        expect((await snaps(sceneId)).length).toBe(1)
        expect(textOf((await db.texts.get(sceneId))!.content)).toBe(textOf(doc('правка с телефона')))
      }
    })

    it('one device editing alone leaves no snapshots', async () => {
      const { disk, A, B, sceneId } = await twoDevices()
      useDatabase(A)
      await edit(sceneId, 'первая')
      await syncWithStore(disk.store)
      await wait()
      await edit(sceneId, 'вторая')
      await syncWithStore(disk.store)
      useDatabase(B)
      await syncWithStore(disk.store)
      await syncWithStore(disk.store)
      useDatabase(A)
      await syncWithStore(disk.store)
      for (const d of [A, B]) {
        useDatabase(d)
        expect(await snaps(sceneId)).toEqual([])
        expect(textOf((await db.texts.get(sceneId))!.content)).toBe(textOf(doc('вторая')))
      }
    })

    it('keeps both texts even when the clock of the stale edit is ahead', async () => {
      const { disk, A, B, sceneId } = await twoDevices()
      useDatabase(A)
      await edit(sceneId, 'часы спешат', Date.now() + 3_600_000)
      useDatabase(B)
      await edit(sceneId, 'часы верные')

      useDatabase(A)
      await syncWithStore(disk.store)
      useDatabase(B)
      await syncWithStore(disk.store)
      useDatabase(A)
      await syncWithStore(disk.store)
      useDatabase(B)
      await syncWithStore(disk.store)

      for (const d of [A, B]) {
        useDatabase(d)
        const all = await allTexts(sceneId)
        expect(all).toContain(textOf(doc('часы спешат')))
        expect(all).toContain(textOf(doc('часы верные')))
      }
    })
  })

  it('a story deleted on one device is deleted on the other (no revival)', async () => {
    const disk = fakeDisk()
    const A = new ManuscriptDB(`filesync-a-${++k}`)
    const B = new ManuscriptDB(`filesync-b-${++k}`)
    useDatabase(A)
    const p = await createProject('Ненужная')
    await syncWithStore(disk.store)
    useDatabase(B)
    await syncWithStore(disk.store)
    expect((await db.projects.get(p.id))?.deleted).toBeFalsy()

    useDatabase(A)
    await new Promise((r) => setTimeout(r, 5))
    await remove('projects', p.id)
    await syncWithStore(disk.store)

    useDatabase(B)
    await syncWithStore(disk.store)
    expect((await db.projects.get(p.id))?.deleted).toBe(true)
    useDatabase(A)
    await syncWithStore(disk.store)
    expect((await db.projects.get(p.id))?.deleted).toBe(true)
  })
})
