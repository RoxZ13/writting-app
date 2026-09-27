import { useEffect, useState } from 'react'

export type Route =
  | { view: 'home' }
  | { view: 'plan' }
  | { view: 'markers' }
  | { view: 'inbox' }
  | { view: 'settings' }
  | { view: 'write'; sceneId: string }

export function parseHash(hash: string): Route {
  const [, view, id] = hash.replace(/^#/, '').split('/')
  if (view === 'write' && id) return { view: 'write', sceneId: id }
  if (view === 'plan' || view === 'markers' || view === 'inbox' || view === 'settings') return { view }
  return { view: 'home' }
}

export function go(route: Route) {
  const hash = route.view === 'write' ? `#/write/${route.sceneId}` : route.view === 'home' ? '#/' : `#/${route.view}`
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
