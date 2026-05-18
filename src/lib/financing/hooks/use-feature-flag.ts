import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// DB-driven feature flag hooks. Replaces the VITE_*_ENABLED bundle-bake pattern
// so admin toggles in /admin/financing propagate to live sessions without a
// redeploy. Two variants:
//
//   useFeatureFlag(key):      entry-class — one-shot fetch + realtime subscribe
//                             + visibilitychange/reconnect reconcile. Re-renders
//                             on flag-change. Use on surfaces a user enters
//                             (cards, badges) where late-binding the flip is
//                             desired.
//
//   useFeatureFlagOnce(key):  in-flight class — one-shot read-at-mount only,
//                             never re-renders mid-flow. Use on funnel pages
//                             (apply, status) where flipping the flag out from
//                             under a user already mid-application is hostile.
//
// Render-gate contract: both hooks return `boolean | undefined`:
//   undefined → loading (first fetch in flight; caller should render skeleton or nothing)
//   false     → flag disabled OR fetch errored (fail-safe: hide the gated surface)
//   true      → flag enabled, render
//
// Default-undefined matters for pages with `Navigate` early-returns (apply.tsx,
// status.tsx): we must not bounce a user mid-load before the flag resolves.
// Entry-class callers (cards/badges) can collapse undefined+false into "hide"
// with a simple `!enabled` check — falsy semantics still work.

const SUBSCRIBE_TIMEOUT_MS = 8000

async function fetchFlag(key: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return false
  return data.enabled === true
}

export function useFeatureFlag(key: string): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    const reconcile = () => {
      void fetchFlag(key).then((value) => {
        if (!cancelled) setEnabled(value)
      })
    }

    reconcile()

    const channel = supabase
      .channel(`feature_flag:${key}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags', filter: `key=eq.${key}` },
        (payload) => {
          if (cancelled) return
          const next = payload.new as { enabled?: boolean } | null
          if (next && typeof next.enabled === 'boolean') {
            setEnabled(next.enabled)
          } else {
            reconcile()
          }
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
  }, [key])

  return enabled
}

export function useFeatureFlagOnce(key: string): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined)
  const lockedRef = useRef(false)

  useEffect(() => {
    if (lockedRef.current) return
    let cancelled = false
    void fetchFlag(key).then((value) => {
      if (cancelled) return
      lockedRef.current = true
      setEnabled(value)
    })
    return () => {
      cancelled = true
    }
  }, [key])

  return enabled
}
