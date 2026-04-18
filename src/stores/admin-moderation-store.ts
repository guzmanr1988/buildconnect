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
  suspendHomeowner: (id: string) => void
  reactivateHomeowner: (id: string) => void
  getHomeownerStatus: (id: string, defaultStatus: HomeownerStatus) => HomeownerStatus
  clearOverride: (id: string) => void
}

export const useAdminModerationStore = create<AdminModerationState>()(
  persist(
    (set, get) => ({
      homeownerStatusOverrides: {},

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
