import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// PR #195 launch-blocker nuke — PRs #191/#193/#194 fixed projects-store +
// homeowner-docs-store bloat sources but Rodolfo apex still hits the
// QuotaExceededError toast. Audit found additional persisted base64 carriers
// (cart-store items[].itemPhotos[], non-zustand pending-item / id-document
// keys) that can collectively blow the 5MB LS ceiling. Targeted partialize-
// per-store loop has shipped 3 partial fixes; ship the nuke as the
// definitive backstop.
//
// Version-gated: runs ONCE per device per NUKE_VERSION bump. After the
// first post-deploy load, the marker key matches and the nuke skips.
// Bump NUKE_VERSION on a future emergency to re-fire (idempotent within
// a version, replayable across versions).
//
// Auth key preserved so we don't log Rodolfo out. Server-authoritative
// state (sentProjects, profile, real catalog) rehydrates on next render
// via hydrateFromSupabase / AuthBootstrap. Cart drafts + in-progress
// wizard state are lost on first load — acceptable trade for unblocking
// project submission.
const NUKE_VERSION = 'v195'
try {
  if (localStorage.getItem('buildconnect-nuke-version') !== NUKE_VERSION) {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('buildconnect-') && key !== 'buildconnect-auth') {
        localStorage.removeItem(key)
      }
    })
    localStorage.setItem('buildconnect-nuke-version', NUKE_VERSION)
  }
} catch { /* noop */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
