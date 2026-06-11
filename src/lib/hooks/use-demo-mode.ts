// Wave-9 9a — ?demo=1 URL override = mock-mode (preserves Rod's live-demo
// path). Absence of ?demo=1 = real-mode (lib/api/messages.ts + lib/api/leads.ts
// fetch against real Supabase tables). Hook reads location.search so URL flips
// take effect on route change without page reload.
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

export function useDemoMode(): boolean {
  const location = useLocation()
  return useMemo(
    () => new URLSearchParams(location.search).get('demo') === '1',
    [location.search],
  )
}
