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

// Fix C-2 — pool addonQuantities → priced option mapping. The pool wizard
// surfaces these as count-steppers under the parent waterfall toggle; they
// are NEVER written into item.selections, so the parent-iter loop never
// reaches them. The synthetic pass below injects each entry as a billable
// option keyed by the priceMap shape (opt:pool|<groupId>|<optionId>) and
// bills basePrice × count. Apex confirmed all four are priced + active.
const POOL_QUANTITY_MAP: Record<keyof import('@/stores/cart-store').AddonQuantities, { groupId: string; optionId: string }> = {
  ledCount:     { groupId: 'addons',              optionId: 'led' },
  bubblerCount: { groupId: 'addons',              optionId: 'bubbler' },
  laminarJets:  { groupId: 'water_feature_units', optionId: 'laminar_jet' },
  waterfalls:   { groupId: 'water_feature_units', optionId: 'waterfall_unit' },
}

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

  // PR-#412 follow-up — bare FRAME_COLOR_IDS / GLASS_COLOR_IDS / GLASS_TYPE_IDS
  // maps still produce bare slugs (white, low_e, ...) but post-PR-#412 substrate
  // rename moved those rows to parent-prefixed literals (windows_white,
  // doors_low_e, storm_front_clear, ...). Hot-swap window keeps bare rows alive
  // today, but once hermes sweeps them this priceMap.get(key) would silently
  // miss for every windows_doors sub-option. Mirror the configurator-catalog-
  // price.ts call-site concat pattern: keep bare maps intact, prefix at lookup
  // site. Helper kept local + per-call (not exported) to match PR-#412 style.
  const prefixed = (bare: string | undefined, prefix: string): string | undefined =>
    bare ? `${prefix}${bare}` : undefined

  // Fix C-1 — X-sub convention. cart writes the user's sub-option pick under
  // `selections['<parent>-sub']=[subOptionId]` (roofing fascia_wood-sub,
  // soffit_wood-sub today). resolveOptionPriceKey looks for an OPTION at that
  // key and misses → leaks to missingOptionKeys + billed $0. Detect the -sub
  // suffix and route through subOptionPriceKey instead. Linear-ft semantics
  // inherit from the parent's roofAddonLinearFt entry; bare flat otherwise.
  const resolveSubGroupIdForParent = (svcId: string, parentOptionId: string): string =>
    services?.find((s) => s.id === svcId)?.optionGroups.find((g) =>
      g.options.some((o) => o.id === parentOptionId)
    )?.id ?? 'products'

  for (const item of cartItems) {
    for (const [groupId, optionIds] of Object.entries(item.selections ?? {})) {
      if (!optionIds || optionIds.length === 0) continue
      // service_type (replace/repair) is vendor-internal cost context,
      // not a customer-facing charge — excluded from homeowner-visible totals.
      if (item.serviceId === 'roofing' && groupId === 'service_type') continue
      hasSelections = true

      // Fix C-1 — X-sub routing.
      if (groupId.endsWith('-sub')) {
        const parentOptionId = groupId.slice(0, -4)
        const subGroupId = resolveSubGroupIdForParent(item.serviceId, parentOptionId)
        const roofLinFt = item.roofAddonLinearFt?.[parentOptionId]
        const includePerimeterOpt = item.roofMeasurement?.includePerimeter !== false
        const isPerimeterAddonZeroed = roofLinFt !== undefined && !includePerimeterOpt
        for (const optionId of optionIds) {
          const subKey = subOptionPriceKey(item.serviceId, subGroupId, parentOptionId, optionId)
          const basePrice = priceMap.get(subKey)
          if (basePrice === undefined) {
            missingSub.push(subKey)
            continue
          }
          coveredServices.add(item.serviceId)
          if (isPerimeterAddonZeroed) continue
          if (roofLinFt !== undefined) {
            totalCents += basePrice * roofLinFt
          } else {
            totalCents += basePrice
          }
        }
        continue
      }

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
          // Fix C-5 — pergolas multi-structure. When the user draws >1 polygon
          // (terrace + pergola etc.), the wizard writes per-structure sqft into
          // structureMeasurements[optionId]. Prefer that over scalar areaSqft
          // so the smaller structure no longer gets dropped from the bill.
          const rawSqft = isRepairOption(optionId)
            ? resolveRepairAreaSqft(item, optionId)
            : (item.customSizeSqft?.[optionId]
                ?? item.structureMeasurements?.[optionId]?.sqft
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
            // Fix C-3 — kitchen Stone/Cabinet sub-group options write their
            // linear-ft into item.subGroupLinearFt[parentOptionId]; previously
            // hit the 0 fallback and billed 0. Fix C-4 — fencing options carry
            // their length in the item-scalar perimeterFt instead of a per-id
            // map; bill against that when no per-id source is present.
            const linFt = roofLinFt
              ?? item.addonLinearFt?.[optionId]
              ?? item.subGroupLinearFt?.[optionId]
              ?? (item.serviceId === 'fencing' ? item.perimeterFt : undefined)
              ?? 0
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

  // Fix C-2 — pool addonQuantities synthetic pass. ledCount / bubblerCount /
  // laminarJets / waterfalls are stepper counts that the pool wizard writes
  // into item.addonQuantities, NOT into item.selections — so the parent-iter
  // above never touches them. Multiply basePrice × count for each entry that
  // resolves to a non-zero priceMap row. Missing rows surface in missing[]
  // so the "unpriced" UI badge stays honest.
  for (const item of cartItems) {
    if (item.serviceId !== 'pool') continue
    const counts = item.addonQuantities
    if (!counts) continue
    for (const [field, { groupId, optionId }] of Object.entries(POOL_QUANTITY_MAP) as Array<[
      keyof import('@/stores/cart-store').AddonQuantities,
      { groupId: string; optionId: string },
    ]>) {
      const qty = counts[field] ?? 0
      if (qty <= 0) continue
      hasSelections = true
      const key = resolveOptionPriceKey(services, item.serviceId, groupId, optionId, priceMap)
      const basePrice = priceMap.get(key)
      if (basePrice === undefined) {
        missing.push(key)
        continue
      }
      coveredServices.add(item.serviceId)
      totalCents += basePrice * qty
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
    // TD-fix: derive parent option's groupId by walking the catalog instead
    // of hardcoding 'products'. windows_doors today nests windows/doors/
    // storm_front/garage_doors under optionGroups.id='products' so the
    // historical literal happens to match — but any service whose parent
    // options live under a different group id would silently undersum.
    // Fallback retains 'products' for the bundled SERVICE_CATALOG offline
    // path where `services` is undefined.
    const service = services?.find((s) => s.id === serviceId)
    const deriveSubOptGroupId = (parentOptionId: string): string =>
      service?.optionGroups.find((g) => g.options.some((o) => o.id === parentOptionId))?.id ?? 'products'

    const accumulateSubOpts = (
      parentOptionId: string,
      subOptionIds: (string | undefined)[],
      quantity: number,
    ) => {
      const groupId = deriveSubOptGroupId(parentOptionId)
      for (let i = 0; i < subOptionIds.length; i++) {
        const subId = subOptionIds[i]
        if (!subId) {
          // Silent-skip telemetry: label→id map drift surfaces here when a
          // FRAME_COLOR_IDS / GLASS_COLOR_IDS / etc. label maps to undefined.
          // Push synthetic key into missingSub so the UI "unpriced" badge
          // catches it; warn in DEV so it shows up in browser console.
          if (import.meta.env.DEV) {
            console.warn(`[pricing] unresolved subOpt label for parent=${parentOptionId} dim-index=${i}`)
          }
          missingSub.push(`unresolved-label:${parentOptionId}|dim-${i}`)
          continue
        }
        hasSelections = true
        const key = subOptionPriceKey(serviceId, groupId, parentOptionId, subId)
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
          prefixed(FRAME_COLOR_IDS[w.frameColor], 'windows_'),
          prefixed(GLASS_COLOR_IDS[w.glassColor], 'windows_'),
          prefixed(GLASS_TYPE_IDS[w.glassType], 'windows_'),
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
          prefixed(FRAME_COLOR_IDS[d.frameColor], 'doors_'),
          prefixed(GLASS_COLOR_IDS[d.glassColor], 'doors_'),
          prefixed(GLASS_TYPE_IDS[d.glassType], 'doors_'),
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
          prefixed(FRAME_COLOR_IDS[sf.frameColor], 'storm_front_'),
          prefixed(GLASS_COLOR_IDS[sf.glassColor], 'storm_front_'),
          prefixed(GLASS_TYPE_IDS[sf.glassType], 'storm_front_'),
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
      // Fix C-6 — roof permit opt-out. Rod's cash-only path sets
      // roofPermit='no' on the cart item; the permit line should drop. Default
      // (undefined / 'yes') still bills the permit, matching pre-fix behavior.
      if (serviceId === 'roofing') {
        const anyRoofingItemKeepsPermit = cartItems.some(
          (it) => it.serviceId === 'roofing' && it.roofPermit !== 'no'
        )
        if (!anyRoofingItemKeepsPermit) continue
      }
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
