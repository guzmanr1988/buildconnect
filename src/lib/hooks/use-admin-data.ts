// Admin-only data hooks backing the /admin/* routes. Each hook wraps a
// Supabase fetch through @tanstack/react-query so consumers get caching +
// background refetch. RLS policies on profiles / leads / bank_accounts
// already gate to auth_role() = 'admin' (per backend audit 2026-05-08), so
// non-admin sessions get [] from the server without extra client-side
// branching.
//
// These hooks return real data only. Demo/fixture merging stays in the
// caller (e.g. via useEffectiveMockLeads) so demoDataHidden semantics
// continue to work; a Clear Demo Data flip hides fixtures but real data
// is always visible.

import { useQuery } from '@tanstack/react-query'
import { getAllLeads } from '@/lib/api/leads'
import { getHomeowners, getAllBankAccounts } from '@/lib/api/admin'

export function useAdminLeads() {
  return useQuery({
    queryKey: ['admin', 'leads'],
    queryFn: getAllLeads,
    staleTime: 30_000,
  })
}

export function useAdminHomeowners() {
  return useQuery({
    queryKey: ['admin', 'homeowners'],
    queryFn: getHomeowners,
    staleTime: 30_000,
  })
}

export function useAdminBankAccounts() {
  return useQuery({
    queryKey: ['admin', 'bank-accounts'],
    queryFn: getAllBankAccounts,
    staleTime: 30_000,
  })
}
