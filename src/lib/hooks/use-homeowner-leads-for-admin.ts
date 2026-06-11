// Wave-18 #3 — Admin Support inbox homeowner-context strip lead-count.
// Counts the number of leads a homeowner has submitted; reads via admin
// SELECT-all on leads RLS (mig 010). Returns null while loading.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useHomeownerLeadsForAdmin(homeownerId: string | null): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!homeownerId) {
      setCount(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const { count: c, error } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('homeowner_id', homeownerId)
      if (cancelled) return
      if (error) {
        setCount(null)
        return
      }
      setCount(c ?? 0)
    })()
    return () => {
      cancelled = true
    }
  }, [homeownerId])
  return count
}
