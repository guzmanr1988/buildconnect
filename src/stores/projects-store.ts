import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem } from './cart-store'
import type { VendorRep, PriceLineItem } from '@/types'
import { PRICE_LINE_ITEM_PRESETS } from '@/lib/price-line-item-presets'

export interface ContractorInfo {
  // Ship #165 per task_1776731114470_226 — vendor_id FK is the stable
  // bridge key. Prefer it in all cross-surface lookups (was company-name
  // matching, which breaks on fixture rename per #131 Paradise Pools Inc
  // vs Paradise Pools FL catch). Optional for back-compat with pre-#165
  // persisted entries; consumers should prefer vendor_id when present and
  // fall back to company-match only when absent.
  vendor_id?: string
  name: string
  company: string
  rating: number
  avatar?: string
}

export interface BookingInfo {
  date: string
  time: string
}

export interface HomeownerInfo {
  name: string
  phone: string
  email: string
  address: string
}

export interface SentProject {
  id: string
  item: CartItem
  status: 'pending' | 'approved' | 'declined' | 'sold'
  contractor: ContractorInfo
  booking: BookingInfo
  homeowner?: HomeownerInfo
  // Ship #269 — homeowner profile.id snapshot for admin auditing /
  // dispute-support queries. HomeownerInfo carries display fields (name/
  // phone/email/address) but not the FK; admin surfaces couldn't filter
  // "which homeowner sent this lead" pre-#269. Optional for back-compat
  // with persisted entries that pre-date the FK; new sendProject calls
  // populate it from auth profile.id.
  homeowner_id?: string
  sentAt: string
  soldAt?: string
  // Ship #295 — vendor-marked manual completion. Presence overrides the
  // age-based 90d auto-transition so the project moves to Projects
  // Completed tile immediately on click instead of waiting on
  // SOLD_TO_COMPLETED_DAYS. Set by markCompleted; absence means age-
  // based bucketing applies.
  completedAt?: string
  saleAmount?: number
  rejectionReason?: string
  idDocument?: string
  // Vendor-assigned field representative. Required before the vendor can
  // Confirm a new-lead modal; editable post-confirm via the confirmed-tab
  // edit flow. Visible to the homeowner on /home/appointments/:id.
  assignedRep?: VendorRep
  // Timestamp when vendor transitioned this project into 'approved'.
  // Written by updateStatus; homeowner timeline renders the value.
  // Overwrites on re-approval (re-confirm after reschedule = latest time).
  confirmedAt?: string
  // Timestamp when vendor first picked the assignedRep. Overwrites on
  // reassignment (semantically "when the currently-assigned rep was set").
  repAssignedAt?: string
  // Ship #314 — BuildConnect contract review state. Set by admin on
  // /admin/reviews queue (Phase 1). reviewStatus=undefined treated as
  // "pending" by consumers (back-compat for legacy persisted entries
  // pre-#313 contract requirement). Phase 1 consequences are admin-
  // internal-only; vendor-visibility + commission-pause are Phase 2
  // (per banked discipline-precondition-check-as-time-sensitive).
  reviewStatus?: 'pending' | 'approved' | 'flagged'
  reviewedAt?: string
  reviewedBy?: string
  reviewNote?: string
  // Ship #336 Phase A — preset price-breakdown snapshotted at
  // sendProject time. Source: SERVICE_CATALOG[item.serviceId].priceLineItems.
  // Per banked feedback_immutable_ledger_freeze_at_write: locked at
  // intake; future catalog updates do NOT retro-rewrite this record.
  // Read-only across vendor (Lead Detail Modal sold-branch) + admin
  // (ProjectDetailDialog n=7 consumers) surfaces.
  priceLineItems?: PriceLineItem[]
}

// Ship #171 (task_1776662387601_014): 'cancelled' split from 'rejected'.
// approveCancellation now writes 'cancelled' (was 'rejected' by #75 Phase A).
// Pre-#171 persisted entries with status='rejected' + cancellationRequest.
// status='approved' are still surfaced as cancelled via the vendor-dashboard
// isCancelledLead predicate (back-compat read path).
type LeadStatusOverride = 'pending' | 'confirmed' | 'rejected' | 'rescheduled' | 'completed' | 'cancelled'

