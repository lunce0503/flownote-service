import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'
import { applyPreferences, readPreferences, PREF_STORAGE_KEY } from './shared/lib/userPreferences'

applyPreferences(readPreferences())
window.addEventListener('storage', (event) => {
  if (event.key === PREF_STORAGE_KEY || event.key === null) applyPreferences(readPreferences())
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
