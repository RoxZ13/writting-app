import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/environment', () => ({
  remoteSyncAllowed: () => false,
  previewCloudError: () => new Error('В тестовой версии облачная синхронизация отключена'),
}))

import { getSyncStatus, signIn, startCloudSync, syncNow as syncSupabase } from '../db/cloud'
import { getFileSyncState, startFileSync, syncNow as syncFile, type FileStore } from '../lib/filesync'
import { connectYandex, getYandexToken, takeYandexRedirect } from '../lib/yandex'

describe('preview cloud isolation', () => {
  const read = vi.fn<FileStore['read']>()
  const version = vi.fn<FileStore['version']>()
  const write = vi.fn<FileStore['write']>()
  const store: FileStore = { name: 'test', read, version, write }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not start or run file sync', async () => {
    startFileSync(store)
    await syncFile()
    expect(getFileSyncState()).toEqual({ state: 'off' })
    expect(read).not.toHaveBeenCalled()
    expect(version).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('does not start or run legacy Supabase sync', async () => {
    expect(() => startCloudSync()).not.toThrow()
    await syncSupabase()
    expect(getSyncStatus()).toEqual({ state: 'off' })
    await expect(signIn('author@example.test', 'password', false)).rejects.toThrow('облачная синхронизация отключена')
  })

  it('neither reads a shared token nor accepts an OAuth redirect', () => {
    expect(getYandexToken()).toBeNull()
    expect(takeYandexRedirect()).toBe(false)
    expect(() => connectYandex()).toThrow('облачная синхронизация отключена')
  })
})
