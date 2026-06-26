// Concierge Rep Request — reps roster fetch.
// Powers the admin rep-picker on the queue detail pane (assign /
// reassign action). Reps are profiles with role='rep'; the roster is
// small enough (~tens) that a single ordered SELECT is cheaper than
// any pagination or search-as-you-type.
//
// Cached for 60s — assignment churn doesn't need sub-minute freshness
// and the dropdown re-opens often during a triage session.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface RepOption {
  id: string
  name: string
}

export interface UseRepsResult {
  reps: RepOption[]
  isLoading: boolean
  error: Error | null
}

export function useReps(): UseRepsResult {
  const query = useQuery<RepOption[], Error>({
    queryKey: ['reps-roster'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('role', 'rep')
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => ({
        id: r.id as string,
        name: (r.name as string | null) ?? '(no name)',
      }))
    },
  })
  return {
    reps: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  }
}
