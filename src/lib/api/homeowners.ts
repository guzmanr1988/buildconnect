import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

// Ship #281 — Supabase profiles-by-role read for admin/homeowners
// realtime population. Mirrors lib/api/vendors.getVendors signature
// shape so when admin/vendors gets the same Supabase wire-up later,
// both surfaces follow the same architecture (kratos directive).
//
// RLS expectation: admin role can read all profiles. If policy blocks
// (or fetch fails for any reason), the consuming page falls back to
// inline fixture HOMEOWNERS — banked Supabase-column-not-yet-migrated-
// → preserve-local-value idiom applied at the data-source layer.

export async function getHomeowners() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'homeowner')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Profile[]
}
