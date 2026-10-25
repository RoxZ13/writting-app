import type { Backup } from './backup'
import type { FileStore } from './filesync'

/**
 * Яндекс Диск as a sync store. The app sees only its own folder «Приложения/Manuscript» on the
 * author's Disk — nothing else there. Sign-in is Yandex's own page (OAuth, token flow for apps
 * without a server); the token stays on this device.
 *
 * The owner registers the app once at oauth.yandex.ru (rights: «Доступ к папке приложения на Диске»)
 * and gives its ClientID in VITE_YANDEX_CLIENT_ID — or pastes it in Settings.
 */

const API = 'https://cloud-api.yandex.net/v1/disk'
const FILE = 'app:/manuscript.json'
const TOKEN_KEY = 'manuscript.yandex.token'
const CLIENT_KEY = 'manuscript.yandex.client'
const STATE_KEY = 'manuscript.yandex.state'
const STATE_TTL = 15 * 60 * 1000

export function getYandexClientId(): string | null {
  try {
    const saved = localStorage.getItem(CLIENT_KEY)
    if (saved) return saved
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_YANDEX_CLIENT_ID as string | undefined) || null
}
export function setYandexClientId(id: string) {
  try {
    if (id.trim()) localStorage.setItem(CLIENT_KEY, id.trim())
    else localStorage.removeItem(CLIENT_KEY)
  } catch {
    /* ignore */
  }
}

interface Token {
  token: string
  expiresAt: number
}
export function getYandexToken(): Token | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as Token | null
    return t && t.expiresAt > Date.now() ? t : null
  } catch {
    return null
  }
}
export function forgetYandex() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/** Where Yandex sends the author back: this very page, without the route (it must match the app's Callback URI). */
export const yandexRedirectUri = () => `${location.origin}${location.pathname}`

/** Off to Yandex's sign-in page; it comes back with the token in the address. */
export function connectYandex() {
  const id = getYandexClientId()
  if (!id) throw new Error('Подключение к Яндекс Диску ещё не настроено')
  // A fresh random state per sign-in: only a redirect that carries it back is ours (blocks login CSRF).
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ state, at: Date.now() }))
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams({ response_type: 'token', client_id: id, redirect_uri: yandexRedirectUri(), state, force_confirm: 'yes' })
  location.assign(`https://oauth.yandex.ru/authorize?${q}`)
}

/**
 * Called once on start: if Yandex has just sent the author back, keep the token and clean the address.
 * Returns true when a fresh sign-in came in (Settings then opens to show it worked).
 */
export function takeYandexRedirect(): boolean {
  const hash = location.hash.replace(/^#/, '')
  if (!hash.includes('access_token=') && !hash.includes('error=')) return false
  const p = new URLSearchParams(hash)
  // The stored state is single-use: read it, then delete it whatever the outcome.
  let expected: { state?: string; at?: number } | null = null
  try {
    expected = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null')
    localStorage.removeItem(STATE_KEY)
  } catch {
    /* ignore */
  }
  const age = typeof expected?.at === 'number' ? Date.now() - expected.at : Infinity
  const ok = !!expected?.state && age >= 0 && age < STATE_TTL && p.get('state') === expected.state
  const token = ok ? p.get('access_token') : null
  if (token) {
    const ttl = Number(p.get('expires_in') || 31536000) * 1000
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + ttl }))
    } catch {
      /* ignore */
    }
  }
  history.replaceState(null, '', `${location.pathname}#/settings`)
  return !!token
}

async function call(path: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `OAuth ${token}`, Accept: 'application/json' } })
  if (res.status === 401) {
    forgetYandex()
    throw new Error('Яндекс Диск попросил войти заново. Нажми «Подключить» ещё раз.')
  }
  return res
}

export function yandexStore(): FileStore {
  const token = () => {
    const t = getYandexToken()
    if (!t) throw new Error('Яндекс Диск не подключён')
    return t.token
  }
  const meta = async (): Promise<string | null> => {
    const res = await call(`/resources?path=${encodeURIComponent(FILE)}&fields=modified,revision`, token())
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Яндекс Диск ответил ошибкой ${res.status}`)
    const j = (await res.json()) as { revision?: number; modified?: string }
    return String(j.revision ?? j.modified ?? '')
  }
  return {
    name: 'Яндекс Диск',
    version: meta,
    async read() {
      const version = await meta()
      if (version === null) return null
      const link = await call(`/resources/download?path=${encodeURIComponent(FILE)}`, token())
      if (!link.ok) throw new Error(`Не получилось скачать с Яндекс Диска (${link.status})`)
      const { href } = (await link.json()) as { href: string }
      // The download host wants the token too: from another site the browser sends no yandex.ru cookies, and without it the answer is 403.
      let file: Response
      try {
        file = await fetch(href, { headers: { Authorization: `OAuth ${token()}` } })
      } catch {
        throw new Error('Не получилось скачать файл с Яндекс Диска. Проверь интернет и попробуй ещё раз.')
      }
      if (!file.ok) throw new Error(`Не получилось скачать с Яндекс Диска (${file.status})`)
      return { data: (await file.json()) as Backup, version }
    },
    async write(data) {
      const link = await call(`/resources/upload?path=${encodeURIComponent(FILE)}&overwrite=true`, token())
      if (!link.ok) throw new Error(`Яндекс Диск не дал записать файл (${link.status})`)
      const { href } = (await link.json()) as { href: string }
      let res: Response
      try {
        res = await fetch(href, { method: 'PUT', body: new Blob([JSON.stringify(data)], { type: 'application/json' }) })
      } catch {
        throw new Error('Не получилось отправить файл на Яндекс Диск. Проверь интернет и попробуй ещё раз.')
      }
      if (!res.ok) throw new Error(`Не получилось записать на Яндекс Диск (${res.status})`)
    },
  }
}
