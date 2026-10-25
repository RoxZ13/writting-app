import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { connectYandex, getYandexToken, setYandexClientId, setYandexProxyUrl, takeYandexRedirect } from '../lib/yandex'

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
  let store: Map<string, string>
  beforeEach(() => {
    store = setup().store
    store.set('manuscript.yandex.token', JSON.stringify({ token: 'tok', expiresAt: Date.now() + 60_000 }))
  })
  afterEach(() => vi.unstubAllGlobals())

  const BACKUP = { projects: [{ id: 'p1', title: 'Книга' }] }
  const PROXY = 'https://proxy.test/fn'

  /** Disk API answers the version request; the proxy answers with whatever the test hands it. */
  function stubFetch(proxyAnswer: () => Response) {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url === PROXY) return proxyAnswer()
      if (url.includes('/resources?')) return new Response(JSON.stringify({ revision: 7 }))
      return new Response('', { status: 404 })
    })
    return calls
  }

  it('reads through the proxy: text/plain POST with token and path, gzipped answer', async () => {
    setYandexProxyUrl(PROXY)
    const calls = stubFetch(() => new Response(gzipSync(Buffer.from(JSON.stringify(BACKUP)))))
    const { yandexStore } = await import('../lib/yandex')
    const got = await yandexStore().read()
    expect(got?.version).toBe('7')
    expect(got?.data).toEqual(BACKUP)
    const call = calls.find((c) => c.url === PROXY)!
    expect(call.init?.method).toBe('POST')
    expect((call.init?.headers as Record<string, string>)['Content-Type']).toBe('text/plain')
    expect(JSON.parse(call.init?.body as string)).toEqual({ token: 'tok', path: 'app:/manuscript.json' })
    // The token goes to the proxy in the body only, never to the download host.
    expect(calls.some((c) => c.url.includes('/resources/download'))).toBe(false)
  })

  it('also reads a plain JSON answer from the proxy', async () => {
    setYandexProxyUrl(PROXY)
    stubFetch(() => new Response(JSON.stringify(BACKUP)))
    const { yandexStore } = await import('../lib/yandex')
    expect((await yandexStore().read())?.data).toEqual(BACKUP)
  })

  it('returns null when the proxy says there is no file yet', async () => {
    setYandexProxyUrl(PROXY)
    stubFetch(() => new Response('{}', { status: 404 }))
    const { yandexStore } = await import('../lib/yandex')
    expect(await yandexStore().read()).toBeNull()
  })

  it('forgets the token and asks to sign in again when the proxy says 401', async () => {
    setYandexProxyUrl(PROXY)
    stubFetch(() => new Response('{}', { status: 401 }))
    const { yandexStore } = await import('../lib/yandex')
    await expect(yandexStore().read()).rejects.toThrow('Яндекс Диск попросил войти заново')
    expect(getYandexToken()).toBeNull()
  })

  it('shows an error with the status for other proxy failures', async () => {
    setYandexProxyUrl(PROXY)
    stubFetch(() => new Response('{}', { status: 502 }))
    const { yandexStore } = await import('../lib/yandex')
    await expect(yandexStore().read()).rejects.toThrow('502')
  })

  it('shows a network message when the proxy cannot be reached', async () => {
    setYandexProxyUrl(PROXY)
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const { yandexStore } = await import('../lib/yandex')
    await expect(yandexStore().read()).rejects.toThrow('Проверь интернет')
  })

  it('without a proxy the direct download still sends the token, and a failure explains the proxy is needed', async () => {
    const calls: { url: string; auth?: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      calls.push({ url, auth })
      if (url.includes('/resources/download')) return new Response(JSON.stringify({ href: 'https://downloader.disk.yandex.ru/disk/abc' }))
      if (url.includes('/resources?')) return new Response(JSON.stringify({ revision: 7 }))
      if (url.startsWith('https://downloader.')) return auth ? new Response(JSON.stringify(BACKUP)) : new Response('', { status: 403 })
      return new Response('', { status: 404 })
    })
    const { yandexStore } = await import('../lib/yandex')
    const got = await yandexStore().read()
    expect(got?.data).toEqual(BACKUP)
    expect(calls.find((c) => c.url.startsWith('https://downloader.'))?.auth).toBe('OAuth tok')

    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('/resources/download')) return new Response(JSON.stringify({ href: 'https://downloader.disk.yandex.ru/disk/abc' }))
      if (url.includes('/resources?')) return new Response(JSON.stringify({ revision: 7 }))
      throw new TypeError('Failed to fetch')
    })
    await expect(yandexStore().read()).rejects.toThrow('нужен прокси')
  })
})
