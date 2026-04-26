import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getVendors } from '@/lib/api/vendors'
import type { Vendor } from '@/types'

// Ship #282 — admin-side vendors list, populated from Supabase
// profiles where role=vendor. Mirror of homeowners-store from #281.
// Hydrated on admin/vendors mount; persists for cross-tab + session-
// resume so first paint shows the last-known list while a fresh fetch
// backfills.
//
// Fetch-fail behavior matches #281: keep last-known homeowners
// visible, log fetchError; consumer falls back to inline MOCK_VENDORS
// only when fetched is false (never-loaded) or store list is empty.
// Real-mode signups now propagate to admin/vendors via the Supabase
// profiles INSERT trigger + next page mount / cross-tab rehydrate.

interface VendorsState {
  vendors: Vendor[]
  // Latched true after the first successful fetch so consumers can
  // distinguish "never fetched yet" from "fetched and got 0 rows."
  fetched: boolean
  fetchError: string | null
  hydrate: () => Promise<void>
}

export const useVendorsStore = create<VendorsState>()(
  persist(
    (set) => ({
      vendors: [],
      fetched: false,
      fetchError: null,
      hydrate: async () => {
        try {
          const vendors = await getVendors()
          set({ vendors, fetched: true, fetchError: null })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          set({ fetchError: message })
          // Don't clear vendors on fetch fail — keep last-known list.
        }
      },
    }),
    { name: 'buildconnect-vendors' },
  ),
)
