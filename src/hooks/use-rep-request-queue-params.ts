// Concierge Rep Request — admin queue URL-param bridge.
// Backs both /admin/rep-requests + /admin/rep-requests/mine queues:
// detail-pin via :id route param, status filter via ?status= search
// param. URL-source-of-truth pattern (NOT useState) so deep-links +
// back/forward navigation round-trip the queue selection.
//
// COMMIT 2: real implementation lands here — the URL plumbing has no
// edge-fn dependency so it can ship usable. selectedId mirrors
// useParams().id; setSelectedId pushes navigate('../<id>') keeping
// the current query string. statusFilter is read from
// useSearchParams().get('status'); setStatusFilter swaps the param.

import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { RepRequestStatus } from '@/features/admin/rep-requests/rep-request-contract'

const VALID_STATUSES: ReadonlySet<RepRequestStatus> = new Set<RepRequestStatus>([
  'pending_payment',
  'new',
  'scheduled',
  'visited',
  'project_ready',
  'contractor_selected',
  'cancelled',
  'charge_failed',
])

export interface UseRepRequestQueueParamsResult {
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  statusFilter: RepRequestStatus | null
  setStatusFilter: (s: RepRequestStatus | null) => void
}

export function useRepRequestQueueParams(): UseRepRequestQueueParamsResult {
  const params = useParams<{ id?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  // :id from route — null when on the listless URL (queue alone, no
  // detail pin). Empty-string and the literal "mine" sentinel (rep
  // queue index) coerce to null so consumers don't render a detail
  // panel for non-id segments.
  const selectedId = useMemo(() => {
    const raw = params.id
    if (!raw || raw === 'mine') return null
    return raw
  }, [params.id])

  const setSelectedId = useCallback(
    (id: string | null) => {
      const query = searchParams.toString()
      const suffix = query ? `?${query}` : ''
      // Derive ABSOLUTE base path from current pathname — relative
      // navigation from a detail route (/admin/rep-requests/{uuid})
      // produces doubled-uuid 404s (./{newId} resolves to
      // /admin/rep-requests/{currentUuid}/{newId}). The hook backs
      // both /admin/rep-requests/:id and /admin/rep-requests/mine/:id,
      // so the base is one of two literals.
      const basePath = location.pathname.startsWith('/admin/rep-requests/mine')
        ? '/admin/rep-requests/mine'
        : '/admin/rep-requests'
      if (id) {
        navigate(`${basePath}/${id}${suffix}`)
      } else {
        navigate(`${basePath}${suffix}`)
      }
    },
    [navigate, searchParams, location.pathname]
  )

  const statusFilter = useMemo<RepRequestStatus | null>(() => {
    const raw = searchParams.get('status')
    if (!raw) return null
    return VALID_STATUSES.has(raw as RepRequestStatus) ? (raw as RepRequestStatus) : null
  }, [searchParams])

  const setStatusFilter = useCallback(
    (s: RepRequestStatus | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (s === null) next.delete('status')
          else next.set('status', s)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  return { selectedId, setSelectedId, statusFilter, setStatusFilter }
}
