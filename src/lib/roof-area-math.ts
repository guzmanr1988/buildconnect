import { PITCHED_WASTE_FACTOR, FLAT_WASTE_FACTOR } from './roof-pricing'

/**
 * Single source of truth for roof waste-adjusted area + squares.
 * Pitched uses 2% waste (hip/valley cuts + starter-course overhang).
 * Flat uses 1% waste (membrane seams overlap on a single plane).
 * squares = ceil(wasteSqft / 100) — rounds up to next whole square.
 *
 * Display surfaces should consume pitchedWaste + flatWaste + pitchedSquares
 * + flatSquares separately. totalSqft/totalSquares are retained for backend +
 * legacy code paths only — do not render the combined values on any roof
 * measurement display surface (Rod-locked spec: pitched/flat end-to-end
 * separate, no combined number on screen).
 */
export function computeRoofTotal({
  pitchedAreaSqft,
  flatAreaSqft,
  includeMaterialOrder,
  includeFlatArea = true,
}: {
  pitchedAreaSqft: number
  flatAreaSqft: number
  includeMaterialOrder: boolean
  includeFlatArea?: boolean
}): {
  totalSqft: number
  totalSquares: number
  pitchedWaste: number
  flatWaste: number
  pitchedSquares: number
  flatSquares: number
} {
  const pitchedWaste = includeMaterialOrder
    ? Math.round((pitchedAreaSqft || 0) * PITCHED_WASTE_FACTOR)
    : 0
  const flatWaste = includeMaterialOrder && includeFlatArea
    ? Math.round((flatAreaSqft || 0) * FLAT_WASTE_FACTOR)
    : 0
  const pitchedSquares = Math.ceil(pitchedWaste / 100)
  const flatSquares = Math.ceil(flatWaste / 100)
  const totalSqft = pitchedWaste + flatWaste
  const totalSquares = Math.ceil(totalSqft / 100)
  return { totalSqft, totalSquares, pitchedWaste, flatWaste, pitchedSquares, flatSquares }
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
