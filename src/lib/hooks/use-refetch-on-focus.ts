import { useEffect } from 'react'

/**
 * Re-run `callback` whenever the tab becomes visible (or the window regains
 * focus). Admin pages use this so an admin keeping /admin/revenue open in a
 * background tab sees fresh numbers as soon as they switch back — without a
 * polling loop or Supabase realtime subscription.
 *
 * The callback is captured on each render; pass a stable function (useMemo /
 * useCallback) if it references props that shouldn't re-bind the listener.
 */
export function useRefetchOnFocus(callback: () => void) {
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') callback()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', callback)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', callback)
    }
  }, [callback])
}
