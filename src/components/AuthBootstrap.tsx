import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getProfile } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'

export function AuthBootstrap() {
  useEffect(() => {
    let mounted = true

    async function hydrate(userId: string, email: string, access_token: string) {
      try {
        const profile = await getProfile(userId)
        if (!mounted) return
        const store = useAuthStore.getState()
        store.setSession({ access_token, user: { id: userId, email } })
        store.setProfile(profile)
      } catch (err) {
        console.error('[AuthBootstrap] getProfile failed:', err)
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const session = data.session
      if (session?.user) {
        hydrate(session.user.id, session.user.email ?? '', session.access_token)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      // IMPORTANT: the listener only clears *local* store state on sign-out —
      // it must NOT call store.logout() here, because store.logout() calls
      // supabase.auth.signOut() which re-fires SIGNED_OUT, creating an infinite
      // loop that freezes the main thread (crashed iOS Safari and headless
      // Chromium post-AuthBootstrap 1459789).
      if (event === 'SIGNED_OUT') {
        const store = useAuthStore.getState()
        store.setSession(null)
        store.setProfile(null)
        return
      }
      // INITIAL_SESSION with null session arrives on every page load for
      // unauthenticated users — treat as a no-op, not a sign-out.
      if (!session) return
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        hydrate(session.user.id, session.user.email ?? '', session.access_token)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return null
}
