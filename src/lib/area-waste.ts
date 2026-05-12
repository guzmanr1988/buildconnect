// Per-service waste factors applied to satellite-measured raw area.
// Driveway pours carry a higher cut-loss factor than other ground-area
// services because the slab is sized to the perimeter edge — corner
// trim + overspread on grade ends up wasting more material per finished
// sqft. Pergolas/fencing measure to the structure footprint where the
// finished install matches the raw measurement, so they pass through
// unmodified.
//
// Single source of truth: every display surface (homeowner cart panel,
// confirm button label, summary readout, vendor lead-card) and cost
// layer (sqft-priced options in pricing.ts) routes through
// applyAreaWaste. Per feedback_format_sot_shared_helper +
// feedback_display_vs_cost_layer_separate_audits — same helper,
// audited at both layers separately when extending.
export const DRIVEWAY_WASTE_FACTOR = 1.03

export function applyAreaWaste(serviceId: string, rawSqft: number): number {
  if (serviceId === 'driveways') {
    return Math.round(rawSqft * DRIVEWAY_WASTE_FACTOR)
  }
  return rawSqft
}
