// Pitched-singleton chip-tap constraint for roofing material multi-select.
// Rodolfo directive 2026-05-08: only ONE pitched material at a time, plus
// optional flat_roof. Allowed shapes: {pitched}, {pitched, flat_roof}, {flat_roof}.
// Disallowed: any combination with two or more pitched materials.
export const ROOFING_PITCHED_MATERIALS: ReadonlySet<string> = new Set([
  'shingle',
  'barrel_tile',
  'metal',
  'aluminum',
  'terracotta',
])

export function applyRoofingMaterialPitchedSingleton(current: string[], tappedId: string): string[] {
  if (current.includes(tappedId)) {
    return current.filter((id) => id !== tappedId)
  }
  if (ROOFING_PITCHED_MATERIALS.has(tappedId)) {
    const withoutOtherPitched = current.filter((id) => !ROOFING_PITCHED_MATERIALS.has(id))
    return [...withoutOtherPitched, tappedId]
  }
  return [...current, tappedId]
}
