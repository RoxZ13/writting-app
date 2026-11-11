import { db, uid, type Base } from '../db/db'

const CLOCK_KEY = 'sync.clock.v1'
const DEVICE_KEY = 'sync.device.v1'

const legacyClock = (row: Base | undefined) => Math.max(0, row?.updatedAt ?? 0)

export function revisionParts(row: Base | undefined): { clock: number; device: string } {
  const raw = row?.syncRev
  if (raw) {
    const split = raw.indexOf(':')
    const clock = Number.parseInt(split < 0 ? raw : raw.slice(0, split), 36)
    if (Number.isSafeInteger(clock) && clock >= 0) return { clock, device: split < 0 ? '' : raw.slice(split + 1) }
  }
  return { clock: legacyClock(row), device: 'legacy' }
}

/** Deterministic order: logical time first, device id second, stable content last for malformed legacy ties. */
export function compareRows(a: Base | undefined, b: Base | undefined): number {
  const ar = revisionParts(a)
  const br = revisionParts(b)
  if (ar.clock !== br.clock) return ar.clock < br.clock ? -1 : 1
  if (ar.device !== br.device) return ar.device < br.device ? -1 : 1
  const aj = JSON.stringify(a ?? null)
  const bj = JSON.stringify(b ?? null)
  return aj === bj ? 0 : aj < bj ? -1 : 1
}

export const revisionToken = (row: Base | undefined): string | number | undefined => row && (row.syncRev ?? row.updatedAt)

const tokenParts = (value: string | number | undefined): { clock: number; device: string } => {
  if (typeof value === 'number') return { clock: Math.max(0, value), device: 'legacy' }
  if (typeof value === 'string') {
    const split = value.indexOf(':')
    const clock = Number.parseInt(split < 0 ? value : value.slice(0, split), 36)
    if (Number.isSafeInteger(clock) && clock >= 0) return { clock, device: split < 0 ? '' : value.slice(split + 1) }
  }
  return { clock: 0, device: '' }
}

export function compareRevisionTokens(a: string | number | undefined, b: string | number | undefined): number {
  const ar = tokenParts(a)
  const br = tokenParts(b)
  if (ar.clock !== br.clock) return ar.clock < br.clock ? -1 : 1
  return ar.device === br.device ? 0 : ar.device < br.device ? -1 : 1
}

async function deviceId(): Promise<string> {
  const saved = (await db.meta.get(DEVICE_KEY))?.value
  if (typeof saved === 'string' && saved) return saved
  const id = uid()
  await db.meta.put({ key: DEVICE_KEY, value: id })
  return id
}

/** Called inside a transaction that includes db.meta. */
export async function nextRevision(current?: Base): Promise<Pick<Base, 'syncRev' | 'syncVersion'>> {
  const stored = Number((await db.meta.get(CLOCK_KEY))?.value ?? 0)
  const clock = Math.max(Number.isSafeInteger(stored) ? stored : 0, revisionParts(current).clock, Date.now()) + 1
  await db.meta.put({ key: CLOCK_KEY, value: clock })
  const device = await deviceId()
  const syncVersion = { ...(current?.syncVersion ?? {}) }
  syncVersion[device] = (syncVersion[device] ?? 0) + 1
  return { syncRev: `${clock.toString(36)}:${device}`, syncVersion }
}

export type Causality = 'before' | 'after' | 'equal' | 'concurrent' | 'legacy'

export function compareCausality(a: Base | undefined, b: Base | undefined): Causality {
  const av = a?.syncVersion
  const bv = b?.syncVersion
  if (!av || !bv) return 'legacy'
  const devices = new Set([...Object.keys(av), ...Object.keys(bv)])
  let lower = false
  let higher = false
  for (const device of devices) {
    const ac = av[device] ?? 0
    const bc = bv[device] ?? 0
    if (ac < bc) lower = true
    if (ac > bc) higher = true
  }
  if (lower && higher) return 'concurrent'
  if (lower) return 'before'
  if (higher) return 'after'
  return 'equal'
}

/** A later local edit must be newer than every revision this device has received, even when its wall clock is behind. */
export async function observeRevision(row: Base | undefined): Promise<void> {
  const seen = revisionParts(row).clock
  const stored = Number((await db.meta.get(CLOCK_KEY))?.value ?? 0)
  if (seen > stored) await db.meta.put({ key: CLOCK_KEY, value: seen })
}

export async function syncDeviceId(): Promise<string> {
  return db.transaction('rw', db.meta, () => deviceId())
}
