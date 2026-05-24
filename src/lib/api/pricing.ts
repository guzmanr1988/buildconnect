import { supabase } from '@/lib/supabase'
import { findCatalogOption, getOptionMetadata, sqftToSquares } from '@/lib/option-metadata'
import {
  computeGutterTotalLinFt,
  isRepairOption,
  resolveRepairAreaSqft,
  PITCHED_WASTE_FACTOR,
  FLAT_WASTE_FACTOR,
} from '@/lib/roof-pricing'
import { applyAreaWaste } from '@/lib/area-waste'
import {
  WINDOW_TYPE_IDS,
  DOOR_TYPE_IDS,
  FRAME_COLOR_IDS,
  GLASS_COLOR_IDS,
  GLASS_TYPE_IDS,
  STORM_FRONT_TYPE_IDS,
  STORM_FRONT_SIZE_IDS,
} from '@/lib/configurator-catalog-price'
import type { CartItem, ConfiguratorEntry } from '@/stores/cart-store'
import type { ServiceConfig } from '@/types'

/*
 * Pricing API — Phase 3+4.
 *
 * Fetches a vendor's full price catalog in one round-trip via PostgREST
 * embed and reshapes it into a (serviceId, groupId, optionId) -> priceCents
 * lookup. Totals are computed client-side off current cart selections,
 * respecting requiresQuantity where applicable (install_windows /
 * install_doors etc. per option-metadata.ts).
 */

// Arc-41: keys carry an 'opt:' / 'subopt:' prefix to disambiguate option-level
// vs sub_option-level entries inside the same Map. Sub_options always belong
// to a parent option, so the subopt key includes both.
export type VendorPriceMap = Map<string, number> // see priceKey / subOptionPriceKey below

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

type DbSubPriceRow = {
  price_cents: number
  active: boolean
  sub_options: {
    sub_option_id: string
    sub_groups: {
      options: {
        option_id: string
        option_groups: {
          group_id: string
          service_id: string
        }
      }
    }
  }
}

export function priceKey(serviceId: string, groupId: string, optionId: string): string {
  return `opt:${serviceId}|${groupId}|${optionId}`
}

export function subOptionPriceKey(
  serviceId: string,
  groupId: string,
  optionId: string,
  subOptionId: string,
): string {
  return `subopt:${serviceId}|${groupId}|${optionId}|${subOptionId}`
}

// Arc-32 close — cart-side selections are keyed by group.id on most paths,
// but some toggle paths write selections[optionId] = [optionId] (collapsing
// group + option to the same string). DB option_groups.group_id is then
// distinct from the cart's stored key, priceMap.get(directKey) misses, and
// the homeowner Compare page surfaces "Some services unpriced" even when
// the vendor has explicitly priced the option.
//
// Strategy: try the cart's directKey first (preserves back-compat for
// correctly-keyed cart writes), and on miss walk services[serviceId]
// .optionGroups[*].options[*] to find the canonical group.id for optionId.
// If exactly one group owns the optionId, retry with the resolved key.
// If multiple groups own the same optionId within a service (soft-convention
// violation — should never happen but cheap to defend), return the direct
// key + console.warn so the bug surfaces in dev logs rather than mis-pricing.
export function resolveOptionPriceKey(
  services: ServiceConfig[] | undefined,
  serviceId: string,
  cartGroupId: string,
  optionId: string,
  priceMap: VendorPriceMap,
): string {
  const directKey = priceKey(serviceId, cartGroupId, optionId)
  if (priceMap.has(directKey)) return directKey
  if (!services) return directKey
  const service = services.find((s) => s.id === serviceId)
  if (!service) return directKey
  const matchedGroupIds: string[] = []
  for (const g of service.optionGroups ?? []) {
    if ((g.options ?? []).some((o) => o.id === optionId)) {
      matchedGroupIds.push(g.id)
    }
  }
  if (matchedGroupIds.length === 0) return directKey
  if (matchedGroupIds.length > 1) {
    console.warn('[pricing] resolveOptionPriceKey ambiguous — multiple groups contain optionId; falling back to direct key', { serviceId, optionId, matchedGroupIds })
    return directKey
  }
  const resolvedKey = priceKey(serviceId, matchedGroupIds[0], optionId)
  return priceMap.has(resolvedKey) ? resolvedKey : directKey
}

