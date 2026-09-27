import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from './db'
import { onLocalChange } from './repo'
import { queueEverything, resetSyncCursor, syncOnce, type Remote, type RemoteRow } from './sync'

const TABLE = 'manuscript_records'
const CONFIG_KEY = 'manuscript.cloud'

export interface CloudConfig {
  url: string
  anonKey: string
}

export function getCloudConfig(): CloudConfig | null {
  try {
    const saved = localStorage.getItem(CONFIG_KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    /* ignore */
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && anonKey ? { url, anonKey } : null
}

export function setCloudConfig(cfg: CloudConfig | null) {
  if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  else localStorage.removeItem(CONFIG_KEY)
  client = null
}

let client: SupabaseClient | null = null
export async function getClient(): Promise<SupabaseClient | null> {
  const cfg = getCloudConfig()
  if (!cfg) return null
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js')
    client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  }
  return client
}

function supabaseRemote(sb: SupabaseClient): Remote {
  return {
    async pull(sinceSeq) {
      const out: RemoteRow[] = []
      let from = sinceSeq
      for (;;) {
        const { data, error } = await sb
          .from(TABLE)
          .select('id, kind, data, updated_at, seq')
          .gt('seq', from)
          .order('seq', { ascending: true })
          .limit(500)
        if (error) throw error
        out.push(...(data as RemoteRow[]))
        if (!data || data.length < 500) break
        from = (data[data.length - 1] as RemoteRow).seq
      }
      return out
    },
    async push(rows) {
      const { error } = await sb.from(TABLE).upsert(rows, { onConflict: 'user_id,kind,id' })
      if (error) throw error
    },
  }
}

// ---------------- controller ----------------

export type SyncStatus =
  | { state: 'off' }
  | { state: 'signed-out' }
  | { state: 'offline' }
  | { state: 'syncing' }
  | { state: 'ok'; at: number }
  | { state: 'error'; message: string }

let status: SyncStatus = { state: 'off' }
const statusListeners = new Set<(s: SyncStatus) => void>()
export const getSyncStatus = () => status
export function onSyncStatus(fn: (s: SyncStatus) => void) {
  statusListeners.add(fn)
  return () => {
    statusListeners.delete(fn)
  }
}
function setStatus(s: SyncStatus) {
  status = s
  statusListeners.forEach((fn) => fn(s))
}

let running = false
let again = false

export async function syncNow() {
  if (running) {
    again = true
    return
  }
  const sb = await getClient()
  if (!sb) return setStatus({ state: 'off' })
  const { data } = await sb.auth.getSession()
  if (!data.session) return setStatus({ state: 'signed-out' })
  if (!navigator.onLine) return setStatus({ state: 'offline' })
  running = true
  setStatus({ state: 'syncing' })
  try {
    await syncOnce(supabaseRemote(sb))
    setStatus({ state: 'ok', at: Date.now() })
  } catch (e) {
    setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) })
  } finally {
    running = false
    if (again) {
      again = false
      void syncNow()
    }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
function scheduleSync(delay = 4000) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

let started = false
export function startCloudSync() {
  if (started) return
  started = true
  onLocalChange(() => scheduleSync())
  window.addEventListener('online', () => scheduleSync(500))
  window.addEventListener('offline', () => setStatus({ state: 'offline' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void syncNow()
    else scheduleSync(300)
  })
  setInterval(() => void syncNow(), 60_000)
  void syncNow()
}

export async function signIn(email: string, password: string, createAccount: boolean) {
  const sb = await getClient()
  if (!sb) throw new Error('Облако не настроено')
  const { error } = createAccount
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
  // First sign-in on this device: upload everything written here, then download the rest.
  await resetSyncCursor()
  await queueEverything()
  await syncNow()
}

export async function signOut() {
  const sb = await getClient()
  await sb?.auth.signOut()
  await db.meta.delete('sync.cursor')
  setStatus({ state: 'signed-out' })
}

export async function currentEmail(): Promise<string | null> {
  const sb = await getClient()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session?.user.email ?? null
}
