import { useMemo } from 'react'
import { Inbox, CalendarCheck, Handshake, Archive, X } from 'lucide-react'
import { useProjectsStore } from '@/stores/projects-store'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useVendorScope, useResolvedVendor } from '@/lib/vendor-scope'
import type { Lead } from '@/types'

export type LeadStageKey = 'new' | 'confirmed' | 'sold' | 'completed' | 'cancelled'

export type LeadExt = Lead & {
  soldAt?: string
  completedAt?: string
  _projectId?: string
  // Ship #316 — BuildConnect review state propagated from sentProject
  // for vendor-side visibility on Sold Active LeadCard + Lead Detail
  // Modal. undefined treated as 'pending' per #314 schema convention.
  reviewStatus?: 'pending' | 'approved' | 'flagged'
  reviewNote?: string
}

export interface LeadStageMeta {
  key: LeadStageKey
  title: string
  icon: typeof Inbox
  // Tailwind bg-* class applied to the icon-square wrapper. Same
  // values across both consumers (lead-workflow tiles + dashboard
  // summary row) per #103 single-source-of-truth.
  color: string
  // Ship #310 — attention-grabbing pulse animation per Rodolfo
  // "add an animation on new leads and sold". true = renders the
  // colored-square with animate-pulse on both consumer surfaces
  // (lead-workflow tile icon + dashboard summary row colored
  // square). Held as field on LEAD_STAGES per #103 single-source-
  // of-truth (extension-as-extraction sibling of #306 color field).
  pulse?: boolean
}

// Ordered for both lead-workflow tile sequence (#293) and dashboard
// compact summary row (#303). Same order = same mental model across
// the two surfaces. Colors added in #306 — canonical values lifted
// from the original lead-workflow.tsx tile color props. Pulse field
// added in #310 — attention-grabbing animation on the active-action
// stages (New Leads needs vendor attention to confirm; Sold Active
// is in-progress work surface).
export const LEAD_STAGES: LeadStageMeta[] = [
  { key: 'new', title: 'New Leads', icon: Inbox, color: 'bg-amber-500', pulse: true },
  { key: 'confirmed', title: 'Scheduled Leads', icon: CalendarCheck, color: 'bg-emerald-500' },
  { key: 'sold', title: 'Sold, Active', icon: Handshake, color: 'bg-primary', pulse: true },
  { key: 'completed', title: 'Projects Completed', icon: Archive, color: 'bg-slate-500' },
  { key: 'cancelled', title: 'Cancelled Projects', icon: X, color: 'bg-destructive' },
]

// By-key lookup maps for consumers that render tiles in fixed order
// rather than iterating LEAD_STAGES (e.g. lead-workflow.tsx tiles
// each have distinct empty-state messages so they're rendered
// individually).
export const STAGE_COLOR_BY_KEY: Record<LeadStageKey, string> = Object.fromEntries(
  LEAD_STAGES.map((s) => [s.key, s.color]),
) as Record<LeadStageKey, string>

