import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export type PermitStatus = 'pending' | 'approved' | 'expired' | 'rejected'

export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  expired: 'Expired',
  rejected: 'Rejected',
}

export const PERMIT_TYPE_OPTIONS = [
  'Building',
  'Roofing',
  'Electrical',
  'Plumbing',
  'Pool',
  'HVAC',
  'Driveway',
  'Structural',
  'Other',
]

export interface LinkedPermitEntity {
  type: 'project' | 'homeowner'
  id: string
  name: string
}

export interface VendorPermit {
  id: string
  vendorId: string
  projectName: string
  leadId?: string
  linkedEntity?: LinkedPermitEntity
  permitType: string
  permitNumber: string
  status: PermitStatus
  issueDate?: string
  expirationDate?: string
  jurisdiction: string
  notes?: string
  documentNames?: string[]
  createdAt: string
}

// Mirrors vendor-employees-store: non-UUID vendor IDs (v-1/v-2/v-3 demos,
// ad-hoc walker fixtures) stay in-memory — no Supabase round-trip.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isLocalVendorId = (id: string) => !UUID_RE.test(id)

const SEED_PERMITS: VendorPermit[] = [
  {
    id: 'permit-seed-1',
    vendorId: 'v-1',
    projectName: 'Roof Replacement',
    leadId: 'l-1',
    permitType: 'Roofing',
    permitNumber: 'MDC-2025-R-04412',
    status: 'approved',
    issueDate: '2025-03-10',
    expirationDate: '2026-03-10',
    jurisdiction: 'Miami-Dade County',
    notes: 'Full tear-off + shingle replacement. Inspection passed 2025-03-18.',
    createdAt: '2025-03-05T09:00:00Z',
  },
  {
    id: 'permit-seed-2',
    vendorId: 'v-1',
    projectName: 'Solar Panel Installation',
    leadId: 'l-2',
    permitType: 'Electrical',
    permitNumber: 'MDC-2025-E-07831',
    status: 'approved',
    issueDate: '2025-06-15',
    expirationDate: '2026-06-15',
    jurisdiction: 'Miami-Dade County',
    notes: '12-panel system. FPL interconnect approved.',
    createdAt: '2025-06-01T10:00:00Z',
  },
  {
    id: 'permit-seed-3',
    vendorId: 'v-1',
    projectName: 'Impact Window Upgrade',
    leadId: 'l-3',
    permitType: 'Building',
    permitNumber: 'MDC-2026-B-01190',
    status: 'pending',
    issueDate: undefined,
    expirationDate: undefined,
    jurisdiction: 'City of Miami',
    notes: 'Submitted 2026-04-02. Awaiting review.',
    createdAt: '2026-04-02T08:30:00Z',
  },
]

function rowToPermit(row: Record<string, unknown>): VendorPermit {
  return {
    id: row.id as string,
    vendorId: row.vendor_id as string,
    projectName: row.project_name as string,
    leadId: (row.lead_id as string) ?? undefined,
    linkedEntity: (row.linked_entity as LinkedPermitEntity) ?? undefined,
    permitType: row.permit_type as string,
    permitNumber: row.permit_number as string,
    status: row.status as PermitStatus,
    issueDate: (row.issue_date as string) ?? undefined,
    expirationDate: (row.expiration_date as string) ?? undefined,
    jurisdiction: row.jurisdiction as string,
    notes: (row.notes as string) ?? undefined,
    documentNames: (row.document_names as string[]) ?? [],
    createdAt: row.created_at as string,
  }
}

function permitToRow(p: Omit<VendorPermit, 'id' | 'createdAt'>) {
  return {
    vendor_id: p.vendorId,
    project_name: p.projectName,
    lead_id: p.leadId ?? null,
    linked_entity: p.linkedEntity ?? null,
    permit_type: p.permitType,
    permit_number: p.permitNumber,
    status: p.status,
    issue_date: p.issueDate ?? null,
    expiration_date: p.expirationDate ?? null,
    jurisdiction: p.jurisdiction,
    notes: p.notes ?? null,
    document_names: p.documentNames ?? [],
  }
}

interface VendorPermitsState {
  permits: VendorPermit[]
  hydratedVendors: Set<string>
  hydrate: (vendorId: string) => Promise<void>
  addPermit: (permit: Omit<VendorPermit, 'id' | 'createdAt'>) => Promise<void>
  updatePermit: (id: string, patch: Partial<Omit<VendorPermit, 'id' | 'createdAt'>>) => Promise<void>
  deletePermit: (id: string) => Promise<void>
}

export const useVendorPermitsStore = create<VendorPermitsState>()((set, get) => ({
  permits: SEED_PERMITS,
  hydratedVendors: new Set(),

  hydrate: async (vendorId) => {
    if (isLocalVendorId(vendorId)) return
    if (get().hydratedVendors.has(vendorId)) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    const { data } = await supabase
      .from('vendor_permits')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
    if (!data) return
    set((state) => ({
      permits: [
        ...state.permits.filter((p) => p.vendorId !== vendorId),
        ...data.map(rowToPermit),
      ],
      hydratedVendors: new Set([...state.hydratedVendors, vendorId]),
    }))
  },

  addPermit: async (permit) => {
    if (isLocalVendorId(permit.vendorId)) {
      const entry: VendorPermit = {
        ...permit,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }
      set((s) => ({ permits: [entry, ...s.permits] }))
      return
    }
    const { data, error } = await supabase
      .from('vendor_permits')
      .insert(permitToRow(permit))
      .select()
      .single()
    if (error) throw error
    const entry = rowToPermit(data)
    set((s) => ({ permits: [entry, ...s.permits] }))
  },

  updatePermit: async (id, patch) => {
    const current = get().permits.find((p) => p.id === id)
    if (!current) return
    if (isLocalVendorId(current.vendorId)) {
      set((s) => ({
        permits: s.permits.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }))
      return
    }
    const merged = { ...current, ...patch }
    const { data, error } = await supabase
      .from('vendor_permits')
      .update(permitToRow(merged))
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    set((s) => ({
      permits: s.permits.map((p) => (p.id === id ? rowToPermit(data) : p)),
    }))
  },

  deletePermit: async (id) => {
    const current = get().permits.find((p) => p.id === id)
    if (!current) {
      set((s) => ({ permits: s.permits.filter((p) => p.id !== id) }))
      return
    }
    if (isLocalVendorId(current.vendorId)) {
      set((s) => ({ permits: s.permits.filter((p) => p.id !== id) }))
      return
    }
    const { error } = await supabase.from('vendor_permits').delete().eq('id', id)
    if (error) throw error
    set((s) => ({ permits: s.permits.filter((p) => p.id !== id) }))
  },
}))
