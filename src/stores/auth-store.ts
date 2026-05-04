import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/types'

interface AuthState {
  session: { access_token: string; user: { id: string; email: string } } | null
  profile: Profile | null
  isAuthenticated: boolean
  role: UserRole | null
  setSession: (session: AuthState['session']) => void
  setProfile: (profile: Profile | null) => void
  // Partial-patch the current profile. Updates Zustand state immediately
  // (optimistic) then writes to Supabase profiles table for real-auth users.
  // QA persona sessions skip Supabase (synthetic token, no DB row).
  updateProfile: (patch: Partial<Profile>) => Promise<void>
  // Clear local zustand state only — no supabase call. AuthBootstrap's
  // onAuthStateChange listener invokes this on SIGNED_OUT. Calling
  // supabase.auth.signOut() from here would re-fire SIGNED_OUT and loop,
  // freezing the main thread (iOS Safari / headless Chromium crash, 2026-04-18).
  clearLocalSession: () => void
  // User-initiated sign-out entry. Calls supabase.auth.signOut() and clears
  // local state for immediate UI feedback. The listener then receives SIGNED_OUT
  // and re-runs clearLocalSession (idempotent, not a loop).
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      profile: null,
      isAuthenticated: false,
      role: null,
      setSession: (session) =>
        set({ session, isAuthenticated: !!session }),
      setProfile: (profile) =>
        set({ profile, role: profile?.role ?? null }),
      updateProfile: async (patch) => {
        // Optimistic local update first.
        set((state) => ({
          profile: state.profile ? { ...state.profile, ...patch } : state.profile,
        }))
        // Skip Supabase for QA persona sessions (synthetic token, no DB row).
        const isQa = typeof window !== 'undefined'
          && !!localStorage.getItem('buildconnect-qa-persona-active')
        if (isQa) return
        const profileId = useAuthStore.getState().profile?.id
        if (!profileId) return
        // Filter to columns that exist in the profiles table.
        const PROFILE_DB_COLUMNS = new Set([
          'name', 'phone', 'address', 'company', 'avatar_color', 'initials', 'status',
          'avatar_url', 'additional_addresses', 'contractor_licenses',
          'noncircumvention_agreement_signed_at', 'noncircumvention_agreement_signed_name',
          'noncircumvention_agreement_version', 'noncircumvention_agreement_text_snapshot',
          'noncircumvention_agreement_signature_metadata',
          'account_rep_for_vendor_id',
        ])
        const dbPatch = Object.fromEntries(
          Object.entries(patch).filter(([k]) => PROFILE_DB_COLUMNS.has(k)),
        )
        if (Object.keys(dbPatch).length === 0) return
        await supabase.from('profiles').update(dbPatch).eq('id', profileId)
      },
      clearLocalSession: () =>
        set({ session: null, profile: null, isAuthenticated: false, role: null }),
      logout: () => {
        // Ship #210 (Rodolfo-direct pivot #28): detect QA persona active
        // state first. QA personas have a synthetic access_token that
        // Supabase can't validate — calling signOut against it can hang
        // or timeout waiting for server-side validation, producing the
        // "stays thinking after I log out" symptom. When QA is active,
        // just clear the flag + in-memory state; no Supabase call needed
        // because there's no real session to terminate.
        const hadQa = typeof window !== 'undefined'
          && !!localStorage.getItem('buildconnect-qa-persona-active')
        if (hadQa) {
          localStorage.removeItem('buildconnect-qa-persona-active')
        } else {
          supabase.auth.signOut().catch((err) => {
            console.error('[auth-store] supabase signOut failed:', err)
          })
        }
        set({ session: null, profile: null, isAuthenticated: false, role: null })
      },
    }),
    { name: 'buildconnect-auth' }
  )
)
