import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// PR #194 boot-purge — homeowner-documents-store dropped its persist()
// wrapper, but the legacy 'buildconnect-homeowner-docs' LS key sits as
// orphan data on existing devices (2-5MB of base64 PDFs accumulated
// across pre-fix testing). Without this purge, the global LS quota stays
// full and every subsequent setItem still throws QuotaExceededError.
// Idempotent: runs once per page load; no-op when key absent.
try { localStorage.removeItem('buildconnect-homeowner-docs') } catch { /* noop */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
