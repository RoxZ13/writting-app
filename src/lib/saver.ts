export type SaverState = 'saved' | 'pending' | 'saving' | 'error'

export interface SaverOptions<S> {
  /** Persist one snapshot. May throw / reject: the saver then keeps the text dirty and retries. */
  write: (snapshot: S) => Promise<void>
  /** Quiet time after the last change before writing. */
  delay?: number
  /** Wait before trying again after a failed write. */
  retryDelay?: number
  onState?: (state: SaverState) => void
}

/**
 * Debounced, retrying autosave, free of any framework.
 * The text counts as saved only when a write succeeded AND nothing newer was typed meanwhile.
 * A failed write never drops the text: it stays dirty and is retried.
 */
export function createSaver<S>({ write, delay = 800, retryDelay = 3000, onState }: SaverOptions<S>) {
  let getSnapshot: (() => S) | null = null
  let version = 0
  let savedVersion = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let timerIsRetry = false
  let inflight: Promise<boolean> | null = null
  let state: SaverState = 'saved'

  const set = (next: SaverState) => {
    if (next === state) return
    state = next
    onState?.(next)
  }
  const clear = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const schedule = (ms: number, retry: boolean) => {
    clear()
    timerIsRetry = retry
    timer = setTimeout(() => void flush(), ms)
  }
  const isDirty = () => version !== savedVersion

  async function run(): Promise<boolean> {
    const v = version
    set('saving')
    let ok = true
    try {
      await write(getSnapshot!())
    } catch {
      ok = false
    }
    if (ok) {
      savedVersion = v
      if (isDirty()) {
        // Typed while writing: another round.
        set('pending')
        schedule(delay, false)
      } else set('saved')
    } else {
      set('error')
      schedule(retryDelay, true)
    }
    return ok
  }

  /** Write the latest snapshot now. Never throws; resolves false if the text is still unsaved. */
  function flush(): Promise<boolean> {
    clear()
    if (inflight) return inflight.then(() => (isDirty() ? flush() : true))
    if (!getSnapshot || !isDirty()) return Promise.resolve(true)
    const p = run().then((ok) => {
      inflight = null
      return ok
    })
    inflight = p
    return p
  }

  return {
    /** Something changed. `snapshot` is read when the write happens, so it always sees the newest text. */
    change(snapshot: () => S) {
      getSnapshot = snapshot
      version++
      // While a write is in flight its completion schedules the next round; after a failure keep the retry timer.
      if (inflight || (state === 'error' && timerIsRetry && timer !== undefined)) return
      set('pending')
      schedule(delay, false)
    },
    flush,
    isDirty,
    state: () => state,
    /** Cancel a not-yet-started write (flush first if it matters). A failed write keeps retrying. */
    dispose() {
      if (!timerIsRetry) clear()
    },
  }
}
