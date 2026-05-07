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

export function getOptionMetadata(optionId: string, serviceId?: string): OptionMetadata {
  if (serviceId) {
    const scoped = OPTION_METADATA_BY_SERVICE[serviceId]?.[optionId]
    if (scoped) return scoped
  }
  return OPTION_METADATA[optionId] ?? {}
}
