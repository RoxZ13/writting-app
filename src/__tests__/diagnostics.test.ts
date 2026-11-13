import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase } from '../db/db'
import { createProject } from '../db/repo'
import { collectStorageDiagnostics, formatBytes } from '../lib/diagnostics'

let n = 0

describe('storage diagnostics', () => {
  beforeEach(async () => {
    const database = new ManuscriptDB(`diagnostics-${++n}`)
    useDatabase(database)
    await database.open()
  })

  it('reports counts without manuscript contents', async () => {
    await createProject('Секретное название')
    const report = await collectStorageDiagnostics()
    expect(report.database).toBe(`diagnostics-${n}`)
    expect(report.counts.projects).toBe(1)
    expect(report.counts.scenes).toBe(1)
    expect(report.counts.texts).toBe(1)
    expect(report.counts.pending).toBeGreaterThan(0)
    expect(JSON.stringify(report)).not.toContain('Секретное название')
  })

  it('formats browser storage sizes compactly', () => {
    expect(formatBytes(undefined)).toBe('неизвестно')
    expect(formatBytes(512)).toBe('512 Б')
    expect(formatBytes(1536)).toBe('1.5 КБ')
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 МБ')
  })
})
