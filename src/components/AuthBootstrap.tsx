import { useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getProfile, getProfileLite, getProfileBloat } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'
import { useCatalogStore } from '@/stores/catalog-store'
import { useVendorCatalogStore } from '@/stores/vendor-catalog-store'
import { useProjectsStore } from '@/stores/projects-store'
import type { Profile } from '@/types'

// PR-254 (Rod-direct 2026-05-17) — getProfile timeout ceiling. Apollo
// PoP-walker measured ~17s on the getProfile fetch alone during the CF
// edge-pinning window. Ship-275 already setSession FIRST so a getProfile
// failure leaves the user authed (profile may be stale-persisted but
// nav unblocks); this just bounds the wait so the diag log + toast
// fire instead of the listener silently sitting on a pending promise.
const GET_PROFILE_TIMEOUT_MS = 10_000

// Draft #475 latency profile — feature flag. When true, AuthBootstrap
// hydrate uses getProfileLite() (excludes id_document_url, NCA snapshot,
// contractor_licenses) on the critical login → navigate path, then
// background-fires getProfileBloat() to merge the heavy columns in. When
// false, falls back to legacy getProfile('*'). Default ON; can be flipped
// to false via VITE_LOGIN_LITE_PROFILE=false for emergency rollback
// without redeploy if a downstream consumer reads bloat-cols on first
// paint (Rod-go review surface).
const LITE_PROFILE_ENABLED = (import.meta.env.VITE_LOGIN_LITE_PROFILE ?? 'true') !== 'false'

