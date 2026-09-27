import { useEffect, useState } from 'react'

export type Route =
  | { view: 'text'; sceneId?: string }
  | { view: 'board' }
  | { view: 'characters' }
  | { view: 'inbox' }
  | { view: 'settings' }
  | { view: 'library' }

export function parseHash(hash: string): Route {
  const [, view, id] = hash.replace(/^#/, '').split('/')
  if (view === 'write' || view === 'text') return { view: 'text', sceneId: id || undefined }
  if (view === 'board' || view === 'characters' || view === 'inbox' || view === 'settings' || view === 'library') return { view }
  return { view: 'text' }
}

/** Back-compat: old code paths ask for { view: 'write', sceneId }. */
type Target = Route | { view: 'write'; sceneId: string }

export function go(route: Target) {
  const r: Route = route.view === 'write' ? { view: 'text', sceneId: route.sceneId } : route
  const hash = r.view === 'text' ? (r.sceneId ? `#/text/${r.sceneId}` : '#/text') : `#/${r.view}`
  if (location.hash !== hash) location.hash = hash
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
