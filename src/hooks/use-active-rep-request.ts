import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

const ACTIVE_STATUSES = ['new', 'scheduled', 'visited', 'project_ready'] as const

export function useActiveRepRequest(): { id: string; status: string } | null {
  const user = useAuthStore((s) => s.session?.user)
  const { data } = useQuery({
    queryKey: ['active-rep-request', user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rep_requests')
        .select('id, status')
        .eq('homeowner_id', user!.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ?? null
    },
  })
  return data ?? null
}
