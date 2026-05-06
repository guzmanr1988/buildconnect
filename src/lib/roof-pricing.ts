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
