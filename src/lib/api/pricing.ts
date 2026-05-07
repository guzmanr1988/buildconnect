import { supabase } from '@/lib/supabase'
import { getOptionMetadata, sqftToSquares } from '@/lib/option-metadata'
import { computeGutterTotalLinFt } from '@/lib/roof-pricing'
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

// PR #118 — fix-forward: ONE permit per service (not per option).
// Rodolfo clarification: "permit is only 1 line item to add the price not
// in every single item". Per-vendor-per-service flat permit fee, snapshot
// onto the homeowner breakdown's Permit Price line at sendProject. Keyed
// by serviceId (a Map<string, number>, NOT the priceKey shape).
export type VendorPermitMap = Map<string, number> // key = serviceId

type DbPermitRow = {
  service_id: string
  permit_price_cents: number
  active: boolean
}

export async function getVendorPermitMap(vendorUuid: string): Promise<VendorPermitMap> {
  const { data, error } = await supabase
    .from('vendor_service_permits')
    .select('service_id,permit_price_cents,active')
    .eq('vendor_id', vendorUuid)
    .eq('active', true)
  if (error) throw new Error(`getVendorPermitMap: ${error.message}`)
  const map: VendorPermitMap = new Map()
  for (const r of (data ?? []) as DbPermitRow[]) {
    if (!r.service_id) continue
    if (!r.permit_price_cents || r.permit_price_cents <= 0) continue
    map.set(r.service_id, r.permit_price_cents)
  }
  return map
}

// Look up a vendor's flat permit fee for a cart item's service. PR #118:
// permit is one flat fee per service (not summed across selected options).
export function getPermitForItem(item: CartItem, permitMap: VendorPermitMap): number {
  return permitMap.get(item.serviceId) ?? 0
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
      // service_type (replace/repair) is vendor-internal cost context,
      // not a customer-facing charge — excluded from homeowner-visible totals.
      if (item.serviceId === 'roofing' && groupId === 'service_type') continue
      hasSelections = true
      for (const optionId of optionIds) {
        const key = priceKey(item.serviceId, groupId, optionId)
        const basePrice = priceMap.get(key)
        if (basePrice === undefined) {
          missing.push(key)
          continue
        }
        coveredServices.add(item.serviceId)
        const meta = getOptionMetadata(optionId, item.serviceId)
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
          const hasPitchedSelected = allMatIds.some((id) => id !== 'flat_roof' && getOptionMetadata(id, item.serviceId).priceUnit === 'square')
          const useSplit = hasSplitData && hasFlatSelected && hasPitchedSelected
            && (item.roofMeasurement?.includeFlat !== false)
          const rawSqft = useSplit
            ? (isFlatOpt ? (item.roofMeasurement!.flatAreaSqft ?? 0) : (item.roofMeasurement!.pitchedAreaSqft ?? 0))
            : (item.roofMeasurement?.areaSqft ?? 0)
          const wasteFactor = (useSplit && isFlatOpt) ? 1.01 : 1.02
          const wasteSqft = Math.round(rawSqft * wasteFactor)
          totalCents += basePrice * sqftToSquares(wasteSqft)
        } else if (meta.priceUnit === 'sqft') {
          // Per-material repair rates (option iii): each repair_<material>
          // line bills vendor's $/sqft rate × that material's existing area
          // measurement. repair_flat_roof → flatAreaSqft. repair_metal /
          // repair_aluminum → metalRoofSelection.roofSize×100 if captured,
          // else pitched/areaSqft fallback. All others (shingle, barrel,
          // terracotta) → pitchedAreaSqft, areaSqft fallback.
          let sqft: number
          if (optionId.startsWith('repair_')) {
            const rm = item.roofMeasurement
            if (optionId === 'repair_flat_roof') {
              sqft = rm?.flatAreaSqft ?? rm?.areaSqft ?? 0
            } else if (optionId === 'repair_metal' || optionId === 'repair_aluminum') {
              const metalSqft = item.metalRoofSelection?.roofSize
                ? Number(item.metalRoofSelection.roofSize) * 100
                : 0
              sqft = metalSqft > 0
                ? metalSqft
                : (rm?.pitchedAreaSqft ?? rm?.areaSqft ?? 0)
            } else {
              sqft = rm?.pitchedAreaSqft ?? rm?.areaSqft ?? 0
            }
          } else {
            // Resolve sqft source per cart-item shape:
            // 1. customSizeSqft[optionId] — per-option-id sqft (pool size custom,
            //    pool floor surfaces; sibling sqft values on the same cart item).
            // 2. item.areaSqft — single satellite-measured area (driveways +
            //    pergolas; one area per cart item, used for whichever option is
            //    flagged sqft, e.g. square_concrete in driveways).
            // 3. legacy roofMeasurement.areaSqft — insulation + old persisted
            //    roof items that used per-sqft pricing before the per-square switch.
            sqft = item.customSizeSqft?.[optionId]
              ?? item.areaSqft
              ?? item.roofMeasurement?.areaSqft
              ?? 0
          }
          totalCents += basePrice * sqft
        } else if (meta.priceUnit === 'linear_ft') {
          // Resolve linear ft source: roofAddonLinearFt (existing roofing
          // addons, with gutter drops math) OR addonLinearFt (generic
          // non-roofing addons like pool_fence).
          const roofLinFt = item.roofAddonLinearFt?.[optionId]
          const linFt = roofLinFt ?? item.addonLinearFt?.[optionId] ?? 0
          const effectiveLinFt = optionId === 'gutters'
            ? computeGutterTotalLinFt(linFt, item.gutterDropsConfig)
            : linFt
          totalCents += basePrice * effectiveLinFt
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
