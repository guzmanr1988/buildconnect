import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  MASTER_KEY,
  CATEGORY_KEYS,
  HOMEOWNER_CATEGORY_ORDER,
  type LenderCategory,
} from '@/lib/financing/lender-categories'

// "Is financing actually reachable from a homeowner surface right now" —
// true iff the master flag is ON AND at least one HOMEOWNER_CATEGORY_ORDER
// category has both its category-flag ON and ≥1 active non-deleted lender.
//
// This is the shared gate for CTA-visible states across financing-card and
// the appointment-status Apply-CTA. Callers that render user-data-present
// state (approved envelope, in-flight application, existing draws) must
// NOT gate on this hook — Rod's PR #252 always-render invariant requires
// approved-amount-banner + homeowner-pending-draws-section + the applied /
// approved / terms_accepted branches of financing-card to render regardless
// of category flags. A homeowner with money already approved must still see
// their envelope if categories go dark six months later.
//
// Return type matches useFeatureFlag:
//   undefined → loading (first fetch in flight; caller should not render)
//   false     → not reachable (any of: master off, no category on, no
//               lenders in an enabled category, fetch errored)
//   true      → reachable, render CTAs
//
// Realtime scope: subscribes to feature_flags (the Rod-facing toggle path).
// Does NOT subscribe to lenders — adding/removing a lender row requires a
// page reload to propagate. Acceptable tradeoff: admin adds a lender then
// almost always toggles the category flag to test, which triggers the
// feature_flags re-fetch and re-reads lenders in the same effect. lenders
// is not currently in the supabase_realtime publication (only feature_flags
// is per mig 054); adding it would expand PR scope past the reachability
// fix. If a later use case needs live lenders propagation, add a migration
// and lenders realtime subscribe here.

const SUBSCRIBE_TIMEOUT_MS = 8000

async function fetchReachable(): Promise<boolean> {
  const [flagRes, lenderRes] = await Promise.all([
    supabase.from('feature_flags').select('key, enabled'),
    supabase
      .from('lenders')
      .select('category, active, deleted_at')
      .eq('active', true)
      .is('deleted_at', null),
  ])
  if (flagRes.error || lenderRes.error) return false
  const flags = new Map<string, boolean>()
  for (const row of (flagRes.data ?? []) as Array<{ key: string; enabled: boolean }>) {
    flags.set(row.key, row.enabled === true)
  }
  if (flags.get(MASTER_KEY) !== true) return false
  const activeCategories = new Set<LenderCategory>()
  for (const row of (lenderRes.data ?? []) as Array<{ category: LenderCategory }>) {
    activeCategories.add(row.category)
  }
  for (const cat of HOMEOWNER_CATEGORY_ORDER) {
    if (flags.get(CATEGORY_KEYS[cat]) === true && activeCategories.has(cat)) {
      return true
    }
  }
  return false
}

export function useFinancingReachable(): boolean | undefined {
  const [reachable, setReachable] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    const reconcile = () => {
      void fetchReachable().then((value) => {
        if (!cancelled) setReachable(value)
      })
    }

    reconcile()

    // Per use-feature-flag.ts:69 — supabase-js v2 channel(name) is
    // cached-by-topic, so a unique-per-instance channel is required to
    // avoid "cannot add postgres_changes callbacks after subscribe()".
    const channel = supabase
      .channel(`financing_reachable:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags' },
        () => {
          if (cancelled) return
          reconcile()
        },
      )
      .subscribe()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') reconcile()
    }
    const onOnline = () => reconcile()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)

    const timeout = setTimeout(reconcile, SUBSCRIBE_TIMEOUT_MS)

    return () => {
      cancelled = true
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      void supabase.removeChannel(channel)
    }
  }, [])

  return reachable
}