export async function getVendorPriceMap(vendorUuid: string): Promise<VendorPriceMap> {
  // Arc-43 — auth-bootstrap-race guard. vendor_option_prices + vendor_sub_option_prices
  // RLS gates SELECT on authenticated role. /homeowner/vendor-compare and
  // /homeowner/booking-confirmation can fire this loader before the Supabase
  // session JWT is attached → anon SELECTs return [] → priceMap empty →
  // strikethrough/Contact-for-quote misfires. The use-vendor-price-realtime
  // hook subscribes to onAuthStateChange so the caller re-fires loadPriceMaps
  // once the session resolves.
  const { data: { session: authSession } } = await supabase.auth.getSession()
  if (!authSession) {
    return new Map()
  }
  // Parallel SELECTs against option-price and sub_option-price tables. Both
  // tables share the same per-vendor active filter; merged into one Map so
  // computeVendorTotal can hit a single lookup regardless of which level a
  // selection lives at.
  const [optionRes, subOptionRes] = await Promise.all([
    supabase
      .from('vendor_option_prices')
      .select('price_cents,active,options(option_id,option_groups(group_id,service_id))')
      .eq('vendor_id', vendorUuid)
      .eq('active', true),
    supabase
      .from('vendor_sub_option_prices')
      .select('price_cents,active,sub_options(sub_option_id,sub_groups(options(option_id,option_groups(group_id,service_id))))')
      .eq('vendor_id', vendorUuid)
      .eq('active', true),
  ])
  if (optionRes.error) throw new Error(`getVendorPriceMap: ${optionRes.error.message}`)
  if (subOptionRes.error) throw new Error(`getVendorPriceMap(sub): ${subOptionRes.error.message}`)
  const map: VendorPriceMap = new Map()
  for (const r of (optionRes.data ?? []) as unknown as DbPriceRow[]) {
    if (!r.options || !r.options.option_groups) continue
    const k = priceKey(
      r.options.option_groups.service_id,
      r.options.option_groups.group_id,
      r.options.option_id
    )
    map.set(k, r.price_cents)
  }
  for (const r of (subOptionRes.data ?? []) as unknown as DbSubPriceRow[]) {
    const so = r.sub_options
    const parentOpt = so?.sub_groups?.options
    const og = parentOpt?.option_groups
    if (!so || !parentOpt || !og) continue
    const k = subOptionPriceKey(og.service_id, og.group_id, parentOpt.option_id, so.sub_option_id)
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
  missingOptionKeys: string[] // 'opt:<service>|<group>|<option>' keys the vendor has no price for
  // Arc-42: sub-option keys the homeowner picked (window type, frame color,
  // glass type, size, etc.) that the vendor hasn't priced. Surfaced to UI so
  // the "Some services unpriced" badge correctly reflects sub-option coverage.
  missingSubOptionKeys: string[]
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
  cartItems: CartItem[],
  // Catalog overlay for priceUnit. Pass useCatalogStore.getState().services
  // from the caller so admin-edited priceUnit on net-new options drives the
  // billing branch (square / sqft / linear_ft) instead of silently falling
  // back to flat. Optional for back-compat — when undefined, only the static
  // OPTION_METADATA map applies (legacy behavior).
  services?: ServiceConfig[],
  // Arc-32 PR-B — vendor_service_permits roll-in. Rod-rule: "permit is
  // default in every service unless vendor puts it at 0, therefor it needs
  // to be accounted and added to the total." Sum per-service permit for
  // every service the vendor covers (has at least one priced VOP/VSOP row).
  // Vendors who set 0 are filtered out at getVendorPermitMap (zero/missing
  // rows skipped), so absence = opt-out. Optional for back-compat.
  permitMap?: VendorPermitMap,
): VendorTotalResult {
  let hasSelections = false
  let totalCents = 0
  const missing: string[] = []
  const missingSub: string[] = []
  const coveredServices = new Set<string>()

  for (const item of cartItems) {
    for (const [groupId, optionIds] of Object.entries(item.selections ?? {})) {
      if (!optionIds || optionIds.length === 0) continue
      // service_type (replace/repair) is vendor-internal cost context,
      // not a customer-facing charge — excluded from homeowner-visible totals.
      if (item.serviceId === 'roofing' && groupId === 'service_type') continue
      hasSelections = true
      for (const optionId of optionIds) {
        const key = resolveOptionPriceKey(services, item.serviceId, groupId, optionId, priceMap)
        const basePrice = priceMap.get(key)
        if (basePrice === undefined) {
          missing.push(key)
          continue
        }
        coveredServices.add(item.serviceId)
        const catalogOption = services
          ? findCatalogOption(services, item.serviceId, optionId)
          : undefined
        const meta = getOptionMetadata(optionId, item.serviceId, catalogOption)
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
          const hasPitchedSelected = allMatIds.some((id) => {
            if (id === 'flat_roof') return false
            const sib = services ? findCatalogOption(services, item.serviceId, id) : undefined
            return getOptionMetadata(id, item.serviceId, sib).priceUnit === 'square'
          })
          const includeMaterialOrderOpt = item.roofMeasurement?.includeMaterialOrder !== false
          const includeFlatAreaOpt = item.roofMeasurement?.includeFlatArea !== false
          const useSplit = hasSplitData && hasFlatSelected && hasPitchedSelected
          // Decoupled toggle gates: Main Roof (includeMaterialOrderOpt) zeros
          // PITCHED options only; Flat Area (includeFlatAreaOpt) zeros the
          // FLAT option only. Each toggle gates its own area class — flipping
          // Main Roof OFF does not also zero flat (sibling: roof-area-math
          // computeRoofTotal pitched/flat split + roof-measurement-breakdown
          // -card UI toggle independence).
          const isFlatZeroed = isFlatOpt && !includeFlatAreaOpt
          const isPitchedZeroed = !isFlatOpt && !includeMaterialOrderOpt
          const rawSqft = isFlatZeroed || isPitchedZeroed
            ? 0
            : useSplit
              ? (isFlatOpt ? (item.roofMeasurement!.flatAreaSqft ?? 0) : (item.roofMeasurement!.pitchedAreaSqft ?? 0))
              : (isFlatOpt
                  ? (item.roofMeasurement?.flatAreaSqft ?? item.roofMeasurement?.areaSqft ?? 0)
                  : (item.roofMeasurement?.pitchedAreaSqft ?? item.roofMeasurement?.areaSqft ?? 0))
          const wasteFactor = isFlatOpt ? FLAT_WASTE_FACTOR : PITCHED_WASTE_FACTOR
          const wasteSqft = Math.round(rawSqft * wasteFactor)
          totalCents += basePrice * sqftToSquares(wasteSqft)
        } else if (meta.priceUnit === 'sqft') {
          // Per-material repair lines route through the shared resolver
          // so /booking-confirmation reconciles with vendor-compare totals
          // (Math-is-god + format-SoT-via-shared-helper).
          //
          // Non-repair sqft options use the cart-shape fallback chain:
          // 1. customSizeSqft[optionId] — per-option-id sqft (pool size,
          //    pool floor surfaces; sibling sqft values on the same item).
          // 2. item.areaSqft — single satellite-measured area (driveways +
          //    pergolas; whichever option is sqft-priced for that service).
          // 3. roofMeasurement.areaSqft — insulation + legacy roof items.
          const rawSqft = isRepairOption(optionId)
            ? resolveRepairAreaSqft(item, optionId)
            : (item.customSizeSqft?.[optionId]
                ?? item.areaSqft
                ?? item.roofMeasurement?.areaSqft
                ?? 0)
          // Per-service waste applied at the cost layer to mirror display.
          // Driveway = ×1.03, pergolas/fencing/roofing = pass-through.
          // Repair lines pre-resolve via roof-pricing helper which already
          // bakes the roof waste factor, so they bypass area-waste here.
          const sqft = isRepairOption(optionId)
            ? rawSqft
            : applyAreaWaste(item.serviceId, rawSqft)
          totalCents += basePrice * sqft
        } else if (meta.priceUnit === 'linear_ft') {
          // Resolve linear ft source: roofAddonLinearFt (existing roofing
          // addons, with gutter drops math) OR addonLinearFt (generic
          // non-roofing addons like pool_fence). Roof perimeter add-ons gate
          // on includePerimeter — when the section toggle is OFF, no
          // gutter/fascia/soffit line items reach the quote.
          const roofLinFt = item.roofAddonLinearFt?.[optionId]
          const isRoofPerimeterAddon = roofLinFt !== undefined
          const includePerimeterOpt = item.roofMeasurement?.includePerimeter !== false
          if (isRoofPerimeterAddon && !includePerimeterOpt) {
            // Zero contribution — perimeter toggle excluded this line item.
          } else {
            const linFt = roofLinFt ?? item.addonLinearFt?.[optionId] ?? 0
            const effectiveLinFt = optionId === 'gutters'
              ? computeGutterTotalLinFt(linFt, item.gutterDropsConfig)
              : linFt
            totalCents += basePrice * effectiveLinFt
          }
        } else {
          totalCents += basePrice
        }
      }
    }
  }

  // Arc-42 — sub-option iteration. windowSelections/doorSelections/
  // stormFrontSelections/garageDoorSelection carry the homeowner's per-row
  // sub-option picks (type, frame color, glass color, glass type, size).
  // Pre-Arc-42, computeVendorTotal ignored these entirely, so sub-option
  // prices (the bulk of vendor revenue on a windows_doors quote) were
  // invisible — two distinct configurations summed identically. We map each
  // sub-field's label/id to its DB sub_option_id, build a subopt-prefixed
  // key, look up the price, and add basePrice × quantity.
  for (const item of cartItems) {
    const serviceId = item.serviceId
    const products = 'products'

    const accumulateSubOpts = (
      parentOptionId: string,
      subOptionIds: (string | undefined)[],
      quantity: number,
    ) => {
      for (const subId of subOptionIds) {
        if (!subId) continue
        hasSelections = true
        const key = subOptionPriceKey(serviceId, products, parentOptionId, subId)
        const basePrice = priceMap.get(key)
        if (basePrice === undefined) {
          missingSub.push(key)
          continue
        }
        coveredServices.add(serviceId)
        totalCents += basePrice * quantity
      }
    }

    for (const w of (item.windowSelections ?? []) as ConfiguratorEntry[]) {
      accumulateSubOpts(
        'windows',
        [
          w.size,
          WINDOW_TYPE_IDS[w.type],
          FRAME_COLOR_IDS[w.frameColor],
          GLASS_COLOR_IDS[w.glassColor],
          GLASS_TYPE_IDS[w.glassType],
        ],
        w.quantity,
      )
    }
    for (const d of (item.doorSelections ?? []) as ConfiguratorEntry[]) {
      accumulateSubOpts(
        'doors',
        [
          d.size,
          DOOR_TYPE_IDS[d.type],
          FRAME_COLOR_IDS[d.frameColor],
          GLASS_COLOR_IDS[d.glassColor],
          GLASS_TYPE_IDS[d.glassType],
        ],
        d.quantity,
      )
    }
    for (const sf of (item.stormFrontSelections ?? []) as ConfiguratorEntry[]) {
      accumulateSubOpts(
        'storm_front',
        [
          STORM_FRONT_SIZE_IDS[sf.size],
          STORM_FRONT_TYPE_IDS[sf.type],
          FRAME_COLOR_IDS[sf.frameColor],
          GLASS_COLOR_IDS[sf.glassColor],
          GLASS_TYPE_IDS[sf.glassType],
        ],
        sf.quantity,
      )
    }
    const gd = item.garageDoorSelection
    if (gd?.type) {
      // GarageDoor fields store sub_option ids directly (no label→id map);
      // single unit (quantity = 1 implicit).
      accumulateSubOpts('garage_doors', [gd.type, gd.size, gd.color, gd.glass], 1)
    }
  }

  const cartServiceIds = new Set(cartItems.map((i) => i.serviceId))
  const coversAllServices =
    cartItems.length > 0 &&
    cartServiceIds.size > 0 &&
    Array.from(cartServiceIds).every((id) => coveredServices.has(id))

  if (permitMap) {
    for (const serviceId of coveredServices) {
      const permitCents = permitMap.get(serviceId) ?? 0
      totalCents += permitCents
    }
  }

  return {
    hasSelections,
    totalCents,
    missingOptionKeys: missing,
    missingSubOptionKeys: missingSub,
    coversAllServices,
  }
}

export function formatPriceCents(cents: number): string {
  const dollars = Math.round(cents / 100)
  return `$${dollars.toLocaleString('en-US')}`
}
