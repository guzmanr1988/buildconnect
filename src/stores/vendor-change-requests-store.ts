import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

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
  hydrated: boolean
  hydrateVendor: (vendorId: string) => Promise<void>
  hydrateAdmin: () => Promise<void>
  createRequest: (
    vendorId: string,
    vendorCompany: string,
    vendorName: string,
    requestedChange: string,
  ) => Promise<void>
  approveRequest: (id: string, adminNote?: string) => Promise<void>
  denyRequest: (id: string, adminNote?: string) => Promise<void>
}

function rowToRequest(row: Record<string, unknown>): VendorChangeRequest {
  return {
    id: row.id as string,
    vendorId: row.vendor_id as string,
    vendorCompany: row.vendor_company as string,
    vendorName: row.vendor_name as string,
    requestedChange: row.requested_change as string,
    status: row.status as VendorChangeRequest['status'],
    createdAt: row.created_at as string,
    resolvedAt: row.resolved_at as string | undefined,
    adminNote: row.admin_note as string | undefined,
  }
}

export const useVendorChangeRequestsStore = create<VendorChangeRequestsState>()((set, get) => ({
  requests: [],
  hydrated: false,

  hydrateVendor: async (vendorId) => {
    if (get().hydrated) return
    const { data } = await supabase
      .from('vendor_change_requests')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
    if (data) {
      set({ requests: data.map(rowToRequest), hydrated: true })
    }
  },

  hydrateAdmin: async () => {
    if (get().hydrated) return
    const { data } = await supabase
      .from('vendor_change_requests')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) {
      set({ requests: data.map(rowToRequest), hydrated: true })
    }
  },

  createRequest: async (vendorId, vendorCompany, vendorName, requestedChange) => {
    const { data, error } = await supabase
      .from('vendor_change_requests')
      .insert({ vendor_id: vendorId, vendor_company: vendorCompany, vendor_name: vendorName, requested_change: requestedChange })
      .select()
      .single()
    if (error) throw error
    set((state) => ({ requests: [rowToRequest(data), ...state.requests] }))
  },

  approveRequest: async (id, adminNote) => {
    const { data: adminData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('vendor_change_requests')
      .update({
        status: 'approved',
        resolved_at: new Date().toISOString(),
        admin_note: adminNote ?? null,
        resolved_by_admin_id: adminData?.user?.id ?? null,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    set((state) => ({
      requests: state.requests.map((r) => r.id === id ? rowToRequest(data) : r),
    }))
  },

  denyRequest: async (id, adminNote) => {
    const { data: adminData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('vendor_change_requests')
      .update({
        status: 'denied',
        resolved_at: new Date().toISOString(),
        admin_note: adminNote ?? null,
        resolved_by_admin_id: adminData?.user?.id ?? null,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    set((state) => ({
      requests: state.requests.map((r) => r.id === id ? rowToRequest(data) : r),
    }))
  },
}))
