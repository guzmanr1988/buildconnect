import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  // Optional link to a lead/sentProject for rep-scope filtering
  leadId?: string
  // Structured link — set when combobox used; absent on legacy permits (use projectName)
  linkedEntity?: LinkedPermitEntity
  permitType: string
  permitNumber: string
  status: PermitStatus
  issueDate?: string
  expirationDate?: string
  jurisdiction: string
  notes?: string
  // Placeholder — actual upload wired in Tranche-2
  documentNames?: string[]
  createdAt: string
}

interface VendorPermitsState {
  permits: VendorPermit[]
  addPermit: (permit: Omit<VendorPermit, 'id' | 'createdAt'>) => void
  updatePermit: (id: string, patch: Partial<Omit<VendorPermit, 'id' | 'createdAt'>>) => void
  deletePermit: (id: string) => void
}

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

export const useVendorPermitsStore = create<VendorPermitsState>()(
  persist(
    (set) => ({
      permits: SEED_PERMITS,
      addPermit: (permit) => {
        const entry: VendorPermit = {
          ...permit,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ permits: [entry, ...s.permits] }))
      },
      updatePermit: (id, patch) => {
        set((s) => ({
          permits: s.permits.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }))
      },
      deletePermit: (id) => {
        set((s) => ({ permits: s.permits.filter((p) => p.id !== id) }))
      },
    }),
    {
      name: 'buildconnect-vendor-permits',
      merge: (persisted: unknown, current) => {
        const p = persisted as Partial<VendorPermitsState>
        // If no persisted permits, seed with defaults
        if (!p?.permits?.length) return current
        return { ...current, permits: p.permits }
      },
    },
  ),
)
