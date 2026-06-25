// Concierge "Request a Rep" — FE state-binding contract.
// Single source of truth for status enums, label/pill maps, the
// payment-submission state machine, and the FE-facing detail shape.
// snake_case at the wire boundary matches the BC repo convention
// (projects.status = in_progress, user_role = account_rep, etc.) and
// is what hephaestus's mig 101 stores in concierge_rep_requests.status
// + .charge_status. All FE consumers (hooks, components, route
// params) must import these symbols rather than re-declaring.

// ── Lifecycle status (verbatim DB enum, snake_case end-to-end) ──────
// pending_payment: row exists pre-charge so an INSERT-then-charge
//   sequence never leaves money-moved-without-row; charge_failed is
//   the terminal-recoverable branch (retry path exists, see
//   SubmitFormState.paymentError). new..contractor_selected are the
//   five tracker states the homeowner sees; cancelled is terminal-
//   non-recoverable. charge_failed is intentionally NOT in
//   CUSTOMER_TRACKER_STATES because it represents a system-payment
//   failure (Stripe webhook driven), not a milestone the homeowner
//   progresses through.
export type RepRequestStatus =
  | 'pending_payment'
  | 'new'
  | 'scheduled'
  | 'visited'
  | 'project_ready'
  | 'contractor_selected'
  | 'cancelled'
  | 'charge_failed'

// ── Refund/charge axis (orthogonal to status) ───────────────────────
// not_charged: pre-charge row state (status=pending_payment).
// charged: Stripe PI succeeded, no refund issued.
// refund_pending: cancel-or-no-visit flow fired, Stripe refund posted
//   but webhook confirmation pending.
// refunded: Stripe webhook confirmed; refundedAmountCents populated.
export type RepRequestChargeStatus =
  | 'not_charged'
  | 'charged'
  | 'refund_pending'
  | 'refunded'

// ── Customer-facing tracker timeline ────────────────────────────────
// Five-step progress shown to the homeowner on the status page.
// pending_payment / charge_failed / cancelled are deliberately OUT —
// they are system-state badges (see STATUS_SYSTEM_BADGE), not steps
// on the visible progress line. Order matters for the timeline UI.
export const CUSTOMER_TRACKER_STATES: ReadonlyArray<RepRequestStatus> = [
  'new',
  'scheduled',
  'visited',
  'project_ready',
  'contractor_selected',
]

// Plain-English labels. Mirror what iris §2 mockups show in the
// queue, detail header, and tracker pills.
export const STATUS_LABELS: Record<RepRequestStatus, string> = {
  pending_payment: 'Pending Payment',
  new: 'New',
  scheduled: 'Scheduled',
  visited: 'Visited',
  project_ready: 'Project Ready',
  contractor_selected: 'Contractor Selected',
  cancelled: 'Cancelled',
  charge_failed: 'Charge Failed',
}

// Tailwind class tokens for the status pill. Tones align with the
// existing project-status pills elsewhere in the repo (gray=neutral,
// blue=in-flight, amber=awaiting-action, green=success, red=failure).
export const STATUS_PILL_CLASSES: Record<RepRequestStatus, string> = {
  pending_payment: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800',
  new: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-800',
  scheduled: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:ring-indigo-800',
  visited: 'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:ring-purple-800',
  project_ready: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800',
  contractor_selected: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-800',
  cancelled: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:ring-gray-700',
  charge_failed: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-800',
}

// System-state badges displayed alongside (not inside) the customer
// tracker timeline for statuses that are NOT homeowner-progressed
// milestones. pending_payment renders a neutral "SYSTEM" badge while
// the row is awaiting first-charge confirmation; charge_failed renders
// a "PAYMENT FAILED" danger badge with a retry surface. cancelled is
// not here because the entire tracker collapses to a cancellation
// notice instead of showing a badge.
export const STATUS_SYSTEM_BADGE: Partial<Record<RepRequestStatus, { label: string; tone: 'system' | 'danger' }>> = {
  pending_payment: { label: 'SYSTEM', tone: 'system' },
  charge_failed: { label: 'PAYMENT FAILED', tone: 'danger' },
}

