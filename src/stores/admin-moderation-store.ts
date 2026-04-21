import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Admin moderation overrides sit alongside the static MOCK_HOMEOWNERS source.
// Suspending a homeowner from /admin/homeowners writes an override here; the
// list renders the effective status (override ?? static default). Mirrors the
// projects-store / cart-store pattern — client-persisted mock state until
// Tranche 2 wires the real lib/api/vendors.updateVendor call to Supabase.

type HomeownerStatus = 'active' | 'pending' | 'suspended'

interface AdminModerationState {
  homeownerStatusOverrides: Record<string, HomeownerStatus>
  // Per-vendor commission % override, persisted. When set, all admin surfaces
  // that read vendor.commission_pct must resolve through getVendorCommission
  // so revenue/reports/overview/banking stay in sync. Added ship #130 per
  // kratos msg 1776730432379 (Rodolfos admin-sets-vendor-commission-% ask).
  vendorCommissionOverrides: Record<string, number>
  suspendHomeowner: (id: string) => void
  reactivateHomeowner: (id: string) => void
  getHomeownerStatus: (id: string, defaultStatus: HomeownerStatus) => HomeownerStatus
  setVendorCommission: (id: string, pct: number) => void
  getVendorCommission: (id: string, defaultPct: number) => number
  clearVendorCommission: (id: string) => void
  clearOverride: (id: string) => void
}

export const useAdminModerationStore = create<AdminModerationState>()(
  persist(
    (set, get) => ({
      homeownerStatusOverrides: {},
      vendorCommissionOverrides: {},

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
