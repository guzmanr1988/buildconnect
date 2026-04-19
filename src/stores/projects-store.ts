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

interface ProjectsState {
  sentProjects: SentProject[]
  sendProject: (item: CartItem, contractor: ContractorInfo, booking: BookingInfo, homeowner?: HomeownerInfo, idDocument?: string) => void
  updateStatus: (id: string, status: SentProject['status']) => void
  updateBooking: (id: string, booking: BookingInfo) => void
  markSold: (id: string, saleAmount: number) => void
  assignRep: (id: string, rep: VendorRep) => void
  removeProject: (id: string) => void
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      sentProjects: [],

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
