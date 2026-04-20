import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem } from './cart-store'
import type { VendorRep } from '@/types'

export interface ContractorInfo {
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
}

type LeadStatusOverride = 'pending' | 'confirmed' | 'rejected' | 'rescheduled' | 'completed'

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
  sendProject: (item: CartItem, contractor: ContractorInfo, booking: BookingInfo, homeowner?: HomeownerInfo, idDocument?: string) => void
  updateStatus: (id: string, status: SentProject['status']) => void
  updateBooking: (id: string, booking: BookingInfo) => void
  markSold: (id: string, saleAmount: number) => void
  assignRep: (id: string, rep: VendorRep) => void
  // Assign a rep to a lead-id (mock-lead path; sentProject.assignedRep is
  // handled via assignRep).
  assignRepByLead: (leadId: string, rep: VendorRep) => void
  setLeadStatus: (leadId: string, status: LeadStatusOverride) => void
  removeProject: (id: string) => void
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      sentProjects: [],
      assignedRepByLead: {},
      leadStatusOverrides: {},

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
            p.id === id ? { ...p, status } : p
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
            p.id === id ? { ...p, assignedRep: rep } : p
          ),
        }))
      },

      assignRepByLead: (leadId, rep) => {
        set((state) => ({
          assignedRepByLead: { ...state.assignedRepByLead, [leadId]: rep },
        }))
      },

      setLeadStatus: (leadId, status) => {
        set((state) => ({
          leadStatusOverrides: { ...state.leadStatusOverrides, [leadId]: status },
        }))
      },

      removeProject: (id) => {
        set((state) => ({
          sentProjects: state.sentProjects.filter((p) => p.id !== id),
        }))
      },
    }),
    {
      name: 'buildconnect-projects',
    }
  )
)
