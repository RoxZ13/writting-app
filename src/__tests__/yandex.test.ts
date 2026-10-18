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