export const STAGE_PULSE_BY_KEY: Record<LeadStageKey, boolean> = Object.fromEntries(
  LEAD_STAGES.map((s) => [s.key, !!s.pulse]),
) as Record<LeadStageKey, boolean>

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
  // Ship #311 — manual-completion override map. MOCK_LEADS without
  // sentProject backing get marked completed via this map; bucketing
  // + label-derivation read lead.completedAt downstream so the
  // override-aware value propagates to all consumers transparently.
  const leadCompletedAtByLead = useProjectsStore((s) => s.leadCompletedAtByLead)
  const { vendorId: VENDOR_ID, mockVendorId } = useVendorScope()
  // Ship #329 — resolved-vendor for strict-scope filter (mirrors
  // lead-inbox.tsx pattern). Vendor id + company-fallback pair
  // matches the canonical vendor-scope shape used everywhere else
  // post-#214 + #263.
  const resolvedVendor = useResolvedVendor()
  const effectiveMockLeads = useEffectiveMockLeads()
  // Gate seeded MOCK_LEADS to the 5 featured mock vendors (v-1..v-5)
  // per Rod P0 2026-04-20 — synthesized/unmapped vendors must NOT
  // inherit Maria L-0001 + James L-0005 as their own leads.
  const mockLeads = useMemo(
    () => (mockVendorId ? effectiveMockLeads.filter((l) => l.vendor_id === VENDOR_ID) : []),
    [VENDOR_ID, mockVendorId, effectiveMockLeads],
  )

  const homeownerLeads = useMemo<LeadExt[]>(
    // Ship #319 — defensive filter on malformed entries (Rodolfo
    // production crash: localStorage state from earlier testing
    // contained an undefined or partial sentProject entry; map-then-
    // read crashed on p.id of undefined).
    // Ship #320 — DROPPED the `!!p.item` guard from #319 (was too
    // aggressive — silently stripped legitimate entries where .item
    // happened to be falsy/weird after localStorage round-trip,
    // causing leads-not-populating regression on /vendor/lead-workflow).
    // Ship #329 — strict vendor-scope filter mirrors lead-inbox.tsx
    // shape per banked feedback_label_as_contract_indicator_semantics.
    // Pre-#329 the loose scope was intentional ("they all should
    // work" per Rodolfo task_1776818232208_731 demo-testing
    // directive), but #328 surfaced a count-badge that exposed the
    // divergence between badge (over-counted) + Projects page
    // (correctly scoped). Rodolfo's expectation flipped: counts
    // across surfaces must match, even if it means dropping demo-
    // bleed entries from other vendors. Strict-scope is the right
    // shape now.
    () => sentProjects
      .filter((p): p is typeof p => !!p && typeof p.id === 'string')
      .filter((p) => {
        // Strict vendor-scope: only this vendor's sentProjects.
        // Mirror lead-inbox.tsx:76-82 — match by contractor.vendor_id
        // FK (preferred) with legacy company-name fallback for pre-#165
        // entries that lack the FK. Reject when no resolved vendor (no
        // active session — empty render is safer than over-render).
        if (!resolvedVendor) return false
        if (p.contractor?.vendor_id) return p.contractor.vendor_id === resolvedVendor.id
        return p.contractor?.company === resolvedVendor.company
      })
      .map((p) => ({
      id: `L-${p.id.slice(0, 4).toUpperCase()}`,
      _projectId: p.id,
      homeowner_id: 'ho-current',
      vendor_id: VENDOR_ID,
      homeowner_name: p.homeowner?.name || 'New Customer',
      project: (p.item?.serviceName ?? 'Unknown service') + ' — ' + Object.values(p.item?.selections ?? {}).flat().map((s) => s.replace(/_/g, ' ')).join(', '),
      status: (sentProjectStatusMap[p.status] || 'pending') as Lead['status'],
      value: 0,
      address: p.homeowner?.address || 'Pending site visit',
      phone: p.homeowner?.phone || '—',
      email: p.homeowner?.email || '—',
      sq_ft: 0,
      service_category: (p.item?.serviceId ?? '') as Lead['service_category'],
      permit_choice: Object.values(p.item?.selections ?? {}).flat().includes('permit'),
      financing: Object.values(p.item?.selections ?? {}).flat().includes('financed'),
      pack_items: p.item?.selections ?? {},
      slot: p.sentAt,
      received_at: p.sentAt,
      soldAt: p.soldAt,
      completedAt: p.completedAt,
      reviewStatus: p.reviewStatus,
      reviewNote: p.reviewNote,
    })),
    [sentProjects, VENDOR_ID, resolvedVendor?.id, resolvedVendor?.company],
  )

  return useMemo(() => {
    const combined: LeadExt[] = [...homeownerLeads, ...mockLeads]
    const leads: LeadExt[] = combined.map((l) => {
      const statusOverride = leadStatusOverrides[l.id]
      const completedOverride = leadCompletedAtByLead[l.id]
      // Apply override-aware completedAt: prefer existing
      // (sp.completedAt) when present, fall back to leadCompletedAt
      // override map (covers MOCK_LEADS without sp backing).
      const effectiveCompletedAt = l.completedAt ?? completedOverride
      if (!statusOverride && effectiveCompletedAt === l.completedAt) return l
      return {
        ...l,
        ...(statusOverride ? { status: statusOverride } : {}),
        completedAt: effectiveCompletedAt,
      }
    })

    const isCancelledLead = (l: LeadExt): boolean => {
      if (l.status === 'cancelled' || l.status === 'rejected') return true
      const cReq = cancellationRequestsByLead[l.id]
      return cReq?.status === 'approved'
    }
    // Ship #318 — Projects Completed requires reviewStatus='approved'
    // per Rodolfo "no pending approvals by buildconnect cant be on
    // projects completed unless it was approved by buildconnect".
    // Strict gate at SoT layer — both manual-completion path and 90d
    // age-based path now require approval. Pre-existing entries that
    // had completedAt without approval are migrated via legacy-
    // completed-approval-backfill helper at app entry; bucketing only
    // sees entries that already passed the migration step.
    const isManuallyCompleted = (l: LeadExt): boolean =>
      !!l.completedAt && l.reviewStatus === 'approved'
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
      // Ship #318 — entries with completedAt set but reviewStatus !==
      // 'approved' fall back to Sold Active (visible-but-disabled
      // Project Completed button per #317). isManuallyCompleted now
      // gates on approval, so non-approved completedAt-set entries
      // are not in Projects Completed AND not in Sold Active per the
      // age-based path (they have age=0 since soldAt is recent).
      // Inclusion logic: any non-cancelled status='completed' entry
      // that is NOT approved-completed AND age < 90d.
      if (isManuallyCompleted(l)) return false
      const age = soldAgeDays(l)
      return age === null || age < SOLD_TO_COMPLETED_DAYS
    })
    const projectsCompleted = leads.filter((l) => {
      if (isCancelledLead(l)) return false
      if (l.status !== 'completed') return false
      // Ship #318 — strict approval-gate: only approved deals can be
      // in Projects Completed. Both manual-completion path AND
      // age-based 90d path require this.
      if (l.reviewStatus !== 'approved') return false
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
  }, [homeownerLeads, mockLeads, leadStatusOverrides, cancellationRequestsByLead, leadCompletedAtByLead])
}
