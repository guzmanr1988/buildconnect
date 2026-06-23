import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Subscribe to Supabase Realtime for the 5 catalog tables. Whenever an admin
 * edits a service / option_group / option / sub_group / sub_option, every
 * mounted listener (vendor catalog + other admin tabs) refetches its store.
 *
 * Substrate (hephaestus 2026-05-24): the 5 tables were added to the
 * supabase_realtime publication with REPLICA IDENTITY = default(pk), so the
 * WAL payload carries only the PK + changed columns. We don't try to apply
 * deltas — we just refetch on any change. The catalog is low-write enough
 * that the refetch cost is negligible.
 */
const CATALOG_TABLES = [
  'services',
  'option_groups',
  'options',
  'sub_groups',
  'sub_options',
] as const

export function useCatalogRealtime(refetchCatalog: () => void) {
  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    // Single-flight guard: the initial `void subscribe()` is async; while it
    // awaits getSession(), onAuthStateChange can fire INITIAL_SESSION and call
    // subscribe() again. Both reach `supabase.channel('catalog-changes')` (name-
    // cached, returns the same instance) and add .on() handlers; the second
    // .on() lands after the first .subscribe() → "cannot add postgres_changes
    // callbacks after subscribe()" warning + duplicated handlers.
    let subscribing = false

    // Arc-32 v2 — auth-await guard for the WS subscribe. The Realtime client
    // attaches anon claims if subscribe() fires before the user JWT is on the
    // socket; under RLS-gated catalog tables (auth.role()=authenticated) the
    // broker then silently drops events even though REST SELECT works. Pull
    // the session first, push the token onto the Realtime socket via
    // setAuth(), then subscribe. Sibling-class fix to PR-#378 hydrate-race —
    // same race, WS surface this time. Mirror of
    // use-vendor-price-realtime auth-state re-fire pattern.
    async function subscribe() {
      if (subscribing || channel) return
      subscribing = true
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        if (cancelled) return
        supabase.realtime.setAuth(session.access_token)
        channel = supabase.channel('catalog-changes')
        for (const table of CATALOG_TABLES) {
          channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            () => refetchCatalog()
          )
        }
        channel.subscribe()
      } finally {
        subscribing = false
      }
    }

    void subscribe()

    // Re-attach on session resolve / refresh so subscribers cold-mounted
    // before the JWT arrives still pick up events once the session lands.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.access_token) return
      if (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION') return
      supabase.realtime.setAuth(session.access_token)
      if (!channel) {
        void subscribe()
      }
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
      authSub?.subscription.unsubscribe()
    }
  }, [refetchCatalog])
}
