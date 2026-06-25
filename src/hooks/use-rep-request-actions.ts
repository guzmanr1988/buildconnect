// Concierge Rep Request — per-row mutation hook.
// Companion to useRepRequestDetail (which derives the permission set
// from viewerRole × status × assignedRepId). This hook owns the
// imperative side: the actual edge-fn POSTs that flip status, write
// assessment notes, and create the project-on-behalf row.
//
// Component pattern:
//   const { actions, refetch } = useRepRequestDetail(id)
//   const m = useRepRequestActions(id)
//   <Button
//     disabled={!actions?.canMarkVisited || m.mutating}
//     onClick={async () => { const r = await m.markVisited({...}); if (r.ok) refetch() }}
//   />
//
// COMMIT 5-PREP SCAFFOLD: signatures locked, edge-fn POSTs deferred to
// commit 5 (post helios 2.5 substrate up + dev-deploy Rod-go). Every
// mutation returns ActionResult{ok:true} as a no-op so consumers can
// wire onClick + the optimistic refetch path without blocking on the
// edge-fn integration. The body comment on each fn names the edge fn
// it will eventually POST to so commit 5 is a one-line-per-fn swap.

import { useCallback, useState } from 'react'
import type { RepRequestStatus } from '@/features/admin/rep-requests/rep-request-contract'

export type ActionResult = { ok: true } | { ok: false; error: string }

export interface BuildProjectOnBehalfPayload {
  serviceId: string
  scope: string
  estimatedAmountCents: number | null
  notes: string | null
}

export interface UseRepRequestActionsResult {
  /** Admin only — assigns or reassigns the rep. Empty repId unassigns. */
  assignRep: (repId: string | null) => Promise<ActionResult>
  /** Admin only — forces the next legal status transition. */
  advanceStatus: (next: RepRequestStatus) => Promise<ActionResult>
  /** Homeowner OR admin — cancels + fires Stripe partial refund ($200). */
  cancel: (reason?: string) => Promise<ActionResult>
  /** Rep (or admin) — flips status=scheduled→visited + persists assessment notes. */
  markVisited: (payload: { assessmentNotes: string }) => Promise<ActionResult>
  /** Rep (or admin) — flips status=visited→project_ready after build-on-behalf. */
  markProjectReady: (projectId: string) => Promise<ActionResult>
  /** Rep (or admin) — server-side project INSERT keyed to the rep request. */
  buildProjectOnBehalf: (payload: BuildProjectOnBehalfPayload) => Promise<ActionResult>
  /** True while any mutation is in flight — disables action buttons. */
  mutating: boolean
}

export function useRepRequestActions(_repRequestId: string | null | undefined): UseRepRequestActionsResult {
  const [mutating, setMutating] = useState(false)

  const wrap = useCallback(
    async (_op: string, fn: () => Promise<ActionResult>): Promise<ActionResult> => {
      setMutating(true)
      try {
        return await fn()
      } finally {
        setMutating(false)
      }
    },
    [],
  )

  // TODO(commit 5): POST /functions/v1/assign-rep
  // Body: { rep_request_id, rep_id | null }
  // RLS: admin update policy on concierge_rep_requests.
  const assignRep = useCallback(
    (_repId: string | null) => wrap('assign-rep', async () => ({ ok: true })),
    [wrap],
  )

  // TODO(commit 5): POST /functions/v1/advance-rep-request-status
  // Body: { rep_request_id, next_status }
  // RLS: admin update policy; legal-transition guard server-side.
  const advanceStatus = useCallback(
    (_next: RepRequestStatus) => wrap('advance-status', async () => ({ ok: true })),
    [wrap],
  )

  // TODO(commit 5): POST /functions/v1/cancel-rep-request
  // Body: { rep_request_id, reason? }
  // Server: flips status=cancelled, fires Stripe Refund.create for
  // $200 (refundable portion), sets cancelled_at + cancelled_by from
  // the JWT role. RLS: homeowner self-row OR admin any-row.
  const cancel = useCallback(
    (_reason?: string) => wrap('cancel', async () => ({ ok: true })),
    [wrap],
  )

  // TODO(commit 5): POST /functions/v1/mark-rep-request-visited
  // Body: { rep_request_id, assessment_notes }
  // RLS rep_update_assigned WITH CHECK status whitelist (mig 101
  // 5e231ed) admits this transition: scheduled→visited (or new→visited
  // if rep visits same-day).
  const markVisited = useCallback(
    (_payload: { assessmentNotes: string }) =>
      wrap('mark-visited', async () => ({ ok: true })),
    [wrap],
  )

  // TODO(commit 5): POST /functions/v1/mark-rep-request-project-ready
  // Body: { rep_request_id, project_id }
  // Server: validates project_id is rep-request-keyed + flips status.
  const markProjectReady = useCallback(
    (_projectId: string) => wrap('mark-project-ready', async () => ({ ok: true })),
    [wrap],
  )

  // TODO(commit 5): POST /functions/v1/build-project-on-behalf
  // Body: { rep_request_id, service_id, scope, estimated_amount_cents, notes }
  // Server: INSERTs projects row keyed to rep_request.homeowner_id +
  // returns project_id for the markProjectReady call. RLS rep policy
  // admits INSERT only for projects.created_by_rep_id = auth.uid().
  const buildProjectOnBehalf = useCallback(
    (_payload: BuildProjectOnBehalfPayload) =>
      wrap('build-project-on-behalf', async () => ({ ok: true })),
    [wrap],
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