// Ship #191 (Rodolfo-direct 2026-04-21 pivot #12) — bidirectional
// reschedule-request shape. Either party proposes a new date/time;
// the other approves, counters (which flips the proposer), or rejects
// (which keeps the original). Entity exists only post-approval when
// a two-party negotiation is needed — pre-approval homeowner reschedules
// just updateBooking directly since the vendor hasn't accepted yet and
// there's nothing to negotiate.
export type RescheduleParty = 'homeowner' | 'vendor'

export interface RescheduleRequest {
  // Who is proposing this new time. Counter-proposal flips this.
  requestedBy: RescheduleParty
  requestedAt: string
  // Proposed new slot.
  proposedDate: string
  proposedTime: string
  // Snapshot of what the lead had when this request opened, so a
  // Reject can clearly show what is being kept.
  originalDate: string
  originalTime: string
  status: 'pending' | 'approved' | 'rejected'
  // Optional context ("family emergency", "truck broke down"). Shown
  // on the other party's banner.
  reason?: string
  // Set when the request resolves — approved/rejected.
  resolvedAt?: string
}

export interface CancellationRequest {
  requestedAt: string
  status: 'pending' | 'approved' | 'denied'
  // Homeowner-provided context on why cancellation was requested. Ship #88
  // extends the original shape (pending/approved/denied only) with
  // audit-trail fields for vendor review + admin audit. Both optional to
  // preserve back-compat with entries written pre-#88.
  reason?: string
  explanation?: string
}

