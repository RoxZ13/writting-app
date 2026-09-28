import { useEffect, useState } from 'react'

/** A short timed stretch of writing: the easiest way to start is to agree on fifteen minutes. */
export interface Sprint {
  projectId: string
  minutes: number
  endsAt: number
  /** Words in the whole book when the sprint began. */
  startWords: number
}

const KEY = 'manuscript.sprint'
const listeners = new Set<() => void>()

export function getSprint(): Sprint | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}
function setSprint(s: Sprint | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn())
}

export function startSprint(projectId: string, minutes: number, startWords: number) {
  setSprint({ projectId, minutes, startWords, endsAt: Date.now() + minutes * 60000 })
}
export const stopSprint = () => setSprint(null)

/** The running sprint and the seconds left; re-renders every second while one runs. */
export function useSprint(): { sprint: Sprint | null; left: number } {
  const [sprint, set] = useState(getSprint)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const on = () => set(getSprint())
    listeners.add(on)
    return () => {
      listeners.delete(on)
    }
  }, [])
  useEffect(() => {
    if (!sprint) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [sprint])
  return { sprint, left: sprint ? Math.max(0, Math.round((sprint.endsAt - now) / 1000)) : 0 }
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
