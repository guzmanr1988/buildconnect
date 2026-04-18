import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem } from './cart-store'

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
}

interface ProjectsState {
  sentProjects: SentProject[]
  sendProject: (item: CartItem, contractor: ContractorInfo, booking: BookingInfo, homeowner?: HomeownerInfo, idDocument?: string) => void
  updateStatus: (id: string, status: SentProject['status']) => void
  updateBooking: (id: string, booking: BookingInfo) => void
  markSold: (id: string, saleAmount: number) => void
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
