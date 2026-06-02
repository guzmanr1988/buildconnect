import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Google Translate + React reconciler compat shim — must run before any
// React render. GT mutates text nodes React owns; on re-render React
// can hit "removeChild: node is not a child of this node" /
// "insertBefore: reference node is not a child of this node" and crash
// to the error boundary. Guard the two ops by no-op'ing when the
// parent/ancestor relationship has already been broken by GT (instead
// of throwing). Canonical React+GT stability fix used widely.
;(function patchNodeForGoogleTranslate() {
  if (typeof Node === 'undefined') return
  const proto = Node.prototype as Node
  const origRemoveChild = proto.removeChild
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      return child
    }
    return origRemoveChild.call(this, child) as T
  } as typeof proto.removeChild

  const origInsertBefore = proto.insertBefore
  proto.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return newNode
    }
    return origInsertBefore.call(this, newNode, referenceNode) as T
  } as typeof proto.insertBefore
})()

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
