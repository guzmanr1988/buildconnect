// Ship #237 — shared resolver for the "Sold, Active" status label.
// Centralized per the banked format-SoT-via-shared-helper discipline:
// 8 surfaces (vendor dashboard main + dialog, vendor lead-inbox, vendor
// calendar, admin homeowners ×2, admin vendors, homeowner appointment-
// status) all render the per-lead status badge. Consolidating the
// "sold-within-active-window" override here keeps all surfaces in lockstep
// with Rodolfo's mental model: sold leads under the active-service window
// read "Sold, Active"; sold leads past the window read "Completed".

const SOLD_ACTIVE_WINDOW_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

interface LeadShape {
  status: string
  soldAt?: string
  // Ship #311 — manual-completion-aware label resolution. When
  // completedAt is set (either via sentProject.completedAt #295 or
  // leadCompletedAtByLead override map), the label flips to the
  // default "Completed" regardless of soldAt-age. Fixes label-as-
  // contract violation where vendor clicked Project Completed but
  // status badge still read "Sold, Active".
  completedAt?: string
}

/**
 * Returns the label override for a lead's StatusBadge when the lead is
 * sold AND still within the active-service window. Returns undefined for
 * every other state — caller falls through to the default
 * LEAD_STATUS_CONFIG[status].label.
 *
 * Callers with their own status-specific label overrides (e.g.,
 * homeowner/appointment-status.tsx) compose this at the end of their
 * ternary chain.
 */
export function resolveLeadStatusLabel(lead: LeadShape): string | undefined {
  if (lead.status !== 'completed') return undefined
  // Ship #311 — manual-completion wins over age-based "Sold, Active"
  // override. Once vendor marks as completed, label reads "Completed"
  // (default) immediately.
  if (lead.completedAt) return undefined
  if (!lead.soldAt) return 'Sold, Active'
  const age = (Date.now() - new Date(lead.soldAt).getTime()) / DAY_MS
  if (age < SOLD_ACTIVE_WINDOW_DAYS) return 'Sold, Active'
  return undefined
}
