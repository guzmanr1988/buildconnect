/*
 * Option metadata — FE-only overlay keyed by business option_id.
 *
 * Holds rendering + math flags that do NOT need a DB round-trip (quantity
 * steppers, per-unit modifiers, future display-only markers). Kept out of
 * the DB because they are stable FE configuration, not admin-editable data.
 *
 * When the service-detail configurator renders a ServiceOption, or when
 * lib/api/pricing.ts computes a total, they consult this map to decide if
 * an option needs a quantity stepper (W+D installation scope only as of
 * 2026-04-19 per kratos msg 1776569779716).
 */

import type { ServiceConfig, ServiceOption } from '@/types'

export type OptionMetadata = {
  requiresQuantity?: boolean
  quantityRange?: { min: number; max: number }
  // Enables dual $ / % pricing UI on /vendor/catalog — vendor sees a second
  // Input for percent markup alongside the $ price. When both are set, the
  // effective price is base + (base × percent/100). Currently FE-only until
  // Tranche-2 adds a Supabase column for the percent (vendor_option_prices
  // has only price_cents today, no percent column).
  supportsPercentMarkup?: boolean
  // Unit pricing mode for this option. When set, the vendor enters a
  // per-unit rate and the total is computed at booking time by multiplying
  // rate × homeowner's measured quantity.
  // flat = single dollar amount (default, all non-roofing options).
  // square = $/roofing-square (1 square = 100 sqft); quantity = sqftToSquares(wasteSqft).
  // sqft = legacy per-sqft (widen-reads: keep valid for older persisted line items).
  // linear_ft = per linear foot for gutters/soffit/fascia.
  priceUnit?: 'flat' | 'square' | 'sqft' | 'linear_ft'
}

// 1 roofing square = 100 sqft. Returns the square count rounded to nearest integer.
// Dev-mode invariant: result × 100 is within ±50 sqft of the input.
export function sqftToSquares(sqft: number): number {
  const squares = Math.round(sqft / 100)
  if (import.meta.env.DEV) {
    console.assert(
      Math.abs(squares * 100 - sqft) <= 50,
      `[roof-squares] rounding gap > 50: ${squares * 100} vs ${sqft}`,
    )
  }
  return squares
}

export const OPTION_METADATA: Record<string, OptionMetadata> = {
  install_windows: { requiresQuantity: true, quantityRange: { min: 1, max: 50 } },
  install_doors: { requiresQuantity: true, quantityRange: { min: 1, max: 50 } },
  install_storm_front: { requiresQuantity: true, quantityRange: { min: 1, max: 50 } },
  low_e: { supportsPercentMarkup: true },
  casement: { supportsPercentMarkup: true },
  // Roofing materials — vendor enters $/square (1 sq = 100 sqft); quantity = waste-included squares
  metal: { priceUnit: 'square' },
  shingle: { priceUnit: 'square' },
  barrel_tile: { priceUnit: 'square' },
  aluminum: { priceUnit: 'square' },
  flat_roof: { priceUnit: 'square' },
  // Roofing addons — vendor enters $/lin ft; quantity = homeowner's addon linear ft
  gutters: { priceUnit: 'linear_ft' },
  soffit_wood: { priceUnit: 'linear_ft' },
  fascia_wood: { priceUnit: 'linear_ft' },
  soffit_metal: { priceUnit: 'linear_ft' },
  fascia_metal: { priceUnit: 'linear_ft' },
  // Attic Insulation — vendor enters $/sqft. Area sourced from
  // roofMeasurement.areaSqft (plain footprint from the roof wizard's
  // satellite measurement). Per Rodolfo: same sqft as roof, not
  // pitched-area or flat-area.
  insulation: { priceUnit: 'sqft' },
  // Pool fence addon — perimeter linear ft, vendor enters $/lin ft. Unique to
  // pool service, no collision so safe in the global map.
  pool_fence: { priceUnit: 'linear_ft' },
  // Per-material repair rates — vendor enters $/sqft. 6 distinct rows so
  // vendors can price repair work per the underlying material being
  // patched. Area source TBD pending Rodolfo verdict (full-roof footprint
  // vs per-actual-repaired-sqft entered by homeowner). Per-service-scoped
  // ids prefixed repair_ to avoid collision with the existing material
  // option ids (shingle/metal/etc) which carry priceUnit:square for full-
  // replacement billing.
  repair_shingle: { priceUnit: 'sqft' },
  repair_barrel_tile: { priceUnit: 'sqft' },
  repair_metal: { priceUnit: 'sqft' },
  repair_aluminum: { priceUnit: 'sqft' },
  repair_flat_roof: { priceUnit: 'sqft' },

  // PR-#412 — namespaced sub_option slugs added as FE prereq to the
  // hermes substrate rename (renames 32 colliding bare sub_option_ids to
  // parent-prefixed literals so vendor-catalog-store enabledOptions[groupId]
  // bucket can no longer cross-contaminate sibling subgroups, complementing
  // PR-#410 renderer-side ancestor-path scoping). Hermes UPDATEs DB rows
  // pinned by uuid id (FK plumbing safe); FE consumers that route through
  // OPTION_METADATA need the new keys present or they fall back to {}
  // (no priceUnit / no supportsPercentMarkup), regressing the
  // supportsPercentMarkup vendor UI for low_e on each parent. Bare-slug
  // entries above remain for hot-swap safety + offline-bundled
  // SERVICE_CATALOG fallback (constants.ts still emits bare ids).
  //
  // Roofing addons: substrate parent fascia_wood / soffit_wood holds a
  // sub_group whose leaf sub_option_id is bare 'metal'. New keys carry
  // priceUnit:'linear_ft' (trim per linear foot) instead of the bare
  // 'metal' entry's priceUnit:'square' (roofing material) — that wrong-
  // bucket inheritance was the silent companion to the toggle cross-
  // contamination Rod surfaced before PR-#410.
  fascia_wood_metal: { priceUnit: 'linear_ft' },
  soffit_wood_metal: { priceUnit: 'linear_ft' },

  // Windows / Doors / Storm Front frame colors — display-only, no priceUnit
  windows_white: {},
  windows_bronze: {},
  windows_black: {},
  doors_white: {},
  doors_bronze: {},
  doors_black: {},
  storm_front_white: {},
  storm_front_bronze: {},
  storm_front_black: {},

  // Windows / Doors / Storm Front glass colors — display-only
  windows_clear: {},
  windows_clear_white: {},
  windows_gray: {},
  windows_green: {},
  windows_grey_white: {},
  doors_clear: {},
  doors_clear_white: {},
  doors_gray: {},
  doors_green: {},
  doors_grey_white: {},
  storm_front_clear: {},
  storm_front_clear_white: {},
  storm_front_gray: {},
  storm_front_green: {},
  storm_front_grey_white: {},

  // Windows / Doors / Storm Front glass types — low_e carries the
  // supportsPercentMarkup flag preserved from the bare 'low_e' entry
  // (vendor sees % markup input alongside $ price for each parent's low_e).
  windows_impact_glass: {},
  windows_low_e: { supportsPercentMarkup: true },
  doors_impact_glass: {},
  doors_low_e: { supportsPercentMarkup: true },
  storm_front_impact_glass: {},
  storm_front_low_e: { supportsPercentMarkup: true },
}

