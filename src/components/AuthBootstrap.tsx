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
        // Preserve additional_addresses during Tranche-2: the Supabase profiles
        // table has no column for them yet (Phase B3 work), so a clean
        // setProfile(fetched) would wipe any addresses the homeowner added in
        // /profile. Merge the local value from the current zustand profile if
        // the fetched profile doesn't carry its own. Once B3 lands, the column
        // becomes authoritative and this merge is a no-op.
        const prior = store.profile
        if (!profile.additional_addresses && prior?.additional_addresses) {
          store.setProfile({ ...profile, additional_addresses: prior.additional_addresses })
        } else {
          store.setProfile(profile)
        }
        // Catalog is authed-read-only — pull fresh data now that the session is live.
        // Fire-and-forget: fetch failure is handled inside the store (keeps bundled
        // fallback and sets lastFetchError for surfaces that care).
        useCatalogStore.getState().hydrateFromServer()
      } catch (err) {
        console.error('[AuthBootstrap] getProfile failed:', err)
      }
    }

    // QA persona bypass: when a QA persona is active (VITE_DEMO_MODE +
    // explicit user-click on the switcher), Supabase session hydration
    // would clobber the persona's seeded profile with the prior Supabase
    // identity (if the Supabase session is still live — apollo sweep
    // 2026-04-20 via kratos msg 1776665548710: paradise-demo Supabase
    // session + Ana persona apply → vendor dashboard rendered Ana name
    // because Supabase session wasn't terminated). Skip Supabase hydrate
    // entirely in QA mode; the persona seed IS the session of record.
    //
    // Ship #167: flag is read INSIDE each async callback, not snapshotted
    // at effect mount. AuthBootstrap's useEffect has [] deps and never
    // re-runs — a mount-time snapshot froze the flag value forever, so
    // any persona switch via SPA nav (router.navigate) on a mount-snapshot
    // of `false` was ignored by the hydrate callback. Reading at
    // call-time picks up the live value. (See #103/#104 regression.)
    const isQaPersonaActive = () =>
      typeof window !== 'undefined' &&
      !!localStorage.getItem('buildconnect-qa-persona-active')

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (isQaPersonaActive()) return
      const session = data.session
      if (session?.user) {
        hydrate(session.user.id, session.user.email ?? '', session.access_token)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      // QA persona bypass on listener too — prevents a late Supabase
      // SIGNED_IN / TOKEN_REFRESHED event from overwriting persona state.
      if (isQaPersonaActive()) return
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
