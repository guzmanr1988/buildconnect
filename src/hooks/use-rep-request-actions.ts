// Concierge Rep Request — per-row mutation hook.
// Companion to useRepRequestDetail (which derives the permission set
// from viewerRole × status × assignedRepId). This hook owns the
// imperative side: the actual mutations that flip status, assign reps,
// persist assessment notes, and create the project-on-behalf row.
//
// Component pattern:
//   const { actions, refetch } = useRepRequestDetail(id)
//   const m = useRepRequestActions(id)
//   <Button
//     disabled={!actions?.canMarkVisited || m.mutating}
//     onClick={async () => { const r = await m.markVisited({...}); if (r.ok) refetch() }}
//   />
//
// Mechanism split (per hephaestus commit-5 bundle msg 1782369349384):
//   • 4 RLS-direct supabase.from('rep_requests').update({...}) — assignRep,
//     advanceStatus, markVisited, markProjectReady. RLS policies on
//     rep_requests gate admin vs rep WITH CHECK (mig 101 5e231ed).
//   • 1 supabase.functions.invoke('build-project-on-behalf') —
//     projects-table INSERT keyed to rep_request.homeowner_id needs
//     server-side auth-uid extraction + cross-table validation that
//     RLS-direct can't express cleanly.
//   • cancel: still no-op — Stripe Refund.create($200 partial) needs
//     server-side stripe-secret access. Deferred to a separate edge fn
//     (cancel-rep-request) outside this commit's scope.

import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RepRequestStatus } from '@/features/admin/rep-requests/rep-request-contract'

export type ActionResult = { ok: true } | { ok: false; error: string }
// buildProjectOnBehalf returns the new project_id so the caller can
// chain markProjectReady(project_id) to flip status visited →
// project_ready in the same admin/rep gesture. The edge fn body
// already returns { ok: true, project_id }; this surface bubbles it.
export type BuildProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string }

export interface BuildProjectOnBehalfPayload {
  serviceId: string
  scope: string
  estimatedAmountCents: number | null
  notes: string | null
}

export interface UseRepRequestActionsResult {
  /** Admin only — assigns or reassigns the rep. Null repId unassigns. */
  assignRep: (repId: string | null) => Promise<ActionResult>
  /** Admin only — forces the next legal status transition. */
  advanceStatus: (next: RepRequestStatus) => Promise<ActionResult>
  /** Homeowner OR admin — cancels + fires Stripe partial refund ($200). */
  cancel: (reason?: string) => Promise<ActionResult>
  /** Rep (or admin) — flips status=scheduled→visited + persists assessment notes. */
  markVisited: (payload: { assessmentNotes: string }) => Promise<ActionResult>
  /** Rep (or admin) — flips status=visited→project_ready after build-on-behalf. */
  markProjectReady: (projectId: string) => Promise<ActionResult>
  /** Rep (or admin) — server-side project INSERT keyed to the rep request.
   *  Returns the new project_id so the caller can chain markProjectReady. */
  buildProjectOnBehalf: (payload: BuildProjectOnBehalfPayload) => Promise<BuildProjectResult>
  /** True while any mutation is in flight — disables action buttons. */
  mutating: boolean
}

interface BuildProjectOnBehalfResponse {
  project_id: string
}

export function useRepRequestActions(
  repRequestId: string | null | undefined,
): UseRepRequestActionsResult {
  const [mutating, setMutating] = useState(false)

  const wrap = useCallback(
    async <T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T> => {
      if (!repRequestId) {
        return { ok: false, error: 'No rep request selected.' } as unknown as T
      }
      setMutating(true)
      try {
        return await fn()
      } finally {
        setMutating(false)
      }
    },
    [repRequestId],
  )

  const assignRep = useCallback(
    (repId: string | null) =>
      wrap(async () => {
        const { error } = await supabase
          .from('rep_requests')
          .update({ assigned_rep_id: repId })
          .eq('id', repRequestId!)
        return error ? { ok: false, error: error.message } : { ok: true }
      }),
    [wrap, repRequestId],
  )

  const advanceStatus = useCallback(
    (next: RepRequestStatus) =>
      wrap(async () => {
        const { error } = await supabase
          .from('rep_requests')
          .update({ status: next })
          .eq('id', repRequestId!)
        return error ? { ok: false, error: error.message } : { ok: true }
      }),
    [wrap, repRequestId],
  )

  // cancel: server-side Stripe Refund.create($200 refundable / $50
  // retained per Rod §11 book-balance) is owned by the cancel-rep-request
  // edge fn; the UI just triggers it. Both homeowner self-row and admin
  // any-row callers route through the same fn — server reads auth.uid()
  // and validates against rep_requests.homeowner_id.
  const cancel = useCallback(
    (reason?: string) =>
      wrap(async () => {
        const { error } = await supabase.functions.invoke('cancel-rep-request', {
          body: { rep_request_id: repRequestId, reason },
        })
        return error ? { ok: false, error: error.message } : { ok: true }
      }),
    [wrap, repRequestId],
  )

  const markVisited = useCallback(
    (payload: { assessmentNotes: string }) =>
      wrap(async () => {
        const { error } = await supabase
          .from('rep_requests')
          .update({ status: 'visited', assessment_notes: payload.assessmentNotes })
          .eq('id', repRequestId!)
        return error ? { ok: false, error: error.message } : { ok: true }
      }),
    [wrap, repRequestId],
  )

  const markProjectReady = useCallback(
    (projectId: string) =>
      wrap(async () => {
        const { error } = await supabase
          .from('rep_requests')
          .update({ status: 'project_ready', project_id: projectId })
          .eq('id', repRequestId!)
        return error ? { ok: false, error: error.message } : { ok: true }
      }),
    [wrap, repRequestId],
  )

  const buildProjectOnBehalf = useCallback(
    (payload: BuildProjectOnBehalfPayload) =>
      wrap<BuildProjectResult>(async () => {
        const { data, error } = await supabase.functions.invoke<BuildProjectOnBehalfResponse>(
          'build-project-on-behalf',
          {
            body: {
              rep_request_id: repRequestId,
              service_id: payload.serviceId,
              scope: payload.scope,
              estimated_amount_cents: payload.estimatedAmountCents,
              notes: payload.notes,
            },
          },
        )
        if (error) return { ok: false, error: error.message }
        if (!data?.project_id) {
          return { ok: false, error: 'build-project-on-behalf returned no project_id' }
        }
        return { ok: true, projectId: data.project_id }
      }),
    [wrap, repRequestId],
  )

  return {
    assignRep,
    advanceStatus,
    cancel,
    markVisited,
    markProjectReady,
    buildProjectOnBehalf,
    mutating,
  }
}
