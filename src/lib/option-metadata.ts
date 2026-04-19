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
}

export const OPTION_METADATA: Record<string, OptionMetadata> = {
  install_windows: { requiresQuantity: true, quantityRange: { min: 1, max: 50 } },
  install_doors: { requiresQuantity: true, quantityRange: { min: 1, max: 50 } },
}

export function getOptionMetadata(optionId: string): OptionMetadata {
  return OPTION_METADATA[optionId] ?? {}
}
