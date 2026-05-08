/**
 * Single source of truth for roof waste-adjusted area + squares.
 * Both pitched and flat use 2% waste (top-of-real bias to preserve cushion when
 * satellite under-detects flat sections by 50-100 sqft).
 * squares = ceil(totalWasteSqft / 100) — rounds up to next whole square.
 */
export function computeRoofTotal({
  pitchedAreaSqft,
  flatAreaSqft,
  includeFlat,
}: {
  pitchedAreaSqft: number
  flatAreaSqft: number
  includeFlat: boolean
}): { totalSqft: number; totalSquares: number; pitchedWaste: number; flatWaste: number } {
  const pitchedWaste = Math.round((pitchedAreaSqft || 0) * 1.02)
  const flatWaste = includeFlat ? Math.round((flatAreaSqft || 0) * 1.02) : 0
  const totalSqft = pitchedWaste + flatWaste
  const totalSquares = Math.ceil(totalSqft / 100)
  return { totalSqft, totalSquares, pitchedWaste, flatWaste }
}
