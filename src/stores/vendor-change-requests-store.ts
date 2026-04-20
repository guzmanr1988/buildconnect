import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface VendorChangeRequest {
  id: string
  vendorId: string
  vendorCompany: string
  vendorName: string
  requestedChange: string
  status: 'pending' | 'approved' | 'denied'
  createdAt: string
  resolvedAt?: string
  adminNote?: string
}

interface VendorChangeRequestsState {
  requests: VendorChangeRequest[]
  createRequest: (
    vendorId: string,
    vendorCompany: string,
    vendorName: string,
    requestedChange: string,
  ) => void
  approveRequest: (id: string, adminNote?: string) => void
  denyRequest: (id: string, adminNote?: string) => void
}

// Vendor change-request store (ship Phase C per kratos msg 1776719583850).
// Vendors cannot self-edit; they submit a request with free-text description,
// admin mediates approval/denial + applies actual edits on approve via
// vendor-side data layer. Mock-side for v1; Tranche-2 moves this to Supabase
// with admin RLS + audit trail.
export const useVendorChangeRequestsStore = create<VendorChangeRequestsState>()(
  persist(
    (set) => ({
      requests: [],
      createRequest: (vendorId, vendorCompany, vendorName, requestedChange) => {
        set((state) => ({
          requests: [
            ...state.requests,
            {
              id: crypto.randomUUID(),
              vendorId,
              vendorCompany,
              vendorName,
              requestedChange,
              status: 'pending',
              createdAt: new Date().toISOString(),
            },
          ],
        }))
      },
      approveRequest: (id, adminNote) => {
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === id
              ? { ...r, status: 'approved', resolvedAt: new Date().toISOString(), adminNote }
              : r,
          ),
        }))
      },
      denyRequest: (id, adminNote) => {
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === id
              ? { ...r, status: 'denied', resolvedAt: new Date().toISOString(), adminNote }
              : r,
          ),
        }))
      },
    }),
    { name: 'buildconnect-vendor-change-requests' },
  ),
)
