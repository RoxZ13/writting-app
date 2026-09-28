import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db, type Scene } from '../db/db'
import { createChapter, createScene, patch } from '../db/repo'
import { makeBackup, restoreBackup } from '../lib/backup'

let n = 0
describe('backup', () => {
  beforeEach(async () => {
    const d = new ManuscriptDB(`backup-${++n}`)
    useDatabase(d)
    await d.open()
  })

  it('brings back what was lost and keeps newer local edits', async () => {
    const c = await createChapter('p', 'Глава 1')
    const a = await createScene('p', c.id, 'a')
    const b = await createScene('p', c.id, 'b')
    const dump = JSON.parse(JSON.stringify(await makeBackup()))

    await db.scenes.delete(a.id) // lost on this device
    await new Promise((r) => setTimeout(r, 5))
    await patch<Scene>('scenes', b.id, { title: 'b — правка после копии' })
    await db.outbox.clear()

    const res = await restoreBackup(dump)
    expect(res.added).toBe(1)
    expect((await db.scenes.get(a.id))?.title).toBe('a')
    expect((await db.scenes.get(b.id))?.title).toBe('b — правка после копии')
    expect((await db.outbox.toArray()).map((o) => o.key)).toEqual([`scenes:${a.id}`])
  })
})
