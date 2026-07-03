// Concierge Rep Request — single-row detail fetch + actions derivation.
// Used by admin queue detail-pane, rep mine detail-pane, and homeowner
// status page. Identical shape across all three callers — the per-role
// permission set is derived from (viewerRole, status, assignedRepId).
//
// Data path: react-query keyed on ['rep-request', id] with staleTime=10s,
// + Realtime channel on rep_requests row UPDATE that invalidates the
// cache so admin actions / webhook flips propagate to the open status
// page without a manual refetch.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import type {
  RepRequestActions,
  RepRequestAppointmentStatus,
  RepRequestAvailabilityBucket,
  RepRequestChargeStatus,
  RepRequestDetail,
  RepRequestStatus,
} from '@/features/admin/rep-requests/rep-request-contract'

export interface UseRepRequestDetailResult {
  detail: RepRequestDetail | null
  actions: RepRequestActions | null
  isLoading: boolean
  error: Error | null
  /** Refetch trigger — components call after firing a mutation to surface
   *  the new state without waiting for the Realtime event. */
  refetch: () => Promise<void>
}

interface RepRequestRow {
  id: string
  status: RepRequestStatus
  charge_status: RepRequestChargeStatus
  homeowner_id: string
  created_by: string
  assigned_rep_id: string | null
  project_id: string | null
  address: { line1: string; line2?: string | null; city: string; state: string; zip: string }
  contact_phone: string
  requested_visit_times: Array<{
    window_start_utc: string
    window_end_utc: string
    service_tz: string
    bucket_label: RepRequestAvailabilityBucket
  }>
  // Phase 2 — mig 108 (hephaestus) adds these columns. NULL on rows
  // created before mig 108 landed.
  requested_visit_at: string | null
  appointment_status: RepRequestAppointmentStatus | null
  proposed_visit_at: string | null
  reschedule_notes: string | null
  description: string | null
  access_notes: string | null
  assessment_notes: string | null
  stripe_payment_intent_id: string | null
  stripe_refund_id: string | null
  refundable_cents: number
  refunded_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  created_at: string
  updated_at: string
  photos: Array<{ id: string; storage_path: string; created_at: string }> | null
  homeowner: { name: string | null; email: string | null } | null
}

const TERMINAL_STATUSES: ReadonlySet<RepRequestStatus> = new Set<RepRequestStatus>([
  'cancelled',
  'contractor_selected',
  'charge_failed',
])

function formatAddress(a: RepRequestRow['address']): string {
  const line2 = a.line2 ? `, ${a.line2}` : ''
  return `${a.line1}${line2}, ${a.city}, ${a.state} ${a.zip}`
}

