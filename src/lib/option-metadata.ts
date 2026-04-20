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
}

export const OPTION_METADATA: Record<string, OptionMetadata> = {
  install_windows: { requiresQuantity: true, quantityRange: { min: 1, max: 50 } },
  install_doors: { requiresQuantity: true, quantityRange: { min: 1, max: 50 } },
  low_e: { supportsPercentMarkup: true },
  casement: { supportsPercentMarkup: true },
}

export function getOptionMetadata(optionId: string): OptionMetadata {
  return OPTION_METADATA[optionId] ?? {}
}
