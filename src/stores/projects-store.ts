import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem } from './cart-store'
import type { VendorRep } from '@/types'

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
  sentAt: string
  soldAt?: string
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
}

type LeadStatusOverride = 'pending' | 'confirmed' | 'rejected' | 'rescheduled' | 'completed'

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
  sendProject: (item: CartItem, contractor: ContractorInfo, booking: BookingInfo, homeowner?: HomeownerInfo, idDocument?: string) => void
  updateStatus: (id: string, status: SentProject['status']) => void
  updateBooking: (id: string, booking: BookingInfo) => void
  markSold: (id: string, saleAmount: number) => void
  assignRep: (id: string, rep: VendorRep) => void
  // Assign a rep to a lead-id (mock-lead path; sentProject.assignedRep is
  // handled via assignRep).
  assignRepByLead: (leadId: string, rep: VendorRep) => void
  setLeadStatus: (leadId: string, status: LeadStatusOverride) => void
  requestCancellation: (leadId: string, reason?: string, explanation?: string) => void
  approveCancellation: (leadId: string) => void
  denyCancellation: (leadId: string) => void
  removeProject: (id: string) => void
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      sentProjects: [],
      assignedRepByLead: {},
      leadStatusOverrides: {},
      cancellationRequestsByLead: {},
      leadConfirmedAtByLead: {},
      repAssignedAtByLead: {},

      sendProject: (item, contractor, booking, homeowner, idDocument) => {
        set((state) => ({
          sentProjects: [
            ...state.sentProjects,
            {
              id: crypto.randomUUID(),
              item,
              status: 'pending',
              contractor,
              booking,
              idDocument,
              homeowner,
              sentAt: new Date().toISOString(),
            },
          ],
        }))
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
        set((state) => ({
          sentProjects: state.sentProjects.map((p) =>
            p.id === id ? { ...p, status: 'sold', soldAt: new Date().toISOString(), saleAmount } : p
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
            // Cancellation-approved = lifecycle cancelled = reuses rejected
            // bucket. Tranche-2 will diverge.
            leadStatusOverrides: { ...state.leadStatusOverrides, [leadId]: 'rejected' },
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
          leadConfirmedAtByLead: { ...(ps.leadConfirmedAtByLead ?? {}), ...(currentState.leadConfirmedAtByLead ?? {}) },
          repAssignedAtByLead: { ...(ps.repAssignedAtByLead ?? {}), ...(currentState.repAssignedAtByLead ?? {}) },
        }
      },
    }
  )
)
