/**
 * Single source of truth for roof waste-adjusted area + squares.
 * Both pitched and flat use 2% waste (top-of-real bias to preserve cushion when
 * satellite under-detects flat sections by 50-100 sqft).
 * squares = ceil(totalWasteSqft / 100) — rounds up to next whole square.
 */
export function computeRoofTotal({
  pitchedAreaSqft,
  flatAreaSqft,
  includeMaterialOrder,
}: {
  pitchedAreaSqft: number
  flatAreaSqft: number
  includeMaterialOrder: boolean
}): { totalSqft: number; totalSquares: number; pitchedWaste: number; flatWaste: number } {
  const pitchedWaste = includeMaterialOrder ? Math.round((pitchedAreaSqft || 0) * 1.02) : 0
  const flatWaste = includeMaterialOrder ? Math.round((flatAreaSqft || 0) * 1.02) : 0
  const totalSqft = pitchedWaste + flatWaste
  const totalSquares = Math.ceil(totalSqft / 100)
  return { totalSqft, totalSquares, pitchedWaste, flatWaste }
}

// Under-quote guard threshold — single source of truth shared by wizard Step 2
// display-truth (RED NOT-INCLUDED framing on Pitched row) and service-detail
// pre-Add commit gate (Add-to-Project disabled until acknowledged or pitched
// chip-tap selected). Per banked project_buildconnect_quote_top_of_real:
// satellite under-detection is launch-blocker class — quotes err HIGH not LOW.
//
// Triggers when chip-tap = no pitched material AND the satellite measured a
// significant pitched area: pitched > 200 sqft AND pitched > 20% of measured
// total. Both gates so a tiny 250-sqft pitched on a 2000-flat roof does not
// fire, but a 2000-pitched-vs-400-flat absolutely does.
export const PITCHED_OMITTED_MIN_SQFT = 200
export const PITCHED_OMITTED_MIN_SHARE = 0.20

export function evalPitchedOmittedTriggered({
  pitchedAreaSqft,
  flatAreaSqft,
  hasPitchedMaterialSelected,
}: {
  pitchedAreaSqft: number
  flatAreaSqft: number
  hasPitchedMaterialSelected: boolean
}): boolean {
  if (hasPitchedMaterialSelected) return false
  const total = (pitchedAreaSqft || 0) + (flatAreaSqft || 0)
  if (total <= 0) return false
  return pitchedAreaSqft > PITCHED_OMITTED_MIN_SQFT && pitchedAreaSqft / total > PITCHED_OMITTED_MIN_SHARE
}
