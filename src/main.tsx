import '@fontsource-variable/literata'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource-variable/manrope'
import '@fontsource-variable/onest'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyAccent, applyTheme, getAccent, getTheme } from './lib/session'
import { applyTypo, loadTypo } from './lib/typography'
import { registerSW } from 'virtual:pwa-register'

applyTheme(getTheme())
applyAccent(getAccent())
applyTypo(loadTypo())
navigator.storage?.persist?.().catch(() => {})

// A new version is taken in when the author steps away (switches app or tab), never while typing.
// It is looked for on every return and once an hour, so an installed app does not stay old.
let waiting = false
const updateSW = registerSW({
  onNeedRefresh() {
    waiting = true
    if (document.visibilityState === 'hidden') void updateSW(true)
  },
  onRegisteredSW(_url, reg) {
    if (!reg) return
    setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update().catch(() => {}))
  },
})
document.addEventListener('visibilitychange', () => {
  if (waiting && document.visibilityState === 'hidden') void updateSW(true)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
