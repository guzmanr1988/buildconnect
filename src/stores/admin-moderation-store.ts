import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Admin moderation overrides sit alongside the static MOCK_HOMEOWNERS source.
// Suspending a homeowner from /admin/homeowners writes an override here; the
// list renders the effective status (override ?? static default). Mirrors the
// projects-store / cart-store pattern — client-persisted mock state until
// Tranche 2 wires the real lib/api/vendors.updateVendor call to Supabase.

type HomeownerStatus = 'active' | 'pending' | 'suspended'

// Ship #172 (task_1776719975617_951) — per-vendor profile-field overrides.
// Admin approves a vendor-change-request via the Approve dialog, types
// the new values into the data-edit form, and commits atomically: the
// approval marker goes to vendor-change-requests-store, the actual
// field values land here. Admin surfaces that render vendor display
// data (name / company / phone / address / email) should merge raw
// MOCK_VENDORS with this override to show the effective post-approval
// state. Same shape pattern as vendorCommissionOverrides above.
export type VendorProfileOverride = Partial<{
  name: string
  company: string
  phone: string
  address: string
  email: string
}>

interface AdminModerationState {
  homeownerStatusOverrides: Record<string, HomeownerStatus>
  // Per-vendor commission % override, persisted. When set, all admin surfaces
  // that read vendor.commission_pct must resolve through getVendorCommission
  // so revenue/reports/overview/banking stay in sync. Added ship #130 per
  // kratos msg 1776730432379 (Rodolfos admin-sets-vendor-commission-% ask).
  vendorCommissionOverrides: Record<string, number>
  vendorProfileOverrides: Record<string, VendorProfileOverride>
  suspendHomeowner: (id: string) => void
  reactivateHomeowner: (id: string) => void
  getHomeownerStatus: (id: string, defaultStatus: HomeownerStatus) => HomeownerStatus
  setVendorCommission: (id: string, pct: number) => void
  getVendorCommission: (id: string, defaultPct: number) => number
  clearVendorCommission: (id: string) => void
  // Merge a partial profile edit into the existing override for a vendor.
  // Empty / undefined fields are ignored so the admin form can submit only
  // the fields it touched without wiping previously-applied edits.
  applyVendorProfileEdit: (id: string, edits: VendorProfileOverride) => void
  getVendorProfileOverride: (id: string) => VendorProfileOverride
  clearOverride: (id: string) => void
}

export const useAdminModerationStore = create<AdminModerationState>()(
  persist(
    (set, get) => ({
      homeownerStatusOverrides: {},
      vendorCommissionOverrides: {},
      vendorProfileOverrides: {},

      suspendHomeowner: (id) =>
        set((state) => ({
          homeownerStatusOverrides: { ...state.homeownerStatusOverrides, [id]: 'suspended' },
        })),

      reactivateHomeowner: (id) =>
        set((state) => ({
          homeownerStatusOverrides: { ...state.homeownerStatusOverrides, [id]: 'active' },
        })),

      getHomeownerStatus: (id, defaultStatus) =>
        get().homeownerStatusOverrides[id] ?? defaultStatus,

      setVendorCommission: (id, pct) => {
        const clamped = Math.max(1, Math.min(50, Math.round(pct)))
        set((state) => ({
          vendorCommissionOverrides: { ...state.vendorCommissionOverrides, [id]: clamped },
        }))
      },

      getVendorCommission: (id, defaultPct) =>
        get().vendorCommissionOverrides[id] ?? defaultPct,

      clearVendorCommission: (id) =>
        set((state) => {
          const next = { ...state.vendorCommissionOverrides }
          delete next[id]
          return { vendorCommissionOverrides: next }
        }),

      applyVendorProfileEdit: (id, edits) =>
        set((state) => {
          // Drop empty / undefined / whitespace-only fields before merge
          // so the form can submit sparse patches without wiping priors.
          const filtered: VendorProfileOverride = {}
          for (const k of Object.keys(edits) as (keyof VendorProfileOverride)[]) {
            const v = edits[k]
            if (typeof v === 'string' && v.trim().length > 0) filtered[k] = v.trim()
          }
          if (Object.keys(filtered).length === 0) return state
          const prev = state.vendorProfileOverrides[id] ?? {}
          return {
            vendorProfileOverrides: {
              ...state.vendorProfileOverrides,
              [id]: { ...prev, ...filtered },
            },
          }
        }),

      getVendorProfileOverride: (id) =>
        get().vendorProfileOverrides[id] ?? {},

      clearOverride: (id) =>
        set((state) => {
          const next = { ...state.homeownerStatusOverrides }
          delete next[id]
          return { homeownerStatusOverrides: next }
        }),
    }),
    { name: 'buildconnect-admin-moderation' }
  )
)
