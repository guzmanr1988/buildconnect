import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Subscribe to Supabase Realtime for the 2 vendor-price tables. Whenever any
 * vendor edits a price (option or sub_option), every mounted listener (the
 * homeowner Compare Vendors page) refetches its priceMap so live edits flow
 * through without a manual reload.
 *
 * Same publication/REPLICA pattern as use-catalog-realtime — the WAL payload
 * carries only PK + changed columns, so we refetch rather than apply deltas.
 * Vendor-price writes are low-frequency enough that refetch cost is negligible.
 *
 * Arc-32 v3 twin-fix (Pattern B, mirrors use-catalog-realtime): the Realtime
 * client attaches anon claims if subscribe() fires before the user JWT is on
 * the socket; under RLS-gated vendor-price tables the broker then silently
 * drops events even though REST SELECT works. Pull the session first, push
 * the token via setAuth(), then subscribe.
 */
const VENDOR_PRICE_TABLES = ['vendor_option_prices', 'vendor_sub_option_prices'] as const

export function useVendorPriceRealtime(refetch: () => void) {
  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function subscribe() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      if (cancelled) return
      supabase.realtime.setAuth(session.access_token)
      channel = supabase.channel('vendor-price-changes')
      for (const table of VENDOR_PRICE_TABLES) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => refetch()
        )
      }
      channel.subscribe()
    }

    void subscribe()

    // Re-attach on session resolve / refresh so subscribers cold-mounted
    // before the JWT arrives still pick up events once the session lands.
    // Also re-fires refetch (Arc-43 hold) so the caller's empty-priceMap on
    // pre-JWT cold-mount gets repopulated once the session resolves.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.access_token) return
      if (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION') return
      supabase.realtime.setAuth(session.access_token)
      if (!channel) {
        void subscribe()
      }
      refetch()
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
      authSub?.subscription.unsubscribe()
    }
  }, [refetch])
}