// Cheap perf telemetry — performance.mark/measure on the login critical
// path so future profiling has falsifiable in-browser timings (vs Apollo
// PoP-walker which measures from outside the page). Marks namespaced
// 'bc-login-*' so devtools Performance panel + RUM can filter cleanly.
function perfMark(name: string) {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return
  try { performance.mark(`bc-login-${name}`) } catch { /* noop */ }
}
function perfMeasure(name: string, from: string, to: string) {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return
  try { performance.measure(`bc-login-${name}`, `bc-login-${from}`, `bc-login-${to}`) } catch { /* noop */ }
}

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
      perfMark('hydrate-start')
      diagLog('AuthBootstrap.hydrate:start', { userId, email })
      // Ship #275 — defensive: setSession FIRST so isAuthenticated
      // flips true regardless of whether getProfile succeeds. Pre-#275
      // order was setSession AFTER getProfile, so any getProfile throw
      // (RLS regression / network blip / table-shape change) left
      // isAuthenticated=false and the redirect useEffect blocked
      // forever — visible as "stuck loading" post-payment. Now the
      // worst case on getProfile failure is profile=null but auth=true,
      // so navigation can proceed with whatever local profile was
      // already in place (zustand persist).
      if (!mounted) {
        diagLog('AuthBootstrap.hydrate:returning-early-pre-fetch (unmounted)')
        return
      }
      const store = useAuthStore.getState()
      store.setSession({ access_token, user: { id: userId, email } })
      diagLog('AuthBootstrap.hydrate:setSession-called (defensive, pre-getProfile)')
      try {
        perfMark('getProfile-start')
        const profile = LITE_PROFILE_ENABLED
          ? (await Promise.race([
              getProfileLite(userId),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error('getProfile timed out after 10s')),
                  GET_PROFILE_TIMEOUT_MS,
                ),
              ),
            ])) as Profile
          : await Promise.race([
              getProfile(userId),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error('getProfile timed out after 10s')),
                  GET_PROFILE_TIMEOUT_MS,
                ),
              ),
            ])
        perfMark('getProfile-end')
        perfMeasure('getProfile', 'getProfile-start', 'getProfile-end')
        diagLog('AuthBootstrap.hydrate:getProfile-success', { profile_role: profile.role, lite: LITE_PROFILE_ENABLED })
        if (!mounted) {
          diagLog('AuthBootstrap.hydrate:returning-early (unmounted)')
          return
        }
        // setSession already called pre-getProfile (#275 defensive
        // ordering). Don't re-call here; just merge + setProfile.
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
        perfMark('setProfile-done')
        perfMeasure('getProfile-to-setProfile', 'getProfile-end', 'setProfile-done')
        diagLog('AuthBootstrap.hydrate:setProfile-called', { merged_role: merged.role, lite: LITE_PROFILE_ENABLED })

        // Draft #475 — background bloat-column merge. The slim path above
        // returns role + identity fast for navigate; this fills the heavy
        // columns (id_document_url, NCA snapshot, contractor_licenses) after
        // the user has already landed on their destination. Fire-and-forget;
        // failure leaves the bloat fields undefined (consumers already
        // tolerate this — partialize in auth-store has stripped them for
        // months per PR #197).
        if (LITE_PROFILE_ENABLED) {
          void (async () => {
            try {
              perfMark('bloat-start')
              const bloat = await getProfileBloat(userId)
              perfMark('bloat-end')
              perfMeasure('bloat-fetch', 'bloat-start', 'bloat-end')
              if (!mounted) return
              const current = useAuthStore.getState().profile
              if (!current || current.id !== userId) return
              useAuthStore.getState().setProfile({ ...current, ...bloat })
              diagLog('AuthBootstrap.hydrate:bloat-merged')
            } catch (err) {
              // Silent — bloat is non-critical-path. Surfaces that need a
              // bloat column re-fetch it on-demand.
              diagLog('AuthBootstrap.hydrate:bloat-FAILED', { error: String(err) })
            }
          })()
        }

        // Catalog is authed-read-only — pull fresh data now that the session is live.
        // Fire-and-forget: fetch failure is handled inside the store (keeps bundled
        // fallback and sets lastFetchError for surfaces that care).
        useCatalogStore.getState().hydrateFromServer()
        // Vendor catalog pricing: sync from Supabase so the vendor's prices
        // are canonical from DB, not localStorage-only. Fire-and-forget;
        // errors logged inside the store.
        if (merged.role === 'vendor') {
          // pin-20 — defense-in-depth: nuke the legacy demo-alias LS flag
          // on every vendor hydrate so any residual key from a pre-pin-20
          // session can't survive into the real-identity path. vendor-
          // scope.ts no longer reads this key (the override branch was
          // removed) — this is belt-and-suspenders cleanup so the flag
          // doesn't sit in storage forever as a forensic foot-gun.
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('buildconnect-demo-mock-vendor-id')
          }
          useVendorCatalogStore.getState().hydrateFromSupabase(userId)
        }
        // Surface-2: wire projects to Supabase for all authed roles.
        useProjectsStore.getState().hydrateFromSupabase(userId, merged.role as 'homeowner' | 'vendor' | 'account_rep' | 'admin')
      } catch (err) {
        diagLog('AuthBootstrap.hydrate:getProfile-FAILED', { error: String(err) })
        console.error('[AuthBootstrap] getProfile failed:', err)
        // PR-254 — surface slow-profile to the user but keep session set
        // (Ship-275 already called setSession pre-getProfile, so nav can
        // proceed against any zustand-persisted profile from a prior load).
        const message = err instanceof Error && err.message.includes('timed out')
          ? 'Loading profile is slow. Try refreshing if this persists.'
          : null
        // Stable id dedupes concurrent fires: both the getSession().then()
        // bootstrap path and the onAuthStateChange SIGNED_IN listener call
        // hydrate() on page load, so a slow getProfile times out on BOTH and
        // each catch fires this toast → two stacked identical toasts. Sonner
        // collapses same-id toasts into one.
        if (message) toast.error(message, { id: 'profile-slow' })
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

    // Lane-4 RED-003 — defense-in-depth profile re-fetch on tab refocus.
    // Supabase fires SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED on
    // session-lifecycle events, but a direct `profiles.role` UPDATE from
    // /admin/users (or a SQL grant/revoke) does NOT trigger any auth
    // event — the FE auth-store keeps the stale role until the next
    // token refresh (~1hr). PR-318 RequireRole and PR-319 dialog owner-
    // checks ARE only as good as the cached profile.role they read, so
    // this revalidates on visibilitychange + focus (user returns to the
    // tab → fresh profile within 1 page-nav). Lightweight: getProfile-
    // only path, no catalog/projects re-hydrate.
    let lastRefetchAt = 0
    const PROFILE_REFETCH_DEBOUNCE_MS = 5_000
    async function refetchProfileIfStale() {
      if (!mounted) return
      if (isQaPersonaActive()) return
      const now = Date.now()
      if (now - lastRefetchAt < PROFILE_REFETCH_DEBOUNCE_MS) return
      lastRefetchAt = now
      const state = useAuthStore.getState()
      const sessionUserId = state.session?.user?.id
      if (!sessionUserId) return
      try {
        const profile = await Promise.race([
          getProfile(sessionUserId),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('getProfile timed out after 10s')),
              GET_PROFILE_TIMEOUT_MS,
            ),
          ),
        ])
        if (!mounted) return
        const prior = useAuthStore.getState().profile
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
        useAuthStore.getState().setProfile(merged)
      } catch (err) {
        // Silent — stale profile remains; next token-refresh hydrate will retry.
        console.error('[AuthBootstrap] refetchProfileIfStale failed:', err)
      }
    }
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refetchProfileIfStale()
      }
    }
    const onFocus = () => { void refetchProfileIfStale() }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus)
    }

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
        // Arc-32 W3 follow-up — clear vendor-scoped state so a different
        // vendor signing in on the same browser session doesn't inherit
        // the prior vendor's _pendingWrites (which would otherwise drain
        // under the new vendor_id on hydrate, leaking prices cross-vendor).
        useVendorCatalogStore.getState().resetVendorScopedState()
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
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus)
      }
    }
  }, [])

  return null
}
