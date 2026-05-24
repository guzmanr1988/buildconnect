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
 */
const VENDOR_PRICE_TABLES = ['vendor_option_prices', 'vendor_sub_option_prices'] as const

export function useVendorPriceRealtime(refetch: () => void) {
  useEffect(() => {
    const channel = supabase.channel('vendor-price-changes')
    for (const table of VENDOR_PRICE_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => refetch()
      )
    }
    channel.subscribe()
    // Arc-43 — auth-bootstrap-race re-fire. getVendorPriceMap's session-guard
    // returns an empty Map when the loader fires before the JWT is attached.
    // Subscribe to SIGNED_IN/INITIAL_SESSION/TOKEN_REFRESHED so the caller
    // re-runs once the session resolves; otherwise the empty map stays
    // memoized and the price columns render Contact-for-quote forever.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user?.id) return
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        refetch()
      }
    })
    return () => {
      supabase.removeChannel(channel)
      authSub?.subscription.unsubscribe()
    }
  }, [refetch])
}
