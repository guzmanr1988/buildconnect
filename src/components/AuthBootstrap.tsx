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
      if (event === 'SIGNED_OUT' || !session) {
        useAuthStore.getState().logout()
        return
      }
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
