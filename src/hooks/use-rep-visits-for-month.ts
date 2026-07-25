// useRepVisitsForMonth — fetch accepted-appointment rep_requests rows
// in a date window covering a 6-row month grid and bucket them by
// America/New_York local-day for the calendar grid.
//
// FLAG-A (kratos 2026-06-30): all date math is anchored to a single
// business timezone (America/New_York — BuildConnect is South Florida)
// so a near-midnight UTC visit lands on the actual local day, never a
// UTC-shifted neighbor.
//
// FLAG-B (kratos 2026-06-30): one derived effectiveVisitAt drives BOTH
// the window filter AND the day-bucket placement. A row whose
// effectiveVisitAt falls outside the visible grid never enters the
// bucket map; a row inside the grid is placed exactly where its
// effective-time says, never on the day computed off the other field.
//
// Data substrate: mig 108 adds the four columns this hook reads
// (requested_visit_at / proposed_visit_at / appointment_status /
// reschedule_notes). Pre-mig-108 rows have these NULL; the
// appointmentStatus !== 'accepted' filter naturally drops them so the
// calendar renders empty rather than mis-plotted.

import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  RepRequestAppointmentStatus,
  RepRequestChargeStatus,
  RepRequestStatus,
} from '@/features/admin/rep-requests/rep-request-contract'

export const BUSINESS_TZ = 'America/New_York'

export interface RepVisitEvent {
  id: string
  status: RepRequestStatus
  chargeStatus: RepRequestChargeStatus
  effectiveVisitAt: string
  effectiveSource: 'requested' | 'proposed'
  homeownerName: string
  assignedRepId: string | null
  assignedRepName: string | null
  address: string
  dayKey: string
}

export interface UseRepVisitsForMonthParams {
  year: number
  month: number
  assignedRepId?: string | null
}

export interface UseRepVisitsForMonthResult {
  eventsByDay: Record<string, RepVisitEvent[]>
  events: RepVisitEvent[]
  isLoading: boolean
  error: Error | null
}

interface RepVisitRow {
  id: string
  status: RepRequestStatus
  charge_status: RepRequestChargeStatus
  homeowner_id: string
  assigned_rep_id: string | null
  address: { line1: string; line2?: string | null; city: string; state: string; zip: string | null }
  requested_visit_at: string | null
  appointment_status: RepRequestAppointmentStatus | null
  proposed_visit_at: string | null
  homeowner: { name: string | null } | null
  assigned_rep: { name: string | null } | null
}

const VISIT_SELECT =
  'id, status, charge_status, homeowner_id, assigned_rep_id, address, ' +
  'requested_visit_at, appointment_status, proposed_visit_at, ' +
  'homeowner:profiles!homeowner_id(name), assigned_rep:profiles!assigned_rep_id(name)'

function formatAddress(a: RepVisitRow['address']): string {
  const line2 = a.line2 ? `, ${a.line2}` : ''
  const zipSuffix = a.zip ? ` ${a.zip}` : ''
  return `${a.line1}${line2}, ${a.city}, ${a.state}${zipSuffix}`
}

// FLAG-B: single derived effective-visit-time. When admin counter-proposed
// and the homeowner accepted (proposed_visit_at non-null + status=accepted),
// the proposed time IS the booked time. Otherwise the homeowner's original
// pick was accepted.
function deriveEffective(row: RepVisitRow): { iso: string; source: 'requested' | 'proposed' } | null {
  if (row.appointment_status !== 'accepted') return null
  if (row.proposed_visit_at) return { iso: row.proposed_visit_at, source: 'proposed' }
  if (row.requested_visit_at) return { iso: row.requested_visit_at, source: 'requested' }
  return null
}

// FLAG-A: convert a UTC ISO to a 'YYYY-MM-DD' local-day in BUSINESS_TZ.
// 'en-CA' locale formats as YYYY-MM-DD natively. This is the SAME bucket
// key the MonthCalendarGrid uses, so a row bucketed here renders in the
// matching grid cell with no further tz math.
function isoToBusinessDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ })
}

// 6-row grid spans up to 42 days. We need to filter the server-side query
// to a UTC window wide enough that any row whose effective-time falls in
// the visible business-tz grid is fetched. Worst case ET = UTC-5 (EST) or
// UTC-4 (EDT); pad the UTC window by one day on each side and let the
// client-side bucketing be the authoritative filter.
function utcBoundsForMonthGrid(year: number, month0: number): { startUtc: string; endUtc: string } {
  const gridStartLocal = new Date(year, month0, 1)
  const startWeekday = gridStartLocal.getDay()
  const firstCellLocal = new Date(year, month0, 1 - startWeekday)
  const lastCellLocal = new Date(firstCellLocal)
  lastCellLocal.setDate(firstCellLocal.getDate() + 42)
  const start = new Date(firstCellLocal.getTime() - 24 * 3600 * 1000)
  const end = new Date(lastCellLocal.getTime() + 24 * 3600 * 1000)
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}

export function useRepVisitsForMonth(p: UseRepVisitsForMonthParams): UseRepVisitsForMonthResult {
  const { year, month, assignedRepId } = p
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => ['rep-visits-month', year, month, assignedRepId ?? null] as const,
    [year, month, assignedRepId],
  )

  const { startUtc, endUtc } = useMemo(() => utcBoundsForMonthGrid(year, month), [year, month])

  const query = useQuery<RepVisitEvent[], Error>({
    queryKey,
    staleTime: 30_000,
    queryFn: async () => {
      let builder = supabase
        .from('rep_requests')
        .select(VISIT_SELECT)
        .eq('appointment_status', 'accepted')
        // Either column may carry the effective time — fetch any row where
        // EITHER falls in the wide UTC window; deriveEffective then picks.
        .or(
          `and(requested_visit_at.gte.${startUtc},requested_visit_at.lt.${endUtc}),` +
            `and(proposed_visit_at.gte.${startUtc},proposed_visit_at.lt.${endUtc})`,
        )
      if (assignedRepId) {
        builder = builder.eq('assigned_rep_id', assignedRepId)
      }
      const { data, error } = await builder
      if (error) throw error
      const rows = (data ?? []) as unknown as RepVisitRow[]
      const events: RepVisitEvent[] = []
      for (const row of rows) {
        const eff = deriveEffective(row)
        if (!eff) continue
        events.push({
          id: row.id,
          status: row.status,
          chargeStatus: row.charge_status,
          effectiveVisitAt: eff.iso,
          effectiveSource: eff.source,
          homeownerName: row.homeowner?.name ?? '(no name)',
          assignedRepId: row.assigned_rep_id,
          assignedRepName: row.assigned_rep?.name ?? null,
          address: formatAddress(row.address),
          dayKey: isoToBusinessDayKey(eff.iso),
        })
      }
      return events
    },
  })

  // Realtime piggyback on the rep_requests channel. Any INSERT/UPDATE/DELETE
  // invalidates every month-key so accepts/reschedules/cancels propagate
  // without manual refetch. Mirrors the use-rep-requests-list discipline.
  useEffect(() => {
    const channel = supabase
      .channel('rep-visits-month')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rep_requests' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['rep-visits-month'] })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const events = query.data ?? []
  const eventsByDay = useMemo(() => {
    const map: Record<string, RepVisitEvent[]> = {}
    for (const e of events) {
      ;(map[e.dayKey] ??= []).push(e)
    }
    // Sort each day chronologically.
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.effectiveVisitAt.localeCompare(b.effectiveVisitAt))
    }
    return map
  }, [events])

  return {
    eventsByDay,
    events,
    isLoading: query.isLoading,
    error: query.error ?? null,
  }
}
