import '@fontsource-variable/literata'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource-variable/inter'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyTextFont, applyTextSize, applyTheme, getTextFont, getTextSize, getTheme } from './lib/session'

applyTheme(getTheme())
applyTextSize(getTextSize())
applyTextFont(getTextFont())
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
