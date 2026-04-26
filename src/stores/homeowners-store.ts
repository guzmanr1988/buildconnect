import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getHomeowners } from '@/lib/api/homeowners'
import type { Profile } from '@/types'

// Ship #281 — admin-side homeowners list, populated from Supabase
// profiles where role=homeowner. Hydrated on admin/homeowners mount;
// persists for cross-tab + session-resume so first paint shows the
// last-known list while a fresh fetch backfills.
//
// Mirrors the admin-vendors+MOCK_VENDORS bridge shape so the same
// architecture applies when admin/vendors gets the Supabase wire-up
// (currently still inline MOCK_VENDORS — flagged as parallel
// follow-up in the #281 ship-ping).

interface HomeownersState {
  homeowners: Profile[]
  // Latched true after the first successful fetch so consumers can
  // distinguish "never fetched yet" from "fetched and got 0 rows."
  // Persisted so cross-tab nav doesn't re-flag as never-fetched.
  fetched: boolean
  // Last fetch error message (if any). Cleared on next successful
  // fetch. Consumers can display + retry.
  fetchError: string | null
  hydrate: () => Promise<void>
}

export const useHomeownersStore = create<HomeownersState>()(
  persist(
    (set) => ({
      homeowners: [],
      fetched: false,
      fetchError: null,
      hydrate: async () => {
        try {
          const homeowners = await getHomeowners()
          set({ homeowners, fetched: true, fetchError: null })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          set({ fetchError: message })
          // Don't clear homeowners on fetch fail — keep the last-known
          // list visible. Consumer falls back to inline HOMEOWNERS only
          // when fetched is false (never-loaded) or homeowners is empty.
        }
      },
    }),
    { name: 'buildconnect-homeowners' },
  ),
)
