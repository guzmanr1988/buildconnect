// NotesBlock — admin notes thread on the rep-request detail-pane.
//
// Slots underneath the AppointmentBlock per Rod placement (screenshot
// file_760 / 2026-06-30): below the green "Visit scheduled" card on the
// /admin/rep-requests/:id detail-pane.
//
// V1 presentation + read only. The write surface (addNote prop) is
// optional in this commit; the parent rep-requests.tsx leaves it
// undefined until kratos releases the add-rep-request-note edge fn
// contract once Rod resolves the add-only-vs-editable fork. When
// addNote is undefined this card renders a read-only thread; when
// addNote is provided the textarea + Add button light up without any
// other change. Receipt-style entries (immutable timestamp + actor +
// role + note) set the audit-record mental model regardless of which
// substrate (rep_request_events vs follow-on rep_request_notes) ends
// up owning future writes.
//
// Viewer-role gate: admin/admin_employee see Add UI (when addNote is
// provided); rep sees the thread read-only.

import { useState } from 'react'
import { StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useRepRequestNotes } from '@/hooks/use-rep-request-events'
import type { UserRole } from '@/types'
import { cn } from '@/lib/utils'

export type AddNoteResult = { ok: true } | { ok: false; error: string }

interface NotesBlockProps {
  repRequestId: string
  viewerRole: UserRole | null
  /** Write path. When omitted, only the thread renders (no Add UI). */
  addNote?: (text: string) => Promise<AddNoteResult>
}

const ROLE_BADGE_LABELS: Partial<Record<UserRole, string>> = {
  admin: 'Admin',
  admin_employee: 'Admin staff',
  rep: 'Rep',
  account_rep: 'Account rep',
}

function formatTimestamp(iso: string): { abs: string; rel: string } {
  const d = new Date(iso)
  const abs = d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const diffMs = Date.now() - d.getTime()
  const min = Math.round(diffMs / 60000)
  let rel: string
  if (min < 1) rel = 'Just now'
  else if (min < 60) rel = `${min}m ago`
  else if (min < 24 * 60) rel = `${Math.round(min / 60)}h ago`
  else if (min < 7 * 24 * 60) rel = `${Math.round(min / (60 * 24))}d ago`
  else rel = abs
  return { abs, rel }
}

export function NotesBlock({ repRequestId, viewerRole, addNote }: NotesBlockProps) {
  const { notes, isLoading, error } = useRepRequestNotes(repRequestId)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const canWrite =
    !!addNote && (viewerRole === 'admin' || viewerRole === 'admin_employee')
  const draftValid = draft.trim().length > 0

  const handleAdd = async () => {
    if (!addNote || !draftValid || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    const r = await addNote(draft.trim())
    setSubmitting(false)
    if (r.ok) {
      setDraft('')
    } else {
      setSubmitError(r.error)
    }
  }

  return (
    <div
      className="rounded-lg border bg-muted/30 p-3 space-y-3"
      data-testid="admin-rep-requests-notes-block"
    >
      <div className="flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Notes</p>
      </div>

      {error && (
        <p
          role="alert"
          className="text-xs text-destructive"
          data-testid="admin-rep-requests-notes-error"
        >
          Failed to load notes: {error.message}
        </p>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <p
          className="text-xs italic text-muted-foreground"
          data-testid="admin-rep-requests-notes-empty-state"
        >
          No notes yet.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {notes.map((n) => {
            const { abs, rel } = formatTimestamp(n.createdAt)
            const roleLabel = n.actorRole ? ROLE_BADGE_LABELS[n.actorRole] : null
            return (
              <li
                key={n.id}
                className="rounded-md border bg-background/60 p-2.5 text-sm"
                data-testid="admin-rep-requests-note-entry"
                data-note-id={n.id}
              >
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {n.actorName ?? 'Unknown'}
                  </span>
                  {roleLabel && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                        n.actorRole === 'admin' || n.actorRole === 'admin_employee'
                          ? 'bg-primary/10 text-primary ring-primary/20'
                          : 'bg-muted text-muted-foreground ring-border',
                      )}
                    >
                      {roleLabel}
                    </span>
                  )}
                  <span title={abs}>· {rel}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{n.note}</p>
              </li>
            )
          })}
        </ul>
      )}

      {canWrite && (
        <div className="space-y-2 pt-1 border-t border-border/60">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note about this customer…"
            rows={3}
            disabled={submitting}
            data-testid="admin-rep-requests-note-add-textarea"
            className="resize-none text-sm"
          />
          {submitError && (
            <p
              role="alert"
              className="text-xs text-destructive"
              data-testid="admin-rep-requests-note-add-error"
            >
              {submitError}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!draftValid || submitting}
              onClick={handleAdd}
              data-testid="admin-rep-requests-note-add-btn"
            >
              {submitting ? 'Adding…' : 'Add note'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
