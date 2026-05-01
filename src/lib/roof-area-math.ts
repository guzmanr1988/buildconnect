/**
 * Single source of truth for roof waste-adjusted area + squares.
 * Pitched uses 2% waste; flat uses 1% waste (industry standard for low-slope).
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
  const flatWaste = includeFlat ? Math.round((flatAreaSqft || 0) * 1.01) : 0
  const totalSqft = pitchedWaste + flatWaste
  const totalSquares = Math.ceil(totalSqft / 100)
  return { totalSqft, totalSquares, pitchedWaste, flatWaste }
}