function mapRow(row: RepRequestRow): RepRequestDetail {
  const requestedVisitTimes = (row.requested_visit_times ?? []).map((w) => w.bucket_label)
  const photos = (row.photos ?? []).map((p) => ({
    id: p.id,
    storagePath: p.storage_path,
    uploadedAt: p.created_at,
  }))
  // cancelled_by uuid → role label. system cancellations leave the column
  // NULL; otherwise compare to homeowner_id to distinguish self-cancel from
  // admin-cancel. Full actor_role lookup deferred until events feed lands.
  let cancelledBy: RepRequestDetail['cancelledBy'] = null
  if (row.cancelled_by) {
    cancelledBy = row.cancelled_by === row.homeowner_id ? 'homeowner' : 'admin'
  } else if (row.cancelled_at) {
    cancelledBy = 'system'
  }
  // refunded_amount_cents has no dedicated column — refunds are always the
  // refundable_cents fixed-$200 partial, so derive from refunded_at presence.
  const refundedAmountCents = row.refunded_at ? row.refundable_cents : null
  return {
    id: row.id,
    status: row.status,
    chargeStatus: row.charge_status,
    homeownerId: row.homeowner_id,
    assignedRepId: row.assigned_rep_id,
    projectId: row.project_id,
    address: formatAddress(row.address),
    description: row.description,
    contactName: row.homeowner?.name ?? '',
    contactPhone: row.contact_phone,
    contactEmail: row.homeowner?.email ?? '',
    requestedVisitTimes,
    requestedVisitAt: row.requested_visit_at,
    appointmentStatus: row.appointment_status,
    proposedVisitAt: row.proposed_visit_at,
    rescheduleNotes: row.reschedule_notes,
    accessNotes: row.access_notes,
    assessmentNotes: row.assessment_notes,
    photos,
    visitFeeCents: 25000,
    refundableCents: 20000,
    retainedCents: 5000,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeRefundId: row.stripe_refund_id,
    refundedAmountCents,
    cancelledAt: row.cancelled_at,
    cancelledBy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function deriveActions(
  detail: RepRequestDetail,
  viewerRole: string | null,
  viewerId: string | null,
): RepRequestActions {
  const isAdmin = viewerRole === 'admin' || viewerRole === 'admin_employee'
  const isRep = viewerRole === 'rep'
  const isHomeowner = viewerRole === 'homeowner' && viewerId === detail.homeownerId
  const isAssignedRep = isRep && viewerId !== null && detail.assignedRepId === viewerId
  const terminal = TERMINAL_STATUSES.has(detail.status)

  return {
    canAssignRep: isAdmin && !terminal,
    canAdvanceStatus: isAdmin && !terminal,
    canCancel: (isHomeowner || isAdmin) && !terminal,
    canMarkVisited:
      (isAdmin || isAssignedRep) &&
      (detail.status === 'scheduled' || detail.status === 'new'),
    canMarkProjectReady:
      (isAdmin || isAssignedRep) && detail.status === 'visited',
    canBuildProject:
      (isAdmin || isAssignedRep) &&
      (detail.status === 'visited' || detail.status === 'project_ready'),
  }
}

export function useRepRequestDetail(
  repRequestId: string | null | undefined,
): UseRepRequestDetailResult {
  const queryClient = useQueryClient()
  const viewerRole = useAuthStore((s) => s.role)
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null)

  const queryKey = useMemo(() => ['rep-request', repRequestId ?? null] as const, [repRequestId])
  // realtimeTriggeredRef: set true by the Realtime UPDATE handler right
  // before it invalidates the cache, so the queryFn that runs in response
  // knows the refetch came from the Realtime rail (not the polling
  // fallback). Lets the walker discriminate rail-of-delivery cleanly —
  // hephaestus instrumentation handoff msg 1782371694126.
  const realtimeTriggeredRef = useRef(false)

  const query = useQuery<RepRequestDetail | null, Error>({
    queryKey,
    enabled: !!repRequestId,
    staleTime: 10_000,
    // Bounded polling fallback while the row is still pre-webhook. The
    // Realtime UPDATE subscription below handles the steady-state flip,
    // but a ws-handshake race can swallow the post-charge transition
    // (status pending_payment → new fires ~6s after Pay, but if subscribe
    // hadn't ack'd by then the event is lost). Polling every 2s only
    // while status === 'pending_payment' bounds the worst-case stuck
    // window without burning bandwidth on steady-state rows.
    refetchInterval: (q) =>
      q.state.data?.status === 'pending_payment' ? 2000 : false,
    queryFn: async () => {
      if (!repRequestId) return null
      const { data, error } = await supabase
        .from('rep_requests')
        .select(
          '*, photos:rep_request_photos(id, storage_path, created_at), homeowner:profiles!homeowner_id(name, email)'
        )
        .eq('id', repRequestId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const mapped = mapRow(data as unknown as RepRequestRow)
      // Channel-of-delivery tag (hephaestus instrumentation handoff
      // msg 1782371694126). If the refetch was triggered by the Realtime
      // UPDATE handler (ref set just below), the rail is realtime;
      // otherwise it's the polling fallback. Walkers parse these markers
      // to prove which rail carried the flip post mig 106.
      if (mapped.status !== 'pending_payment') {
        const channel = realtimeTriggeredRef.current ? 'realtime' : 'poll'
        // eslint-disable-next-line no-console
        console.log(
          `[flip] channel=${channel} t=${Date.now()} rep_request_id=${mapped.id} new_status=${mapped.status}`,
        )
      }
      realtimeTriggeredRef.current = false
      return mapped
    },
  })

  useEffect(() => {
    if (!repRequestId) return
    const channel = supabase
      .channel(`rep-request-${repRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rep_requests',
          filter: `id=eq.${repRequestId}`,
        },
        () => {
          realtimeTriggeredRef.current = true
          queryClient.invalidateQueries({ queryKey })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [repRequestId, queryClient, queryKey])

  const refetch = useCallback(async () => {
    await query.refetch()
  }, [query])

  const detail = query.data ?? null
  const actions = detail ? deriveActions(detail, viewerRole, viewerId) : null

  return {
    detail,
    actions,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch,
  }
}
