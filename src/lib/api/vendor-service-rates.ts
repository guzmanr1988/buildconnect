import { supabase } from '@/lib/supabase'

// Per-vendor unit-rate map for measurement-driven configurators.
// Mig 068 — task_1780668287986_922. Mirrors getVendorPriceMap shape but
// keyed by line_id within a (vendor, service_category) scope so the
// remodel/bathroom compute engines can substitute per-vendor rates for
// the in-code ratePlaceholder defaults.
//
// Public-read RLS (anon + authenticated) so vendor-compare renders on
// the demo flow before homeowner auth. Vendor write-own RLS isolates
// edits to the vendor's own rows.

export type VendorServiceRateMap = Map<string, number> // key = line_id, value = rate_cents

type DbRateRow = {
  line_id: string
  rate_cents: number
}

export async function getVendorServiceRateMap(
  vendorUuid: string,
  serviceCategory: string,
): Promise<VendorServiceRateMap> {
  const { data, error } = await supabase
    .from('vendor_service_rates')
    .select('line_id,rate_cents')
    .eq('vendor_id', vendorUuid)
    .eq('service_category', serviceCategory)
    .eq('active', true)
  if (error) throw new Error(`getVendorServiceRateMap: ${error.message}`)
  const map: VendorServiceRateMap = new Map()
  for (const r of (data ?? []) as DbRateRow[]) {
    if (!r.line_id || r.rate_cents == null) continue
    map.set(r.line_id, r.rate_cents)
  }
  return map
}
