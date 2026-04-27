import { useMemo } from 'react'
import { Inbox, CalendarCheck, Handshake, Archive, X } from 'lucide-react'
import { useProjectsStore } from '@/stores/projects-store'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useVendorScope } from '@/lib/vendor-scope'
import type { Lead } from '@/types'

export type LeadStageKey = 'new' | 'confirmed' | 'sold' | 'completed' | 'cancelled'

export type LeadExt = Lead & { soldAt?: string; completedAt?: string; _projectId?: string }

export interface LeadStageMeta {
  key: LeadStageKey
  title: string
  icon: typeof Inbox
  // Tailwind bg-* class applied to the icon-square wrapper. Same
  // values across both consumers (lead-workflow tiles + dashboard
  // summary row) per #103 single-source-of-truth.
  color: string
}

// Ordered for both lead-workflow tile sequence (#293) and dashboard
// compact summary row (#303). Same order = same mental model across
// the two surfaces. Colors added in #306 — canonical values lifted
// from the original lead-workflow.tsx tile color props.
export const LEAD_STAGES: LeadStageMeta[] = [
  { key: 'new', title: 'New Leads', icon: Inbox, color: 'bg-amber-500' },
  { key: 'confirmed', title: 'Scheduled Leads', icon: CalendarCheck, color: 'bg-emerald-500' },
  { key: 'sold', title: 'Sold, Active', icon: Handshake, color: 'bg-primary' },
  { key: 'completed', title: 'Projects Completed', icon: Archive, color: 'bg-slate-500' },
  { key: 'cancelled', title: 'Cancelled Projects', icon: X, color: 'bg-destructive' },
]

// By-key lookup map for consumers that render tiles in fixed order
// rather than iterating LEAD_STAGES (e.g. lead-workflow.tsx tiles
// each have distinct empty-state messages so they're rendered
// individually).
export const STAGE_COLOR_BY_KEY: Record<LeadStageKey, string> = Object.fromEntries(
  LEAD_STAGES.map((s) => [s.key, s.color]),
) as Record<LeadStageKey, string>

const SOLD_TO_COMPLETED_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

const sentProjectStatusMap: Record<string, Lead['status']> = {
  pending: 'pending',
  approved: 'confirmed',
  declined: 'rejected',
  sold: 'completed',
}

// Source-of-truth hook for vendor lead-stage bucketing. Powers both
// /vendor/lead-workflow tiles and /vendor compact summary row (#303).
// Cancellation-aware (#171/#184) + completedAt-aware (#295) bucketing.
//
// Cross-vendor-visibility intentionally loose in demo mode (does NOT
// filter sentProjects by contractor.vendor_id) per Rodolfo "they all
// should work" — task_1776818232208_731 lifts to strict scope post-
// launch when real vendor accounts wire up.
export function useVendorLeadStages(): {
  leads: LeadExt[]
  stages: Record<LeadStageKey, LeadExt[]>
  counts: Record<LeadStageKey, number>
  isCancelledLead: (l: LeadExt) => boolean
} {
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  const { vendorId: VENDOR_ID, mockVendorId } = useVendorScope()
  const effectiveMockLeads = useEffectiveMockLeads()
  // Gate seeded MOCK_LEADS to the 5 featured mock vendors (v-1..v-5)
  // per Rod P0 2026-04-20 — synthesized/unmapped vendors must NOT
  // inherit Maria L-0001 + James L-0005 as their own leads.
  const mockLeads = useMemo(
    () => (mockVendorId ? effectiveMockLeads.filter((l) => l.vendor_id === VENDOR_ID) : []),
    [VENDOR_ID, mockVendorId, effectiveMockLeads],
  )

  const homeownerLeads = useMemo<LeadExt[]>(
    () => sentProjects.map((p) => ({
      id: `L-${p.id.slice(0, 4).toUpperCase()}`,
      _projectId: p.id,
      homeowner_id: 'ho-current',
      vendor_id: VENDOR_ID,
      homeowner_name: p.homeowner?.name || 'New Customer',
      project: p.item.serviceName + ' — ' + Object.values(p.item.selections).flat().map((s) => s.replace(/_/g, ' ')).join(', '),
      status: (sentProjectStatusMap[p.status] || 'pending') as Lead['status'],
      value: 0,
      address: p.homeowner?.address || 'Pending site visit',
      phone: p.homeowner?.phone || '—',
      email: p.homeowner?.email || '—',
      sq_ft: 0,
      service_category: p.item.serviceId as Lead['service_category'],
      permit_choice: Object.values(p.item.selections).flat().includes('permit'),
      financing: Object.values(p.item.selections).flat().includes('financed'),
      pack_items: p.item.selections,
      slot: p.sentAt,
      received_at: p.sentAt,
      soldAt: p.soldAt,
      completedAt: p.completedAt,
    })),
    [sentProjects, VENDOR_ID],
  )

  return useMemo(() => {
    const combined: LeadExt[] = [...homeownerLeads, ...mockLeads]
    const leads: LeadExt[] = combined.map((l) =>
      leadStatusOverrides[l.id] ? { ...l, status: leadStatusOverrides[l.id] } : l,
    )

    const isCancelledLead = (l: LeadExt): boolean => {
      if (l.status === 'cancelled' || l.status === 'rejected') return true
      const cReq = cancellationRequestsByLead[l.id]
      return cReq?.status === 'approved'
    }
    const isManuallyCompleted = (l: LeadExt): boolean => !!l.completedAt
    const now = Date.now()
    const soldAgeDays = (l: LeadExt): number | null => {
      if (!l.soldAt) return null
      return (now - new Date(l.soldAt).getTime()) / DAY_MS
    }

    const newLeads = leads.filter((l) => l.status === 'pending' || l.status === 'rescheduled')
    const confirmedLeads = leads.filter((l) => l.status === 'confirmed')
    const projectSold = leads.filter((l) => {
      if (isCancelledLead(l)) return false
      if (l.status !== 'completed') return false
      if (isManuallyCompleted(l)) return false
      const age = soldAgeDays(l)
      return age === null || age < SOLD_TO_COMPLETED_DAYS
    })
    const projectsCompleted = leads.filter((l) => {
      if (isCancelledLead(l)) return false
      if (l.status !== 'completed') return false
      if (isManuallyCompleted(l)) return true
      const age = soldAgeDays(l)
      return age !== null && age >= SOLD_TO_COMPLETED_DAYS
    })
    const cancelledProjects = leads.filter(isCancelledLead)

    const stages: Record<LeadStageKey, LeadExt[]> = {
      new: newLeads,
      confirmed: confirmedLeads,
      sold: projectSold,
      completed: projectsCompleted,
      cancelled: cancelledProjects,
    }
    const counts: Record<LeadStageKey, number> = {
      new: newLeads.length,
      confirmed: confirmedLeads.length,
      sold: projectSold.length,
      completed: projectsCompleted.length,
      cancelled: cancelledProjects.length,
    }
    return { leads, stages, counts, isCancelledLead }
  }, [homeownerLeads, mockLeads, leadStatusOverrides, cancellationRequestsByLead])
}
