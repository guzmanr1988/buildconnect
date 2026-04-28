import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Ship #326 (Phase A) — flag-resolution thread store. Per-lead message
// array between BuildConnect (admin) + vendor on a flagged sentProject's
// review-status. Lets the vendor reply to admin's flag note + upload a
// revised contract that cycles the deal back to admin Pending.
//
// Per banked feedback_immutable_ledger_freeze_at_write: thread messages
// snapshot authorName at write time so admin / vendor name changes don't
// retroactively rewrite thread history. Same shape as banked
// snapshot-derivable-fields-at-write discipline (transaction-log /
// audit / history records).
//
// Per banked widen-reads-narrow-writes: getThread reads default-safe
// (empty array if no thread yet); admin retains write-authority on
// reviewStatus separately via projects-store.setReviewStatus +
// resetReviewStatus.
//
// Per banked feedback_format_sot_shared_helper: FlagThreadMessageType
// union + helpers live in this module so consumers (vendor flag
// resolution UI + admin thread modal in Phase B) read the same SoT.
//
// Lazy-seed migration for legacy flagged deals (per Decision A.i):
// ensureLegacyFlagNoteSeed idempotently promotes the existing
// SentProject.reviewNote into a flag_note message on first thread read.
// Idempotent guard: only seeds when thread empty AND no prior flag_note.
//
// Mock-data-as-test-harness boundary: client-zustand-persist alongside
// other admin-internal moderation state (vendor-homeowner-documents-store,
// admin-moderation-store, feature-flags-store). Real-Supabase migration
// deferred — flagged-deal cycle is admin-internal-tool, no cross-device
// consistency requirement until Tranche-2.

export type FlagThreadMessageType =
  | 'flag_note'
  | 'vendor_reply'
  | 'admin_reply'
  | 'revision_uploaded'

export type FlagThreadAuthorRole = 'admin' | 'vendor'

export interface FlagThreadMessage {
  id: string
  projectId: string
  authorRole: FlagThreadAuthorRole
  authorId: string
  authorName: string
  content: string
  messageType: FlagThreadMessageType
  attachmentDocId?: string
  timestamp: string
}

interface FlagThreadState {
  threadsByProject: Record<string, FlagThreadMessage[]>
  appendMessage: (msg: Omit<FlagThreadMessage, 'id' | 'timestamp'>) => void
  getThread: (projectId: string) => FlagThreadMessage[]
  ensureLegacyFlagNoteSeed: (
    projectId: string,
    note: string,
    authorId: string,
    authorName: string,
  ) => void
  clearThread: (projectId: string) => void
}

export const useFlagThreadStore = create<FlagThreadState>()(
  persist(
    (set, get) => ({
      threadsByProject: {},

      appendMessage: (msg) =>
        set((state) => {
          const next: FlagThreadMessage = {
            ...msg,
            id: `flag-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toISOString(),
          }
          const prior = state.threadsByProject[msg.projectId] ?? []
          return {
            threadsByProject: {
              ...state.threadsByProject,
              [msg.projectId]: [...prior, next],
            },
          }
        }),

      getThread: (projectId) => get().threadsByProject[projectId] ?? [],

      ensureLegacyFlagNoteSeed: (projectId, note, authorId, authorName) => {
        const thread = get().threadsByProject[projectId] ?? []
        const trimmed = note.trim()
        if (trimmed.length === 0) return
        if (thread.some((m) => m.messageType === 'flag_note')) return
        set((state) => {
          const prior = state.threadsByProject[projectId] ?? []
          const seeded: FlagThreadMessage = {
            id: `flag-msg-seed-${projectId}`,
            projectId,
            authorRole: 'admin',
            authorId,
            authorName,
            content: trimmed,
            messageType: 'flag_note',
            timestamp: new Date().toISOString(),
          }
          return {
            threadsByProject: {
              ...state.threadsByProject,
              [projectId]: [seeded, ...prior],
            },
          }
        })
      },

      clearThread: (projectId) =>
        set((state) => {
          const next = { ...state.threadsByProject }
          delete next[projectId]
          return { threadsByProject: next }
        }),
    }),
    { name: 'buildconnect-flag-thread' },
  ),
)

export const FLAG_MESSAGE_TYPE_LABEL: Record<FlagThreadMessageType, string> = {
  flag_note: 'Flag note',
  vendor_reply: 'Vendor reply',
  admin_reply: 'BuildConnect reply',
  revision_uploaded: 'Revised contract uploaded',
}