// Per-service overrides — for option_ids that collide across services with
// different pricing semantics (e.g. 'pavers' is sqft in pool_floor but flat in
// driveways surface; 'custom' is sqft for pool_size but flat for pergola size).
// When set for (serviceId, optionId), this WINS over the global OPTION_METADATA.
export const OPTION_METADATA_BY_SERVICE: Record<string, Record<string, OptionMetadata>> = {
  pool: {
    // Pool size 'custom' — homeowner enters numeric sqft (placeholder e.g. 20x40).
    custom: { priceUnit: 'sqft' },
    // Pool floor surfaces — SEPARATE sqft measurement from pool itself (per
    // Rodolfo Q2: floor priced independently against its own area).
    travertine: { priceUnit: 'sqft' },
    pavers: { priceUnit: 'sqft' },
    stamped_concrete: { priceUnit: 'sqft' },
    cement_floor: { priceUnit: 'sqft' },
    artificial_turf: { priceUnit: 'sqft' },
    square_concrete: { priceUnit: 'sqft' },
  },
  driveways: {
    // square_concrete added to driveways as $/sqft against cart.areaSqft (from
    // SatelliteMeasure). Existing driveway surfaces (pavers/stamped/asphalt/
    // stone) intentionally stay flat — flipping them mid-PR would break every
    // vendor who already priced flat. Follow-up PR for legacy migration.
    square_concrete: { priceUnit: 'sqft' },
  },
}

export function getOptionMetadata(
  optionId: string,
  serviceId?: string,
  option?: {
    priceUnit?: 'flat' | 'square' | 'sqft' | 'linear_ft'
    inputType?: 'tile-select' | 'number-input'
  },
): OptionMetadata {
  // Catalog-overlay wins (admin-edited per option); falls back to the static
  // map below for older rows that don't carry priceUnit / inputType yet. The
  // static map remains the source of truth for install_windows / install_doors /
  // install_storm_front (where requiresQuantity has been wired since 2026-04-19);
  // catalog-overlay extends that mechanism to net-new options that carry
  // inputType='number-input' as catalog data (migration 063+).
  const fallback: OptionMetadata = serviceId
    ? OPTION_METADATA_BY_SERVICE[serviceId]?.[optionId] ?? OPTION_METADATA[optionId] ?? {}
    : OPTION_METADATA[optionId] ?? {}
  let overlay: OptionMetadata = fallback
  if (option?.priceUnit) {
    overlay = { ...overlay, priceUnit: option.priceUnit }
  }
  if (option?.inputType === 'number-input') {
    // Per-option inputType opts INTO the requiresQuantity rendering+pricing path.
    // Quantity range defaults to a generous 1..9999 when no static entry exists;
    // static entries (install_windows/doors/storm_front) keep their tighter 1..50
    // bounds via the fallback merge order.
    overlay = {
      ...overlay,
      requiresQuantity: true,
      ...(overlay.quantityRange ? {} : { quantityRange: { min: 1, max: 9999 } }),
    }
  }
  return overlay
}

// Walk a service's option-groups + sub-groups for an option by id. Used by
// pricing consumers (computeVendorTotal, buildRoofingLineItems) to pass the
// matched option into getOptionMetadata so the catalog priceUnit overlay
// applies to net-new admin-added options that have no static OPTION_METADATA
// entry. Returns undefined when the (serviceId, optionId) pair isn't in the
// catalog — caller falls back to the static map by passing undefined.
export function findCatalogOption(
  services: ServiceConfig[],
  serviceId: string,
  optionId: string,
): ServiceOption | undefined {
  const service = services.find((s) => s.id === serviceId)
  if (!service) return undefined
  for (const group of service.optionGroups) {
    const direct = group.options.find((o) => o.id === optionId)
    if (direct) return direct
    for (const opt of group.options) {
      if (!opt.subGroups) continue
      for (const sub of opt.subGroups) {
        const subOpt = sub.options.find((o) => o.id === optionId)
        if (subOpt) return subOpt
      }
    }
  }
  return undefined
}
