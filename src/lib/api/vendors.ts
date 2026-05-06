import { supabase } from '@/lib/supabase'
import { geocodeVendorAddress } from '@/lib/api/geocode'
import type { Vendor } from '@/types'

export async function getVendors() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'vendor')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Vendor[]
}

export async function getVendorProfile(id: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Vendor
}

export async function updateVendor(id: string, updates: Partial<Vendor>) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  // Phase 2 real geocoding: fire-and-forget Edge Fn call when address changed
  // so latitude/longitude get populated asynchronously. Failures don't block
  // the save — distance filter degrades to "skip when null" until next attempt.
  if (typeof updates.address === 'string' && updates.address.trim()) {
    void geocodeVendorAddress(id, updates.address)
  }
  return data as Vendor
}