interface ProjectsState {
  sentProjects: SentProject[]
  // Lead-id → rep map. Covers the mock-lead case (MOCK_LEADS rows that don't
  // have a sentProject row). Vendor dashboard writes to both this map AND the
  // sentProject when a sentProject exists; homeowner + admin read from here
  // keyed by lead.id, falling back to sentProject.assignedRep when needed.
  assignedRepByLead: Record<string, VendorRep>
  // Lead-id → status override map. Vendor actions (Confirm / Reject /
  // Reschedule / Mark-as-Sold) on MOCK_LEADS need to survive page refresh —
  // previously this was component-useState and wiped on reload (Rod-surfaced
  // via kratos msg 1776654141640). Moved here so it rides the same persist
  // channel as sentProjects + assignedRepByLead.
  leadStatusOverrides: Record<string, LeadStatusOverride>
  // Lead-id → cancellation request. Homeowner flips to {status: "pending"}
  // via cart "Request Project Cancellation" button; vendor approves/denies
  // from dashboard. Approve flips status to "approved" AND sets
  // leadStatusOverrides[leadId]="rejected" (reusing rejected bucket as the
  // cancelled lifecycle state per kratos msg 1776662371771 — Tranche-2
  // schema will diverge cancelled vs rejected).
  cancellationRequestsByLead: Record<string, CancellationRequest>
  // Ship #191 — lead-id → RescheduleRequest entity (post-approval
  // two-party negotiation). Pre-approval homeowner reschedules skip
  // this and updateBooking directly.
  rescheduleRequestsByLead: Record<string, RescheduleRequest>
  // Lead-id → vendor-confirm timestamp. Parallel to leadStatusOverrides
  // for the mock-lead path (MOCK_LEADS rows w/o sentProject). Written
  // whenever setLeadStatus(id, 'confirmed') fires; homeowner timeline on
  // /home/appointments/:id reads this to render real times on the
  // "Vendor confirmed visit" entry (previously empty per ship #72).
  leadConfirmedAtByLead: Record<string, string>
  // Lead-id → rep-assignment timestamp. Parallel to assignedRepByLead.
  // Written whenever assignRepByLead fires; consumed by homeowner
  // timeline on "Representative assigned" entry.
  repAssignedAtByLead: Record<string, string>
  sendProject: (item: CartItem, contractor: ContractorInfo, booking: BookingInfo, homeowner?: HomeownerInfo, idDocument?: string, homeownerId?: string) => void
  updateStatus: (id: string, status: SentProject['status']) => void
  updateBooking: (id: string, booking: BookingInfo) => void
  markSold: (id: string, saleAmount: number) => void
  // Ship #295 — vendor-marked manual completion. Stamps completedAt and
  // moves the project from Sold, Active to Projects Completed bucket
  // immediately. Acceleration of the existing 90d age-based auto-
  // transition; not a status change (still 'sold').
  markCompleted: (id: string) => void
  // Ship #311 — lead-id-keyed manual-completion override map. Mirrors
  // existing leadStatusOverrides / leadConfirmedAtByLead patterns so
  // MOCK_LEADS without sentProject backing still get the manual-
  // completion transition (markCompleted on sentProject doesn't fire
  // for MOCK_LEADS — silent-stale-fallback class fix). Bucketing in
  // vendor-lead-stages.ts reads this OR sp.completedAt for the unified
  // isManuallyCompleted predicate.
  leadCompletedAtByLead: Record<string, string>
  setLeadCompletedAt: (leadId: string, completedAt: string) => void
  // Ship #314 — admin BuildConnect review actions. Approve / Flag
  // applied to a sentProject by admin id; reviewNote required on
  // Flag, optional on Approve.
  setReviewStatus: (
    projectId: string,
    status: 'approved' | 'flagged',
    reviewedBy: string,
    reviewNote?: string,
  ) => void
  // Ship #326 — vendor cycles a flagged deal back to Pending by uploading
  // a revised contract. Resets reviewStatus to 'pending' + clears
  // reviewedAt + reviewedBy so the deal returns to admin's Pending bucket
  // for re-review. reviewNote is KEPT (legacy flag-note context preserved
  // in the flag-thread for audit-trail per #94 truthfulness).
  resetReviewStatus: (projectId: string) => void
  assignRep: (id: string, rep: VendorRep) => void
  // Assign a rep to a lead-id (mock-lead path; sentProject.assignedRep is
  // handled via assignRep).
  assignRepByLead: (leadId: string, rep: VendorRep) => void
  setLeadStatus: (leadId: string, status: LeadStatusOverride) => void
  requestCancellation: (leadId: string, reason?: string, explanation?: string) => void
  approveCancellation: (leadId: string) => void
  denyCancellation: (leadId: string) => void
  // Ship #191 — reschedule negotiation actions. Pre-approval homeowner
  // reschedule uses updateBooking directly and doesn't go through here.
  // Post-approval both parties can propose via requestReschedule.
  requestReschedule: (
    leadId: string,
    requestedBy: RescheduleParty,
    proposedDate: string,
    proposedTime: string,
    originalDate: string,
    originalTime: string,
    reason?: string,
  ) => void
  // Accept the proposed time. Consumer updates the lead's booking
  // separately (this action only closes the request); keeping the two
  // concerns separate means the lead update path (sentProjects vs
  // MOCK_LEADS) stays where its caller already handles it.
  approveReschedule: (leadId: string) => void
  // Counter with a new time. Flips requestedBy + updates proposed slot;
  // keeps original snapshot, resets status to 'pending' on the other
  // side of the table.
  counterReschedule: (
    leadId: string,
    proposedDate: string,
    proposedTime: string,
    reason?: string,
  ) => void
  // Reject — status flips to 'rejected' + resolvedAt stamped; lead
  // stays on its original time. Request entry kept for audit (homeowner
  // + admin visibility); fresh requestReschedule replaces on future need.
  rejectReschedule: (leadId: string) => void
  removeProject: (id: string) => void
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      sentProjects: [],
      assignedRepByLead: {},
      leadStatusOverrides: {},
      cancellationRequestsByLead: {},
      rescheduleRequestsByLead: {},
      leadConfirmedAtByLead: {},
      repAssignedAtByLead: {},
      leadCompletedAtByLead: {},

