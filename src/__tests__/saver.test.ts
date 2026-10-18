import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSaver } from '../lib/saver'

type S = 'saved' | 'pending' | 'saving' | 'error'

function setup(write: (s: string) => Promise<void>) {
  const states: S[] = []
  const saver = createSaver<string>({ write, delay: 800, retryDelay: 3000, onState: (s) => states.push(s) })
  return { saver, states }
}

describe('createSaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('writes the latest snapshot after the delay and goes pending -> saving -> saved', async () => {
    const write = vi.fn(async () => {})
    const { saver, states } = setup(write)
    saver.change(() => 'a')
    saver.change(() => 'ab')
    expect(saver.isDirty()).toBe(true)
    expect(write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(799)
    expect(write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('ab')
    expect(saver.isDirty()).toBe(false)
    expect(states).toEqual(['pending', 'saving', 'saved'])
  })

  it('keeps the text dirty after a failed write and retries after retryDelay', async () => {
    let fail = true
    const write = vi.fn(async () => {
      if (fail) throw new Error('quota')
    })
    const { saver, states } = setup(write)
    saver.change(() => 'text')
    await vi.advanceTimersByTimeAsync(800)
    expect(write).toHaveBeenCalledTimes(1)
    expect(saver.isDirty()).toBe(true)
    expect(states.at(-1)).toBe('error')
    fail = false
    await vi.advanceTimersByTimeAsync(2999)
    expect(write).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(write).toHaveBeenCalledTimes(2)
    expect(saver.isDirty()).toBe(false)
    expect(states.at(-1)).toBe('saved')
  })

  it('does not lose a change made while a write is in flight', async () => {
    const written: string[] = []
    let release!: () => void
    let first = true
    const write = vi.fn(async (s: string) => {
      if (first) {
        first = false
        await new Promise<void>((r) => (release = r))
      }
      written.push(s)
    })
    const { saver } = setup(write)
    saver.change(() => 'one')
    await vi.advanceTimersByTimeAsync(800)
    expect(write).toHaveBeenCalledTimes(1)
    saver.change(() => 'two') // typed while 'one' is still being written
    release()
    await vi.advanceTimersByTimeAsync(0)
    // The first write finishing must not mark the newer text as saved.
    expect(saver.isDirty()).toBe(true)
    await vi.advanceTimersByTimeAsync(800)
    expect(written).toEqual(['one', 'two'])
    expect(saver.isDirty()).toBe(false)
  })

  it('flush writes at once, and after a failure retries immediately without throwing', async () => {
    let fail = true
    const write = vi.fn(async () => {
      if (fail) throw new Error('db closed')
    })
    const { saver } = setup(write)
    saver.change(() => 'x')
    await expect(saver.flush()).resolves.toBe(false)
    expect(write).toHaveBeenCalledTimes(1)
    expect(saver.isDirty()).toBe(true)
    fail = false
    await expect(saver.flush()).resolves.toBe(true)
    expect(write).toHaveBeenCalledTimes(2)
    expect(saver.isDirty()).toBe(false)
    // nothing left to write
    await expect(saver.flush()).resolves.toBe(true)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('flush with nothing changed is a no-op that reports success', async () => {
    const write = vi.fn(async () => {})
    const { saver } = setup(write)
    await expect(saver.flush()).resolves.toBe(true)
    expect(write).not.toHaveBeenCalled()
  })

  it('dispose cancels a pending debounced write but keeps retrying a failed one', async () => {
    let fail = true
    const write = vi.fn(async () => {
      if (fail) throw new Error('x')
    })
    const { saver } = setup(write)
    saver.change(() => 'a')
    saver.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(write).not.toHaveBeenCalled()

    saver.change(() => 'b')
    await saver.flush() // fails, retry scheduled
    saver.dispose()
    fail = false
    await vi.advanceTimersByTimeAsync(3000)
    expect(write).toHaveBeenCalledTimes(2)
    expect(saver.isDirty()).toBe(false)
  })
})
