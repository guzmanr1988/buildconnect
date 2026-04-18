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
      clearLocalSession: () =>
        set({ session: null, profile: null, isAuthenticated: false, role: null }),
      logout: () => {
        supabase.auth.signOut().catch((err) => {
          console.error('[auth-store] supabase signOut failed:', err)
        })
        set({ session: null, profile: null, isAuthenticated: false, role: null })
      },
    }),
    { name: 'buildconnect-auth' }
  )
)