      sendProject: (item, contractor, booking, homeowner, idDocument, homeownerId) => {
        set((state) => {
          // Ship #336 Phase A — snapshot priceLineItems from preset map
          // at write-time per banked feedback_immutable_ledger_freeze_at_write.
          // Snapshot vs lookup-at-render: locks the price-detail to the
          // preset-state-as-of-intake; future preset-map edits do NOT
          // retroactively rewrite this record.
          const presetLineItems = PRICE_LINE_ITEM_PRESETS[item.serviceId as keyof typeof PRICE_LINE_ITEM_PRESETS]
          const priceLineItemsSnapshot = presetLineItems
            ? presetLineItems.map((p) => ({ ...p }))
            : undefined
          const next: SentProject = {
            id: crypto.randomUUID(),
            item,
            status: 'pending',
            contractor,
            booking,
            idDocument,
            homeowner,
            homeowner_id: homeownerId,
            sentAt: new Date().toISOString(),
            ...(priceLineItemsSnapshot ? { priceLineItems: priceLineItemsSnapshot } : {}),
          }
          const nextSentProjects = [...state.sentProjects, next]
          // Ship #212 (Rodolfo-direct P0 diagnostic) — leads-empty arc.
          // Log write-side state so we can observe whether sendProject
          // actually fires + what contractor is stamped on the new
          // entry. VITE_DEMO_MODE-gated so prod builds skip.
          if ((import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false') {
            // eslint-disable-next-line no-console
            console.log('[#212 leads-diag] sendProject WRITE:', {
              newId: next.id,
              itemId: item.id,
              serviceName: item.serviceName,
              contractor_vendor_id: contractor.vendor_id,
              contractor_company: contractor.company,
              sentAt: next.sentAt,
              sentProjects_length_after: nextSentProjects.length,
            })
          }
          return { sentProjects: nextSentProjects }
        })
      },

      updateStatus: (id, status) => {
        set((state) => ({
          sentProjects: state.sentProjects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  status,
                  // Stamp confirmedAt on transition-to-approved. Overwrites
                  // on re-approval (reschedule→approved again = latest time).
                  ...(status === 'approved' ? { confirmedAt: new Date().toISOString() } : {}),
                }
              : p
          ),
        }))
      },

      updateBooking: (id, booking) => {
        set((state) => ({
          sentProjects: state.sentProjects.map((p) =>
            p.id === id ? { ...p, booking } : p
          ),
        }))
      },

      markSold: (id, saleAmount) => {
        // Ship #343 Phase A — auto-inject 'EXTRA $' line when newSaleAmount
        // exceeds sum-of-preset-originals so Pricing Breakdown total
        // matches sold-final per Rodolfo "auto populated to what the
        // vendor outputs". HIGHER-case-only this Phase A; LOWER-case
        // (newSaleAmount < sum-original) leaves Pricing Breakdown at
        // sum-of-originals as-is — TBD pending Rodolfo verdict on
        // discount-line vs leave-as-is vs block-entirely.
        //
        // Per banked rodolfo-vocabulary-preference-as-label-discipline:
        // exact-string label 'EXTRA $' + delta-amount per Rodolfo verbatim.
        //
        // Per banked new-feature-as-display-extension-not-flow-bypass:
        // existing #316 contract-upload + #313 admin-review enforcement
        // UNCHANGED. Auto-line is display + commission-source addition
        // (commission still = saleAmount × commission_pct; no canonical-
        // source divergence introduced).
        set((state) => ({
          sentProjects: state.sentProjects.map((p) => {
            if (p.id !== id) return p
            // Compute auto-adjustment delta from preset-source originals only.
            // vendor_edit + auto_sold_adjustment lines are excluded so re-marks
            // don't double-count prior adjustments.
            const presetSum = (p.priceLineItems ?? [])
              .filter((line) => (line.source ?? 'preset') === 'preset')
              .reduce((sum, line) => sum + (line.originalAmount ?? line.amount ?? 0), 0)
            // Strip prior auto_sold_adjustment lines so re-mark replaces
            // (not appends) the EXTRA $ line.
            const baseLines = (p.priceLineItems ?? []).filter(
              (line) => line.source !== 'auto_sold_adjustment',
            )
            const delta = saleAmount - presetSum
            const nextLineItems =
              delta > 0
                ? [
                    ...baseLines,
                    {
                      id: `auto-extra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      label: `Upsale`,
                      amount: delta,
                      originalAmount: 0,
                      source: 'auto_sold_adjustment' as const,
                    },
                  ]
                : baseLines
            return {
              ...p,
              status: 'sold' as const,
              soldAt: new Date().toISOString(),
              saleAmount,
              priceLineItems: nextLineItems,
            }
          }),
        }))
      },

      markCompleted: (id) => {
        set((state) => ({
          sentProjects: state.sentProjects.map((p) =>
            p.id === id ? { ...p, completedAt: new Date().toISOString() } : p
          ),
        }))
      },

      setLeadCompletedAt: (leadId, completedAt) => {
        set((state) => ({
          leadCompletedAtByLead: { ...state.leadCompletedAtByLead, [leadId]: completedAt },
        }))
      },

      setReviewStatus: (projectId, status, reviewedBy, reviewNote) => {
        set((state) => ({
          sentProjects: state.sentProjects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  reviewStatus: status,
                  reviewedAt: new Date().toISOString(),
                  reviewedBy,
                  ...(reviewNote ? { reviewNote } : {}),
                }
              : p
          ),
        }))
      },

      resetReviewStatus: (projectId) => {
        set((state) => ({
          sentProjects: state.sentProjects.map((p) =>
            p.id === projectId
              ? { ...p, reviewStatus: 'pending', reviewedAt: undefined, reviewedBy: undefined }
              : p
          ),
        }))
      },

      assignRep: (id, rep) => {
        set((state) => ({
          sentProjects: state.sentProjects.map((p) =>
            p.id === id ? { ...p, assignedRep: rep, repAssignedAt: new Date().toISOString() } : p
          ),
        }))
      },

      assignRepByLead: (leadId, rep) => {
        set((state) => ({
          assignedRepByLead: { ...state.assignedRepByLead, [leadId]: rep },
          repAssignedAtByLead: { ...state.repAssignedAtByLead, [leadId]: new Date().toISOString() },
        }))
      },

      setLeadStatus: (leadId, status) => {
        set((state) => ({
          leadStatusOverrides: { ...state.leadStatusOverrides, [leadId]: status },
          // Stamp confirmed-at only on transition-to-confirmed. Other status
          // flips (rejected / rescheduled / completed) leave the map alone.
          ...(status === 'confirmed'
            ? { leadConfirmedAtByLead: { ...state.leadConfirmedAtByLead, [leadId]: new Date().toISOString() } }
            : {}),
        }))
      },

      requestCancellation: (leadId, reason, explanation) => {
        set((state) => ({
          cancellationRequestsByLead: {
            ...state.cancellationRequestsByLead,
            [leadId]: {
              requestedAt: new Date().toISOString(),
              status: 'pending',
              ...(reason !== undefined && { reason }),
              ...(explanation !== undefined && { explanation }),
            },
          },
        }))
      },

      approveCancellation: (leadId) => {
        set((state) => {
          const prev = state.cancellationRequestsByLead[leadId]
          return {
            cancellationRequestsByLead: {
              ...state.cancellationRequestsByLead,
              [leadId]: {
                // Preserve the full prev entry so reason + explanation ride
                // through the state transition — apollo surfaced audit-trail
                // drop on approve/deny (msg 1776671343450). Only status flips.
                ...(prev ?? {}),
                requestedAt: prev?.requestedAt ?? new Date().toISOString(),
                status: 'approved',
              },
            },
            // Ship #171 — cancellation-approved now writes 'cancelled'
            // instead of reusing the 'rejected' bucket. Vendor-dashboard
            // isCancelledLead predicate still surfaces pre-#171 persisted
            // entries that sit at 'rejected' with an approved cancellation
            // request, so no migration of old data is required.
            leadStatusOverrides: { ...state.leadStatusOverrides, [leadId]: 'cancelled' },
          }
        })
      },

      denyCancellation: (leadId) => {
        set((state) => {
          const prev = state.cancellationRequestsByLead[leadId]
          return {
            cancellationRequestsByLead: {
              ...state.cancellationRequestsByLead,
              [leadId]: {
                // Preserve reason + explanation through the deny transition
                // (see approveCancellation above — same audit-trail fix).
                ...(prev ?? {}),
                requestedAt: prev?.requestedAt ?? new Date().toISOString(),
                status: 'denied',
              },
            },
          }
        })
      },

      removeProject: (id) => {
        set((state) => ({
          sentProjects: state.sentProjects.filter((p) => p.id !== id),
        }))
      },

      // Ship #191 — reschedule request (post-approval two-party).
      requestReschedule: (leadId, requestedBy, proposedDate, proposedTime, originalDate, originalTime, reason) =>
        set((state) => ({
          rescheduleRequestsByLead: {
            ...state.rescheduleRequestsByLead,
            [leadId]: {
              requestedBy,
              requestedAt: new Date().toISOString(),
              proposedDate,
              proposedTime,
              originalDate,
              originalTime,
              status: 'pending',
              ...(reason ? { reason } : {}),
            },
          },
        })),

      approveReschedule: (leadId) =>
        set((state) => {
          const prev = state.rescheduleRequestsByLead[leadId]
          if (!prev) return state
          // Ship #239 — approval atomically transitions the lead to
          // confirmed across BOTH shape-equivalent status stores:
          //   · leadStatusOverrides covers MOCK_LEADS entries
          //   · sentProjects.status covers homeowner-created flow
          // Unified with #239's drop of vendor-reschedule first-acceptance
          // optimization: pending leads that get approved via reschedule
          // must transition to confirmed as part of the approval. Confirmed
          // leads stay confirmed (idempotent map-write).
          return {
            rescheduleRequestsByLead: {
              ...state.rescheduleRequestsByLead,
              [leadId]: {
                ...prev,
                status: 'approved',
                resolvedAt: new Date().toISOString(),
              },
            },
            leadStatusOverrides: {
              ...state.leadStatusOverrides,
              [leadId]: 'confirmed',
            },
            sentProjects: state.sentProjects.map((p) =>
              `L-${p.id.slice(0, 4).toUpperCase()}` === leadId && p.status === 'pending'
                ? { ...p, status: 'approved' }
                : p
            ),
          }
        }),

      counterReschedule: (leadId, proposedDate, proposedTime, reason) =>
        set((state) => {
          const prev = state.rescheduleRequestsByLead[leadId]
          if (!prev) return state
          return {
            rescheduleRequestsByLead: {
              ...state.rescheduleRequestsByLead,
              [leadId]: {
                // Counter flips the proposer to the other party; clears
                // resolvedAt; resets status to pending on the other side.
                // originalDate/originalTime stay as the FIRST-proposed
                // slot so the thread of negotiation has a consistent
                // anchor.
                ...prev,
                requestedBy: prev.requestedBy === 'homeowner' ? 'vendor' : 'homeowner',
                proposedDate,
                proposedTime,
                requestedAt: new Date().toISOString(),
                status: 'pending',
                resolvedAt: undefined,
                ...(reason !== undefined ? { reason } : {}),
              },
            },
          }
        }),

      rejectReschedule: (leadId) =>
        set((state) => {
          const prev = state.rescheduleRequestsByLead[leadId]
          if (!prev) return state
          return {
            rescheduleRequestsByLead: {
              ...state.rescheduleRequestsByLead,
              [leadId]: {
                ...prev,
                status: 'rejected',
                resolvedAt: new Date().toISOString(),
              },
            },
          }
        }),
    }),
    {
      name: 'buildconnect-projects',
      // Hydration-race guard: default zustand-persist shallow-merge makes
      // persistedState override currentState entirely. If a sentProject gets
      // written (e.g. booking-confirmation.useEffect → sendProject) BEFORE
      // hydration commits, the hydration replaces currentState and the
      // just-written entry is lost. Explicit merge preserves currentState's
      // in-session writes + dedupes by id on merge back into the array. Same
      // defensive shape applied to the map fields (assignedRepByLead +
      // leadStatusOverrides). Ship #57 — Rod asymmetry (old sentProjects
      // persist, new ones vanish) via kratos msg 1776654848537 + 1776654936301.
      merge: (persistedState, currentState) => {
        const ps = (persistedState ?? {}) as Partial<ProjectsState>
        const persistedProjects = ps.sentProjects ?? []
        const currentProjects = currentState.sentProjects ?? []
        const seenIds = new Set<string>()
        const mergedProjects: SentProject[] = []
        for (const p of [...persistedProjects, ...currentProjects]) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id)
            mergedProjects.push(p)
          }
        }
        return {
          ...currentState,
          ...ps,
          sentProjects: mergedProjects,
          assignedRepByLead: { ...(ps.assignedRepByLead ?? {}), ...(currentState.assignedRepByLead ?? {}) },
          leadStatusOverrides: { ...(ps.leadStatusOverrides ?? {}), ...(currentState.leadStatusOverrides ?? {}) },
          cancellationRequestsByLead: { ...(ps.cancellationRequestsByLead ?? {}), ...(currentState.cancellationRequestsByLead ?? {}) },
          rescheduleRequestsByLead: { ...(ps.rescheduleRequestsByLead ?? {}), ...(currentState.rescheduleRequestsByLead ?? {}) },
          leadConfirmedAtByLead: { ...(ps.leadConfirmedAtByLead ?? {}), ...(currentState.leadConfirmedAtByLead ?? {}) },
          repAssignedAtByLead: { ...(ps.repAssignedAtByLead ?? {}), ...(currentState.repAssignedAtByLead ?? {}) },
        }
      },
    }
  )
)
