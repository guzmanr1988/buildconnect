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
  flat_roof: { priceUnit: 'square' },
  // Roofing addons — vendor enters $/lin ft; quantity = homeowner's addon linear ft
  gutters: { priceUnit: 'linear_ft' },
  soffit_wood: { priceUnit: 'linear_ft' },
  fascia_wood: { priceUnit: 'linear_ft' },
}

export function getOptionMetadata(optionId: string): OptionMetadata {
  return OPTION_METADATA[optionId] ?? {}
}
