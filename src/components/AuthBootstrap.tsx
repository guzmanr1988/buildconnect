import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getProfile } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'
import { useCatalogStore } from '@/stores/catalog-store'

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
        // Catalog is authed-read-only — pull fresh data now that the session is live.
        // Fire-and-forget: fetch failure is handled inside the store (keeps bundled
        // fallback and sets lastFetchError for surfaces that care).
        useCatalogStore.getState().hydrateFromServer()
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
      // Listener uses clearLocalSession — NEVER store.logout() — because
      // logout() calls supabase.auth.signOut() which re-fires SIGNED_OUT and
      // loops, freezing the main thread (iOS Safari / headless Chromium crash
      // post-AuthBootstrap 1459789).
      if (event === 'SIGNED_OUT') {
        useAuthStore.getState().clearLocalSession()
        // Reset catalog to bundled fallback so a subsequent unauthed load
        // doesn't show stale server data from the previous session.
        useCatalogStore.getState().resetToBundled()
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
