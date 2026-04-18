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
      logout: () => {
        // Fire-and-forget supabase sign-out; the onAuthStateChange listener in
        // AuthBootstrap will also clear state on SIGNED_OUT (idempotent).
        supabase.auth.signOut().catch((err) => {
          console.error('[auth-store] supabase signOut failed:', err)
        })
        set({ session: null, profile: null, isAuthenticated: false, role: null })
      },
    }),
    { name: 'buildconnect-auth' }
  )
)
