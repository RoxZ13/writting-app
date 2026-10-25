import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function stubStorage(init: Record<string, string> = {}) {
  const store = new Map(Object.entries(init))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.stubGlobal('document', { documentElement: { dataset: {} as Record<string, string> } })
  return store
}

describe('theme follows the system unless chosen by hand', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('a new device follows the system', async () => {
    stubStorage()
    const { getTheme } = await import('../lib/session')
    expect(getTheme()).toBe('auto')
  })

  // Every start used to save the default «light», so an old device holds it without anyone choosing it.
  it('a stored «light» that nobody chose counts as not chosen', async () => {
    stubStorage({ 'manuscript.theme': 'light' })
    const { getTheme } = await import('../lib/session')
    expect(getTheme()).toBe('auto')
  })

  it('a theme chosen in Settings stays, light included', async () => {
    stubStorage()
    const { applyTheme, getTheme } = await import('../lib/session')
    applyTheme('light')
    expect(getTheme()).toBe('light')
    applyTheme('paper')
    expect(getTheme()).toBe('paper')
  })

  it('showing a theme at start does not count as a choice', async () => {
    const store = stubStorage()
    const { showTheme, getTheme } = await import('../lib/session')
    showTheme(getTheme())
    expect(store.has('manuscript.theme')).toBe(false)
    expect(getTheme()).toBe('auto')
  })

  it('an old explicit «dark» or «paper» is kept', async () => {
    stubStorage({ 'manuscript.theme': 'dark' })
    const { getTheme } = await import('../lib/session')
    expect(getTheme()).toBe('dark')
  })
})