// ── Submit-form state machine (intake Step 3 payment screen) ────────
// Distinct from RepRequestStatus on purpose: this is the local
// payment-form UI state, NOT the persisted lifecycle state of the
// row. The two only converge when kind='succeeded' and a tracker
// query for repRequestId returns status='new' (post-webhook).
// charge_failed appears HERE as kind='paymentError' (recoverable
// retry path), not as a tracker step. shouldRenderTracker() is the
// only consumer-facing way to ask "is the tracker visible yet".
export type SubmitFormState =
  | { kind: 'idle' }
  | { kind: 'submitting'; intentClientSecret?: string }
  | { kind: 'paymentError'; reason: string; canRetry: true; intentClientSecret: string }
  | { kind: 'succeeded'; repRequestId: string }

export function shouldRenderTracker(
  s: SubmitFormState
): s is { kind: 'succeeded'; repRequestId: string } {
  return s.kind === 'succeeded'
}

// ── Intake form payload (homeowner Step 1+2 capture) ────────────────
// Three availability buckets reflect iris §1b mockup chips. Photos
// are File handles pre-upload; the hook owns Storage put + URL
// resolution before POSTing the create-rep-request edge function.
export type RepRequestAvailabilityBucket =
  | 'weekday_morning'
  | 'weekday_afternoon'
  | 'weekend_anytime'

export interface IntakeFormData {
  address: string
  // Populated when Google Places Autocomplete returns a selection with full
  // address_components. The submit hook prefers this over parseFlatAddress to
  // avoid the unpunctuated-multi-word-city failure mode. Stays undefined when
  // Maps SDK fails to load or the homeowner typed past the autocomplete —
  // submit then falls back to parseFlatAddress(address).
  structuredAddress?: {
    line1: string
    city: string
    state: string
    zip: string
  }
  description?: string
  photos: File[]
  contactName: string
  contactPhone: string
  availabilityBuckets: RepRequestAvailabilityBucket[]
  accessNotes?: string
}

// ── Detail shape returned by useRepRequestDetail ────────────────────
// Mirrors the joined view hephaestus exposes (concierge_rep_requests
// + concierge_rep_request_photos + denormalized homeowner contact).
// Cents-denominated money fields keep float-math out of pricing
// logic; the $250 / $200 / $50 split is fixed at the contract layer
// (NOT a per-row column) but exposed here for component math
// convenience.
export interface RepRequestDetail {
  id: string
  status: RepRequestStatus
  chargeStatus: RepRequestChargeStatus
  homeownerId: string
  assignedRepId: string | null
  projectId: string | null
  address: string
  description: string | null
  contactName: string
  contactPhone: string
  requestedVisitTimes: RepRequestAvailabilityBucket[]
  accessNotes: string | null
  assessmentNotes: string | null
  photos: Array<{ id: string; storagePath: string; uploadedAt: string }>
  visitFeeCents: 25000
  refundableCents: 20000
  retainedCents: 5000
  stripePaymentIntentId: string | null
  stripeRefundId: string | null
  refundedAmountCents: number | null
  cancelledAt: string | null
  cancelledBy: 'homeowner' | 'admin' | 'system' | null
  createdAt: string
  updatedAt: string
}

// ── Per-role action permissions ─────────────────────────────────────
// Derived from (viewerRole, detail.status, detail.assignedRepId).
// admin permission-set is a SUPERSET of rep (PURE-SEPARATE role
// enum — no junction). Components consume this rather than
// re-deriving from role + status everywhere.
export interface RepRequestActions {
  canAssignRep: boolean
  canAdvanceStatus: boolean
  canCancel: boolean
  canMarkVisited: boolean
  canMarkProjectReady: boolean
  canBuildProject: boolean
}
