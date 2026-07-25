// Concierge Rep Request — admin queue list fetch.
// Companion to useRepRequestDetail. Powers /admin/rep-requests (all
// requests) and serves as the data source for the queue list pane.
// Mirrors the detail-hook pattern: react-query keyed on
// ['rep-requests-list', statusFilter] with staleTime=10s + a Realtime
// channel on rep_requests INSERT/UPDATE/DELETE that invalidates the
// cache so admin actions, webhook flips, and new homeowner intakes
// propagate without a manual refetch.
//
// Mechanism: RLS-gated SELECT on rep_requests with two profiles joins
// (homeowner_id for display name, assigned_rep_id for the assignee
// label). Status filter applied server-side via .eq() when non-null
// so PostgREST never hands us rows the user filtered out.

import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  RepRequestChargeStatus,
  RepRequestStatus,
} from '@/features/admin/rep-requests/rep-request-contract'

export interface RepRequestListRow {
  id: string
  status: RepRequestStatus
  chargeStatus: RepRequestChargeStatus
  homeownerId: string
  homeownerName: string
  assignedRepId: string | null
  assignedRepName: string | null
  address: string
  description: string
  createdAt: string
  age: string
}

export interface UseRepRequestsListResult {
  rows: RepRequestListRow[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

interface RepRequestListRowRaw {
  id: string
  status: RepRequestStatus
  charge_status: RepRequestChargeStatus
  homeowner_id: string
  assigned_rep_id: string | null
  address: { line1: string; line2?: string | null; city: string; state: string; zip: string | null }
  description: string | null
  created_at: string
  homeowner: { name: string | null } | null
  assigned_rep: { name: string | null } | null
}

function formatAddress(a: RepRequestListRowRaw['address']): string {
  const line2 = a.line2 ? `, ${a.line2}` : ''
  const zipSuffix = a.zip ? ` ${a.zip}` : ''
  return `${a.line1}${line2}, ${a.city}, ${a.state}${zipSuffix}`
}

// Compact age label aligned with the QueueRow synth fixtures
// ("12m", "2h", "1d"). Sub-minute reads as "now"; weeks+ collapse to
// days for the queue density target.
function formatAge(createdAtIso: string, nowMs: number = Date.now()): string {
  const created = new Date(createdAtIso).getTime()
  if (!Number.isFinite(created)) return ''
  const deltaSec = Math.max(0, Math.floor((nowMs - created) / 1000))
  if (deltaSec < 60) return 'now'
  const min = Math.floor(deltaSec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  return `${d}d`
}

function mapRow(row: RepRequestListRowRaw): RepRequestListRow {
  return {
    id: row.id,
    status: row.status,
    chargeStatus: row.charge_status,
    homeownerId: row.homeowner_id,
    homeownerName: row.homeowner?.name ?? '(no name)',
    assignedRepId: row.assigned_rep_id,
    assignedRepName: row.assigned_rep?.name ?? null,
    address: formatAddress(row.address),
    description: row.description ?? '',
    createdAt: row.created_at,
    age: formatAge(row.created_at),
  }
}

const LIST_SELECT =
  'id, status, charge_status, homeowner_id, assigned_rep_id, address, description, created_at, ' +
  'homeowner:profiles!homeowner_id(name), assigned_rep:profiles!assigned_rep_id(name)'

export function useRepRequestsList(
  statusFilter: RepRequestStatus | null,
): UseRepRequestsListResult {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => ['rep-requests-list', statusFilter ?? null] as const,
    [statusFilter],
  )

  const query = useQuery<RepRequestListRow[], Error>({
    queryKey,
    staleTime: 10_000,
    queryFn: async () => {
      let builder = supabase
        .from('rep_requests')
        .select(LIST_SELECT)
        .order('created_at', { ascending: false })
      if (statusFilter) {
        builder = builder.eq('status', statusFilter)
      }
      const { data, error } = await builder
      if (error) throw error
      return (data ?? []).map((r) => mapRow(r as unknown as RepRequestListRowRaw))
    },
  })

  // Broad Realtime subscription: any INSERT (new homeowner intake),
  // UPDATE (status flip / assignment / cancel), or DELETE invalidates
  // every cached list filter so all status-pill panes stay in sync.
  // The detail-hook channel handles per-row UPDATE for the open detail
  // pane; this one drives the queue.
  useEffect(() => {
    const channel = supabase
      .channel('rep-requests-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rep_requests' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['rep-requests-list'] })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const refetch = useCallback(async () => {
    await query.refetch()
  }, [query])

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch,
  }
}
