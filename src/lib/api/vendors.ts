import { supabase } from '@/lib/supabase'
import { PROFILE_SELECT } from '@/lib/auth'
import { geocodeVendorAddress } from '@/lib/api/geocode'
import type { Vendor } from '@/types'

export async function getVendors() {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('role', 'vendor')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as Vendor[]
}

export async function getVendorProfile(id: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as unknown as Vendor
}

export async function updateVendor(id: string, updates: Partial<Vendor>) {
  // PR-218 — drop .select().single() (n=3 same-class with Q1 #275 NCA
  // persistence + Ship #322 register signup-partial-fail). .single() throws
  // PGRST116 when SELECT-after-UPDATE returns 0 rows — most commonly when
  // profile.id (zustand-persist cache) is stale vs auth.uid() at write time,
  // so .eq('id', staleId) matches 0 rows under RLS. The throw fires a false
  // error toast even when the user's session is healthy. Callers
  // (register.tsx, non-circumvention-agreement-dialog.tsx) await-and-discard
  // — return value was unused. True errors (401, RLS deny, network) still
  // populate `error` and throw; only the brittle 0-row .single() throw
  // path is closed.
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
  if (error) throw error
  // Phase 2 real geocoding: fire-and-forget Edge Fn call when address changed
  // so latitude/longitude get populated asynchronously. Failures don't block
  // the save — distance filter degrades to "skip when null" until next attempt.
  if (typeof updates.address === 'string' && updates.address.trim()) {
    void geocodeVendorAddress(id, updates.address)
  }
}
