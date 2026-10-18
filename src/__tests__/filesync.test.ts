import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db, type Project } from '../db/db'
import { createProject, patch } from '../db/repo'
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
})
