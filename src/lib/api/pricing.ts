import { supabase } from '@/lib/supabase'
import { getOptionMetadata, sqftToSquares } from '@/lib/option-metadata'
import type { CartItem } from '@/stores/cart-store'

/*
 * Pricing API — Phase 3+4.
 *
 * Fetches a vendor's full price catalog in one round-trip via PostgREST
 * embed and reshapes it into a (serviceId, groupId, optionId) -> priceCents
 * lookup. Totals are computed client-side off current cart selections,
 * respecting requiresQuantity where applicable (install_windows /
 * install_doors etc. per option-metadata.ts).
 */

export type VendorPriceMap = Map<string, number> // key = `${serviceId}|${groupId}|${optionId}`

type DbPriceRow = {
  price_cents: number
  active: boolean
  options: {
    option_id: string
    option_groups: {
      group_id: string
      service_id: string
    }
  }
}

function priceKey(serviceId: string, groupId: string, optionId: string): string {
  return `${serviceId}|${groupId}|${optionId}`
}

export async function getVendorPriceMap(vendorUuid: string): Promise<VendorPriceMap> {
  const { data, error } = await supabase
    .from('vendor_option_prices')
    .select('price_cents,active,options(option_id,option_groups(group_id,service_id))')
    .eq('vendor_id', vendorUuid)
    .eq('active', true)
  if (error) throw new Error(`getVendorPriceMap: ${error.message}`)
  const map: VendorPriceMap = new Map()
  for (const r of (data ?? []) as unknown as DbPriceRow[]) {
    if (!r.options || !r.options.option_groups) continue
    const k = priceKey(
      r.options.option_groups.service_id,
      r.options.option_groups.group_id,
      r.options.option_id
    )
    map.set(k, r.price_cents)
  }
  return map
}

export type VendorTotalResult = {
  hasSelections: boolean
  totalCents: number
  missingOptionKeys: string[] // (serviceId|groupId|optionId) tuples the vendor has no price for
  coversAllServices: boolean
}

/**
 * Compute a vendor's total across all cart items.
 *
 * - hasSelections: false if the homeowner hasn't selected anything yet.
 * - missingOptionKeys: options the homeowner picked but this vendor has no
 *   active price for — caller decides whether to show "Contact for quote"
 *   or hide the vendor entirely.
 * - coversAllServices: false if the vendor has zero price rows matching
 *   ANY of the services in the cart (e.g. Shield can't price a pool).
 */
export function computeVendorTotal(
  priceMap: VendorPriceMap,
  cartItems: CartItem[]
): VendorTotalResult {
  let hasSelections = false
  let totalCents = 0
  const missing: string[] = []
  const coveredServices = new Set<string>()

  for (const item of cartItems) {
    for (const [groupId, optionIds] of Object.entries(item.selections ?? {})) {
      if (!optionIds || optionIds.length === 0) continue
      hasSelections = true
      for (const optionId of optionIds) {
        const key = priceKey(item.serviceId, groupId, optionId)
        const basePrice = priceMap.get(key)
        if (basePrice === undefined) {
          missing.push(key)
          continue
        }
        coveredServices.add(item.serviceId)
        const meta = getOptionMetadata(optionId)
        if (meta.requiresQuantity) {
          const qty = item.selectionQuantities?.[optionId] ?? meta.quantityRange?.min ?? 1
          totalCents += basePrice * qty
        } else if (meta.priceUnit === 'square') {
          // Vendor entered $/square (1 square = 100 sqft). Bill against waste-included squares.
          const allMatIds = Object.values(item.selections ?? {}).flat()
          const isFlatOpt = optionId === 'flat_roof'
          const hasSplitData = item.roofMeasurement?.pitchedAreaSqft !== undefined
            && item.roofMeasurement?.flatAreaSqft !== undefined
          const hasFlatSelected = allMatIds.includes('flat_roof')
          const hasPitchedSelected = allMatIds.some((id) => id !== 'flat_roof' && getOptionMetadata(id).priceUnit === 'square')
          const useSplit = hasSplitData && hasFlatSelected && hasPitchedSelected
            && (item.roofMeasurement?.includeFlat !== false)
          const rawSqft = useSplit
            ? (isFlatOpt ? (item.roofMeasurement!.flatAreaSqft ?? 0) : (item.roofMeasurement!.pitchedAreaSqft ?? 0))
            : (item.roofMeasurement?.areaSqft ?? 0)
          const wasteFactor = (useSplit && isFlatOpt) ? 1.01 : 1.02
          const wasteSqft = Math.round(rawSqft * wasteFactor)
          totalCents += basePrice * sqftToSquares(wasteSqft)
        } else if (meta.priceUnit === 'sqft') {
          // Legacy: vendor entered $/sqft (old persisted line items). Bill flat against areaSqft.
          const areaSqft = item.roofMeasurement?.areaSqft ?? 0
          totalCents += basePrice * areaSqft
        } else if (meta.priceUnit === 'linear_ft') {
          const linFt = item.roofAddonLinearFt?.[optionId] ?? 0
          totalCents += basePrice * linFt
        } else {
          totalCents += basePrice
        }
      }
    }
  }

  const cartServiceIds = new Set(cartItems.map((i) => i.serviceId))
  const coversAllServices =
    cartItems.length > 0 &&
    cartServiceIds.size > 0 &&
    Array.from(cartServiceIds).every((id) => coveredServices.has(id))

  return { hasSelections, totalCents, missingOptionKeys: missing, coversAllServices }
}

export function formatPriceCents(cents: number): string {
  const dollars = Math.round(cents / 100)
  return `$${dollars.toLocaleString('en-US')}`
}
