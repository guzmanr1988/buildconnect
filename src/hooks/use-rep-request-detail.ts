// Concierge Rep Request — single-row detail fetch + actions derivation.
// Used by admin queue detail-pane, rep mine detail-pane, and homeowner
// status page. Identical shape across all three callers — the
// permissions object (RepRequestActions) is the per-role differentiator.
//
// COMMIT 2 SCAFFOLD: signature locked, implementation deferred. Returns
// an isLoading + null detail so consumers can mount + skeleton without
// blocking on the query layer integration. Real implementation will use
// tanstack/react-query with key=['rep-request',id] + staleTime=10s
// (Realtime subscription on concierge_rep_requests row invalidates
// the cache on UPDATE for live status flips).

import type {
  RepRequestActions,
  RepRequestDetail,
} from '@/features/admin/rep-requests/rep-request-contract'

export interface UseRepRequestDetailResult {
  detail: RepRequestDetail | null
  actions: RepRequestActions | null
  isLoading: boolean
  error: Error | null
  /** Refetch trigger — components call after firing a mutation (assign rep,
   *  advance status, cancel) to surface the new state without waiting for
   *  the Realtime event. */
  refetch: () => Promise<void>
}

export function useRepRequestDetail(_repRequestId: string | null | undefined): UseRepRequestDetailResult {
  // TODO(commit 2.5): react-query + supabase.from('concierge_rep_requests')
  //   .select('*, concierge_rep_request_photos(*)').eq('id', repRequestId)
  //   + Realtime channel subscription for live status flips.
  // TODO(commit 2.5): actions derivation from (viewerRole, detail.status,
  //   detail.assignedRepId) — admin permission-set is strict superset of
  //   rep so the rep boolean table is a subset.
  return {
    detail: null,
    actions: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  }
}
