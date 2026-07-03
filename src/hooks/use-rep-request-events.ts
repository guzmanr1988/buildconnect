// useRepRequestNotes — read-only thread of `note_added` events for a
// rep_request from the append-only rep_request_events table (mig 102).
//
// V1 scope (pin-76 candidate): admin/admin_employee read all per the
// rep_request_events_admin_read RLS policy (deployed prod-verified by
// hephaestus 2026-06-30). Other event_types (scheduled / visited /
// cancelled / etc.) stay routed through the existing AppointmentBlock +
// status-pill rails — this hook is intentionally narrow to one
// event_type so the surface stays simple while Rod evaluates whether
// to broaden to a unified Activity card in a later arc.
//
// Order: created_at DESC. Matches the rep_request_events_rep_request_idx
// index shape and surfaces the newest note first (recency scan).
//
// Realtime: dedicated channel `rep-request-events-<id>` subscribed to
// INSERT events on rep_request_events filtered to this rep_request_id,
// so admin-A's add propagates to admin-B's open detail-pane without a
// manual refetch. Mirrors the use-rep-request-detail Realtime piggyback
// pattern (channel name shape is the only meaningful divergence; events
// table watches INSERT not UPDATE since the table is append-only).
//
// Read path only — the write path (add-rep-request-note edge fn) is
// HELD pending Rod's add-only-vs-editable answer; the parent component
// wires the addNote prop only after that fork resolves.

import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { UserRole } from '@/types'

export interface RepRequestNoteEntry {
  id: string
  actorId: string | null
  actorRole: UserRole | null
  actorName: string | null
  note: string
  createdAt: string
}

export interface UseRepRequestNotesResult {
  notes: RepRequestNoteEntry[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

interface RepRequestEventRow {
  id: string
  actor_id: string | null
  actor_role: UserRole | null
  note: string | null
  created_at: string
  actor: { name: string | null } | null
}

const EVENT_SELECT =
  'id, actor_id, actor_role, note, created_at, actor:profiles!actor_id(name)'

export function useRepRequestNotes(repRequestId: string | null): UseRepRequestNotesResult {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => ['rep-request-events', 'note_added', repRequestId] as const,
    [repRequestId],
  )

  const query = useQuery<RepRequestNoteEntry[], Error>({
    queryKey,
    enabled: !!repRequestId,
    staleTime: 10_000,
    queryFn: async () => {
      if (!repRequestId) return []
      const { data, error } = await supabase
        .from('rep_request_events')
        .select(EVENT_SELECT)
        .eq('rep_request_id', repRequestId)
        .eq('event_type', 'note_added')
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as unknown as RepRequestEventRow[]
      return rows
        .filter((r) => r.note != null && r.note.trim().length > 0)
        .map<RepRequestNoteEntry>((r) => ({
          id: r.id,
          actorId: r.actor_id,
          actorRole: r.actor_role,
          actorName: r.actor?.name ?? null,
          note: r.note ?? '',
          createdAt: r.created_at,
        }))
    },
  })

  useEffect(() => {
    if (!repRequestId) return
    const channel = supabase
      .channel(`rep-request-events-${repRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rep_request_events',
          filter: `rep_request_id=eq.${repRequestId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [repRequestId, queryClient, queryKey])

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: async () => {
      await query.refetch()
    },
  }
}
