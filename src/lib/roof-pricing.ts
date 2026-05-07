// Single source of truth for the roof waste factor applied to raw measurements
// before converting to squares. Change here propagates to all display + pricing surfaces.
export const ROOF_WASTE_FACTOR = 1.02

// Gutter total = perimeter + drops × per-floor downspout run. Per-floor
// constants are industry rule-of-thumb (1-story ~10 ft, 2-story ~25 ft).
// Single source of truth for wizard breakdown UI, project-summary modal,
// review step, and vendor-compare price math.
export const GUTTER_DROP_FT_BY_FLOORS = { 1: 10, 2: 25 } as const

export type GutterDropsConfig = { floors: 1 | 2; drops: number }

export function computeGutterTotalLinFt(
  perimeterFt: number,
  config: GutterDropsConfig | undefined,
): number {
  if (!config) return perimeterFt
  return perimeterFt + config.drops * GUTTER_DROP_FT_BY_FLOORS[config.floors]
}

// Per-material repair area resolver — single SoT for repair_<material> sqft
// pricing. Used by vendor-compare totals (lib/api/pricing.ts) AND booking
// confirmation line-items (homeowner/pages/booking-confirmation.tsx) so the
// numbers shown on /cart and /booking-confirmation reconcile per Math-is-god.
//
// Per Rodolfo verdict 2026-05-07 (option iii): each repair_<material> line
// bills the vendor's per-sqft rate against that material's existing area
// measurement.
export type RoofRepairItemShape = {
  roofMeasurement?: { areaSqft?: number; pitchedAreaSqft?: number; flatAreaSqft?: number }
  metalRoofSelection?: { roofSize?: string }
}

export function isRepairOption(optionId: string): boolean {
  return optionId.startsWith('repair_')
}

export function resolveRepairAreaSqft(item: RoofRepairItemShape, optionId: string): number {
  const rm = item.roofMeasurement
  if (optionId === 'repair_flat_roof') {
    return rm?.flatAreaSqft ?? rm?.areaSqft ?? 0
  }
  if (optionId === 'repair_metal' || optionId === 'repair_aluminum') {
    const metalSqft = item.metalRoofSelection?.roofSize
      ? Number(item.metalRoofSelection.roofSize) * 100
      : 0
    if (metalSqft > 0) return metalSqft
    return rm?.pitchedAreaSqft ?? rm?.areaSqft ?? 0
  }
  return rm?.pitchedAreaSqft ?? rm?.areaSqft ?? 0
}
