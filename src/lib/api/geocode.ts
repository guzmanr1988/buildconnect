import { supabase } from '@/lib/supabase'
import { geocodeAddress } from '@/lib/satellite-measure/geocode'

// Phase 2 vendor geocoding — FE-direct, reuses the satellite-measure
// Google Maps Geocoding helper (same VITE_GOOGLE_MAPS_API_KEY, same
// referrer-restricted-to-buildc.net posture, no NEW exposure surface).
//
// Flow: vendor saves profile → caller invokes this fire-and-forget →
// geocode the address → write latitude/longitude to the vendor's own
// profiles row via supabase-js. Self-update RLS on profiles allows the
// vendor to UPDATE their own row. Failures are logged + swallowed —
// distance filter degrades to "skip when null" until next save attempt.
export async function geocodeVendorAddress(vendorId: string, address: string): Promise<void> {
  if (!vendorId || !address?.trim()) return
  try {
    const result = await geocodeAddress(address)
    if (!result) return
    await supabase
      .from('profiles')
      .update({ latitude: result.lat, longitude: result.lng })
      .eq('id', vendorId)
  } catch (err) {
    console.error('[geocode-vendor] failed:', err)
  }
}
