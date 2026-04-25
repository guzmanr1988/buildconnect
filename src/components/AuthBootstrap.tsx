import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getProfile } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'
import { useCatalogStore } from '@/stores/catalog-store'

export function AuthBootstrap() {
  useEffect(() => {
    let mounted = true

    async function hydrate(userId: string, email: string, access_token: string) {
      // Ship #274 — diag telemetry on hydrate firings during the
      // payment-success window (TOKEN_REFRESHED / SIGNED_IN /
      // USER_UPDATED listener fires).
      const isDemoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
      const diagLog = (phase: string, extra: Record<string, unknown> = {}) => {
        if (!isDemoMode) return
        // eslint-disable-next-line no-console
        console.log('[#274 payment-stuck-diag]', phase, { t: Date.now(), ...extra })
      }
      diagLog('AuthBootstrap.hydrate:start', { userId, email })
      try {
        const profile = await getProfile(userId)
        diagLog('AuthBootstrap.hydrate:getProfile-success', { profile_role: profile.role })
        if (!mounted) {
          diagLog('AuthBootstrap.hydrate:returning-early (unmounted)')
          return
        }
        const store = useAuthStore.getState()
        store.setSession({ access_token, user: { id: userId, email } })
        // Preserve fields whose Supabase columns don't yet exist —
        // Tranche-2 work bridges the schema. Same merge-from-prior
        // pattern for each gap-class field. When the columns land in
        // Supabase, each merge below becomes a no-op.
        //
        // additional_addresses: Phase B3 column add (homeowner /profile)
        // noncircumvention_agreement_*: Phase 2 column add (#270 added
        //   to TS Profile interface; #273 fixes the wipe-loop where
        //   each AuthBootstrap.hydrate (SIGNED_IN / TOKEN_REFRESHED /
        //   USER_UPDATED) was overwriting the locally-signed agreement
        //   state with a server profile lacking those columns). Banked
        //   "Supabase column not yet migrated → preserve local value"
        //   idiom; sibling of additional_addresses workaround.
        const prior = store.profile
        const merged: typeof profile = { ...profile }
        if (!profile.additional_addresses && prior?.additional_addresses) {
          merged.additional_addresses = prior.additional_addresses
        }
        if (!profile.noncircumvention_agreement_signed_at && prior?.noncircumvention_agreement_signed_at) {
          merged.noncircumvention_agreement_signed_at = prior.noncircumvention_agreement_signed_at
          merged.noncircumvention_agreement_signed_name = prior.noncircumvention_agreement_signed_name
          merged.noncircumvention_agreement_version = prior.noncircumvention_agreement_version
          merged.noncircumvention_agreement_text_snapshot = prior.noncircumvention_agreement_text_snapshot
          merged.noncircumvention_agreement_signature_metadata = prior.noncircumvention_agreement_signature_metadata
        }
        store.setProfile(merged)
        diagLog('AuthBootstrap.hydrate:setProfile-called', { merged_role: merged.role })
        // Catalog is authed-read-only — pull fresh data now that the session is live.
        // Fire-and-forget: fetch failure is handled inside the store (keeps bundled
        // fallback and sets lastFetchError for surfaces that care).
        useCatalogStore.getState().hydrateFromServer()
      } catch (err) {
        diagLog('AuthBootstrap.hydrate:getProfile-FAILED', { error: String(err) })
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
      // Ship #274 — diag telemetry on every auth listener fire so we
      // can see if a TOKEN_REFRESHED / USER_UPDATED interrupts the
      // payment-success window.
      const isDemoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
      if (isDemoMode) {
        // eslint-disable-next-line no-console
        console.log('[#274 payment-stuck-diag]', 'AuthBootstrap.listener:fire', { t: Date.now(), event, has_session: !!session, user_id: session?.user?.id })
      }
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
