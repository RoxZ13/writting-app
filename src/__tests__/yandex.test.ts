import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectYandex, getYandexToken, setYandexClientId, takeYandexRedirect } from '../lib/yandex'

function setup() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  })
  const loc = { origin: 'https://app.test', pathname: '/', hash: '', assign: vi.fn() }
  vi.stubGlobal('location', loc)
  const replaceState = vi.fn()
  vi.stubGlobal('history', { replaceState })
  return { store, loc, replaceState }
}

/** Starts a sign-in and returns the state that was sent to Yandex. */
function connect(loc: ReturnType<typeof setup>['loc']): string {
  setYandexClientId('test-client')
  connectYandex()
  const url = new URL(loc.assign.mock.calls[0][0] as string)
  return url.searchParams.get('state')!
}

describe('Yandex OAuth state (login CSRF)', () => {
  let env: ReturnType<typeof setup>
  beforeEach(() => {
    env = setup()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('rejects a crafted link when no sign-in was started', () => {
    env.loc.hash = '#access_token=ATTACKER&state=manuscript-yandex'
    expect(takeYandexRedirect()).toBe(false)
    expect(getYandexToken()).toBeNull()
    expect(env.replaceState).toHaveBeenCalled()
  })

  it('sends a random state, different each time', () => {
    const a = connect(env.loc)
    env.loc.assign.mockClear()
    const b = connect(env.loc)
    expect(a).not.toBe('manuscript-yandex')
    expect(a.length).toBeGreaterThanOrEqual(16)
    expect(a).not.toBe(b)
  })

  it('accepts the token on a correct round trip, once', () => {
    const state = connect(env.loc)
    env.loc.hash = `#access_token=GOOD&expires_in=3600&state=${state}`
    expect(takeYandexRedirect()).toBe(true)
    expect(getYandexToken()?.token).toBe('GOOD')
    // the state is spent: replaying the same link does nothing
    env.store.delete('manuscript.yandex.token')
    expect(takeYandexRedirect()).toBe(false)
    expect(getYandexToken()).toBeNull()
  })

  it('rejects a wrong state and spends the stored one', () => {
    const state = connect(env.loc)
    env.loc.hash = '#access_token=ATTACKER&state=manuscript-yandex'
    expect(takeYandexRedirect()).toBe(false)
    expect(getYandexToken()).toBeNull()
    env.loc.hash = `#access_token=LATE&state=${state}`
    expect(takeYandexRedirect()).toBe(false)
    expect(getYandexToken()).toBeNull()
  })

  it('rejects a state older than 15 minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'))
    const state = connect(env.loc)
    vi.setSystemTime(new Date('2026-10-18T10:16:00Z'))
    env.loc.hash = `#access_token=STALE&state=${state}`
    expect(takeYandexRedirect()).toBe(false)
    expect(getYandexToken()).toBeNull()
  })
})

describe('Yandex Disk file store', () => {
  beforeEach(() => {
    const { store } = setup()
    store.set('manuscript.yandex.token', JSON.stringify({ token: 'tok', expiresAt: Date.now() + 60_000 }))
  })
  afterEach(() => vi.unstubAllGlobals())

  // The download host answers 403 to a browser fetch without the token: cookies of yandex.ru never reach it from another site.
  it('sends the token with the download of the file itself, not only to the API', async () => {
    const calls: { url: string; auth?: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      calls.push({ url, auth })
      if (url.includes('/resources/download')) return new Response(JSON.stringify({ href: 'https://downloader.disk.yandex.ru/disk/abc' }))
      if (url.includes('/resources?')) return new Response(JSON.stringify({ revision: 7 }))
      if (url.startsWith('https://downloader.')) return auth ? new Response(JSON.stringify({ projects: [] })) : new Response('', { status: 403 })
      return new Response('', { status: 404 })
    })
    const { yandexStore } = await import('../lib/yandex')
    const got = await yandexStore().read()
    expect(got?.version).toBe('7')
    expect(calls.find((c) => c.url.startsWith('https://downloader.'))?.auth).toBe('OAuth tok')
  })
})
