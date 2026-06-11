import { useMemo } from 'react'
import { Inbox, CalendarCheck, Handshake, Archive, X } from 'lucide-react'
import { useProjectsStore } from '@/stores/projects-store'
import { useVendorScope, useResolvedVendor, contractorMatchesVendor } from '@/lib/vendor-scope'
import { useAuthStore } from '@/stores/auth-store'
import { useVendorCatalogStore } from '@/stores/vendor-catalog-store'
import { computeWindowsDoorsCatalogTotal } from '@/lib/configurator-catalog-price'
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
  // Card-body background tint paired with `color` (icon-square). Used
  // by PipelineStatRow on admin/workflow + vendor/dashboard + vendor/
  // lead-workflow pipeline-preview row. Lifted from admin/workflow.tsx
  // inline canonical values for cross-surface visual parity.
  bgColor: string
  // Card border tint paired with bgColor. Same source/scope as bgColor.
  borderColor: string
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
// is in-progress work surface). bgColor + borderColor added in
// PR-275 — single-SoT for the PipelineStatRow pipeline-preview row
// shared across admin/workflow + vendor/dashboard + vendor/lead-
// workflow; canonical values lifted from admin/workflow.tsx inline.
export const LEAD_STAGES: LeadStageMeta[] = [
  { key: 'new', title: 'New Leads', icon: Inbox, color: 'bg-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-950/20', borderColor: 'border-amber-300', pulse: true },
  { key: 'confirmed', title: 'Scheduled Leads', icon: CalendarCheck, color: 'bg-emerald-500', bgColor: 'bg-emerald-50 dark:bg-emerald-950/20', borderColor: 'border-emerald-300' },
  { key: 'sold', title: 'Sold, Active', icon: Handshake, color: 'bg-success', bgColor: 'bg-success/5 dark:bg-success/10', borderColor: 'border-success/40', pulse: true },
  { key: 'completed', title: 'Projects Completed', icon: Archive, color: 'bg-slate-700', bgColor: 'bg-slate-50 dark:bg-slate-950/20', borderColor: 'border-slate-300' },
  { key: 'cancelled', title: 'Cancelled Projects', icon: X, color: 'bg-destructive', bgColor: 'bg-destructive/5 dark:bg-destructive/10', borderColor: 'border-destructive/30' },
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
// 2026-05-08 — task_1776818232208_731 lift: scope-aligned with
// /vendor/projects (lead-inbox.tsx). Both surfaces now strict-filter
// sentProjects by contractorMatchesVendor() so counts reconcile (per
// MATH IS GOD + SOURCE OF TRUTH; banked feedback_shared_state_key_
// source_consistency). Pre-launch single-test-vendor scenario: all
// homeowner-booked leads route to that vendor and must show on BOTH
// surfaces; pre-lift /workflow leaked cross-vendor data while
// /projects correctly scoped, producing the surface-count mismatch
// Rodolfo flagged.
export function useVendorLeadStages(): {
  leads: LeadExt[]
  stages: Record<LeadStageKey, LeadExt[]>
  counts: Record<LeadStageKey, number>
  isCancelledLead: (l: LeadExt) => boolean
} {
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  const leadCompletedAtByLead = useProjectsStore((s) => s.leadCompletedAtByLead)
  const accountRepIdByLead = useProjectsStore((s) => s.accountRepIdByLead)
  const { vendorId: VENDOR_ID } = useVendorScope()
  const vendor = useResolvedVendor()
  const profile = useAuthStore((s) => s.profile)
  const getVendorPrice = useVendorCatalogStore((s) => s.getPrice)
  // Rod-go 2026-06-09 — mock/demo seed REMOVED. Vendor inbox renders
  // ONLY real homeowner-sent leads. mockLeads merge gone — `combined`
  // is just `homeownerLeads`.

  const homeownerLeads = useMemo<LeadExt[]>(
    // Ship #319 — defensive filter on malformed entries (Rodolfo
    // production crash: localStorage state from earlier testing
    // contained an undefined or partial sentProject entry; map-then-
    // read crashed on p.id of undefined).
    // Ship #320 — DROPPED the `!!p.item` guard from #319 (was too
    // aggressive — silently stripped legitimate entries where .item
    // happened to be falsy/weird after localStorage round-trip,
    // causing leads-not-populating regression on /vendor/lead-workflow).
    // Filter now strips ONLY truly-malformed entries (undefined p OR
    // non-string id); downstream reads use ?. for .item to handle
    // undefined gracefully.
    // 2026-05-08 — task_1776818232208_731 lift: added strict vendor-
    // scope predicate via contractorMatchesVendor() so this surface
    // matches lead-inbox.tsx scope. Bidirectional id resolver handles
    // the booking-write-side mock-id ('v-1') vs read-side UUID
    // mismatch for non-mock-mapped vendor logins.
    () => sentProjects
      .filter((p): p is typeof p => {
        if (!p || typeof p.id !== 'string') return false
        if (!vendor) return false
        if (!contractorMatchesVendor(p.contractor, vendor)) return false
        if (profile?.role === 'account_rep' && profile.id) {
          const leadId = `L-${p.id.slice(0, 4).toUpperCase()}`
          return accountRepIdByLead[leadId] === profile.id
        }
        return true
      })
      .filter((p) => {
        // Rod-go 2026-06-09 — APPEAR-WITH-PRICE-OR-ABSENT. Same predicate
        // as lead-inbox.tsx homeownerLeads filter.
        // 2026-06-10 launch-night fix — quotedPriceCents is a real price
        // frozen at booking time (Ship #355). Treat as valid price source
        // alongside saleAmount + priceLineItems-sum so Apex leads with a
        // booking-time quote but no per-line breakdown render correctly.
        if (p.saleAmount && p.saleAmount > 0) return true
        if (p.quotedPriceCents && p.quotedPriceCents > 0) return true
        if (!p.priceLineItems || p.priceLineItems.length === 0) return false
        const value = p.item?.serviceId === 'windows_doors'
          ? computeWindowsDoorsCatalogTotal(p.item as any, p.priceLineItems, getVendorPrice)
          : p.priceLineItems.reduce((s, l) => s + (l.amount || 0), 0)
        return value > 0
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
      address: p.item?.roofMeasurement?.address ?? p.homeowner?.address ?? 'Pending site visit',
      phone: p.homeowner?.phone || '—',
      email: p.homeowner?.email || '—',
      sq_ft: p.item?.roofMeasurement?.areaSqft ?? 0,
      service_category: (p.item?.serviceId ?? '') as Lead['service_category'],
      // Project-level permit (PR #140): sentProject.projectPermit is the SoT;
      // legacy per-item roofPermit is the fallback for snapshots persisted
      // pre-PR-140; legacy non-roofing fallback (windows/doors selections-derived)
      // remains for the windows_doors scope group removed in this same PR.
      permit_choice: (() => {
        const projectPermit = (p as any).projectPermit as 'yes' | 'no' | undefined
        if (projectPermit) return projectPermit === 'yes'
        const legacyRoofPermit = (p.item as any)?.roofPermit as 'yes' | 'no' | undefined
        if (legacyRoofPermit) return legacyRoofPermit === 'yes'
        return Object.values(p.item?.selections ?? {}).flat().includes('permit')
      })(),
      financing: Object.values(p.item?.selections ?? {}).flat().includes('financed'),
      pack_items: p.item?.selections ?? {},
      slot: p.booking?.date ? `${p.booking.date}T${p.booking.time ?? '09:00'}` : p.sentAt,
      received_at: p.sentAt,
      soldAt: p.soldAt,
      completedAt: p.completedAt,
      reviewStatus: p.reviewStatus,
      reviewNote: p.reviewNote,
    })),
    [sentProjects, VENDOR_ID, vendor, profile?.role, profile?.id, accountRepIdByLead, getVendorPrice],
  )

  return useMemo(() => {
    const combined: LeadExt[] = homeownerLeads
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
  }, [homeownerLeads, leadStatusOverrides, cancellationRequestsByLead, leadCompletedAtByLead])
}
