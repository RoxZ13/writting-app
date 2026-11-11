import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { ManuscriptDB, useDatabase, db, type Project, type SceneText } from '../db/db'
import { createProject, patch, remove } from '../db/repo'
import type { Backup } from '../lib/backup'
import { syncWithStore, type FileStore } from '../lib/filesync'

/** A cloud disk in memory: one independently replaceable snapshot per device. */
function fakeDisk() {
  const files = new Map<string, { data: Backup; version: string }>()
  let last: { data: Backup; version: string } | null = null
  let n = 0
  const store: FileStore = {
    name: 'test',
    async read() {
      return [...files.entries()].map(([source, file]) => ({ source, data: structuredClone(file.data), version: file.version }))
    },
    async write(data, slot) {
      last = { data: structuredClone(data), version: String(++n) }
      files.set(slot, last)
    },
  }
  return {
    store,
    peek: () => last,
    put: (slot: string, data: Backup) => files.set(slot, { data: structuredClone(data), version: String(++n) }),
    count: () => files.size,
  }
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

  it('a device with the correct clock can edit after receiving a future-dated change', async () => {
    let now = new Date('2026-11-11T10:00:00Z').getTime()
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      const disk = fakeDisk()
      const A = new ManuscriptDB(`filesync-clock-a-${++k}`)
      const B = new ManuscriptDB(`filesync-clock-b-${++k}`)
      useDatabase(A)
      const p = await createProject('Общая')
      await syncWithStore(disk.store)
      useDatabase(B)
      await syncWithStore(disk.store)

      now = new Date('2026-11-11T11:00:00Z').getTime()
      useDatabase(A)
      await patch<Project>('projects', p.id, { title: 'Часы спешат' })
      await syncWithStore(disk.store)

      now = new Date('2026-11-11T10:01:00Z').getTime()
      useDatabase(B)
      await syncWithStore(disk.store)
      await patch<Project>('projects', p.id, { title: 'Правка после синхронизации' })
      await syncWithStore(disk.store)
      useDatabase(A)
      await syncWithStore(disk.store)
      expect((await db.projects.get(p.id))?.title).toBe('Правка после синхронизации')
    } finally {
      clock.mockRestore()
    }
  })

  it('a write from another device in the middle remains available and is taken in next round', async () => {
    const disk = fakeDisk()
    device()
    await createProject('Первая')
    await syncWithStore(disk.store)

    // The other device writes right after this one has listed the files.
    let sneaked = false
    const racy: FileStore = {
      ...disk.store,
      async read() {
        const seen = await disk.store.read()
        if (!sneaked) {
          sneaked = true
          const first = structuredClone(seen[0].data)
          first.projects = [...(first.projects as Project[]), { id: 'x', title: 'С телефона', updatedAt: Date.now() } as Project]
          disk.put('phone', first)
        }
        return seen
      },
    }
    await createProject('Вторая')
    await syncWithStore(racy)
    expect(disk.count()).toBe(2)
    await syncWithStore(racy)
    expect(await titles()).toEqual(['Вторая', 'Первая', 'С телефона'])
    expect((disk.peek()!.data.projects as Project[]).length).toBe(3)
  })

  it('archives the losing side when the same metadata is edited concurrently', async () => {
    const disk = fakeDisk()
    const A = new ManuscriptDB(`filesync-conflict-a-${++k}`)
    const B = new ManuscriptDB(`filesync-conflict-b-${++k}`)
    useDatabase(A)
    const p = await createProject('Общая')
    await syncWithStore(disk.store)
    useDatabase(B)
    await syncWithStore(disk.store)
    const baseline = await disk.store.read()
    const isolated: FileStore = { ...disk.store, read: async () => structuredClone(baseline) }

    useDatabase(A)
    await patch<Project>('projects', p.id, { title: 'Вариант с компьютера' })
    await syncWithStore(isolated)
    useDatabase(B)
    await patch<Project>('projects', p.id, { title: 'Вариант с телефона' })
    await syncWithStore(isolated)

    useDatabase(A)
    await syncWithStore(disk.store)
    useDatabase(B)
    await syncWithStore(disk.store)
    useDatabase(A)
    await syncWithStore(disk.store)

    for (const d of [A, B]) {
      useDatabase(d)
      const conflicts = await db.conflicts.where('recordId').equals(p.id).toArray()
      expect(conflicts).toHaveLength(1)
      const titles = [(conflicts[0].losing as Project).title, (conflicts[0].winning as Project).title].sort()
      expect(titles).toEqual(['Вариант с компьютера', 'Вариант с телефона'])
    }
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
    const edit = (id: string, t: string) => patch<SceneText>('texts', id, { content: doc(t), wordCount: 1 })
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
      let now = Date.now() + 3_600_000
      const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
      try {
        useDatabase(A)
        await edit(sceneId, 'часы спешат')
        now -= 3_599_000
        useDatabase(B)
        await edit(sceneId, 'часы верные')
      } finally {
        clock.mockRestore()
      }

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
