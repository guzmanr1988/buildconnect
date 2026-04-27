import { Clock, CheckCircle2, Flag } from 'lucide-react'

// Ship #316 — shared review-status display metadata helper.
// Lifts the BuildConnect review-state visual derivation to a single
// SoT consumed by /vendor/lead-workflow LeadCard + Lead Detail Modal
// + /admin/reviews queue (n=3 consumer trigger met for #103).
//
// Lighter-than-full-component-abstraction per #65 surface-vs-deep —
// helper supplies derived metadata (label / icon / className /
// variant) and consumers render their own JSX shape per layout-
// context (badge inline on LeadCard vs banner-with-note on flagged
// Modal vs the existing /admin/reviews STATUS_CONFIG idiom). Keeps
// layout flexibility while unifying the source-of-truth for the
// 3-state semantics.

export type ReviewStatusVariant = 'pending' | 'approved' | 'flagged'

export interface ReviewStatusDisplay {
  variant: ReviewStatusVariant
  label: string
  icon: typeof Clock
  // Tailwind classes for the badge variant (compact inline display).
  badgeClassName: string
  // Tailwind classes for the banner variant (full-width with note,
  // primarily used by the flagged state).
  bannerClassName: string
}

const PENDING: ReviewStatusDisplay = {
  variant: 'pending',
  label: 'Pending Platform Approval',
  icon: Clock,
  badgeClassName: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  bannerClassName: 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40',
}

const APPROVED: ReviewStatusDisplay = {
  variant: 'approved',
  label: 'Approved by BuildConnect',
  icon: CheckCircle2,
  badgeClassName: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  bannerClassName: 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40',
}

const FLAGGED: ReviewStatusDisplay = {
  variant: 'flagged',
  label: 'Flagged by BuildConnect',
  icon: Flag,
  badgeClassName: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  bannerClassName: 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40',
}

// Default-undefined treated as 'pending' per #314 schema convention
// (widen-reads-narrow-writes back-compat for legacy persisted entries
// without reviewStatus).
export function getReviewStatusDisplay(
  reviewStatus?: ReviewStatusVariant | string,
): ReviewStatusDisplay {
  if (reviewStatus === 'approved') return APPROVED
  if (reviewStatus === 'flagged') return FLAGGED
  return PENDING
}
