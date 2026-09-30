import '@fontsource-variable/literata'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/onest'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyTheme, getTheme } from './lib/session'
import { applyTypo, loadTypo } from './lib/typography'

applyTheme(getTheme())
applyTypo(loadTypo())
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
