/**
 * Pure-fn replay of homeowner wizard userActions.
 *
 * The roofing-wizard surface accumulates state from chip-taps, addon
 * toggles, and include-flat toggles. The pricing-protection runner replays
 * a recorded userActions[] sequence to derive the same selections and
 * includeFlat-default the live wizard would produce — without mounting
 * React or jsdom.
 *
 * Mirrors the chip-tap-as-SoT logic in roof-measurement-wizard.tsx +
 * roofing-wizard.tsx handleWizardComplete: when the homeowner taps a
 * pitched-material chip, includeFlat defaults false; when they tap
 * flat_roof (alone or alongside pitched), includeFlat defaults true.
 * Explicit include-flat-toggle actions override the chip-derived default.
 */

export type UserAction = {
  step: 1 | 2 | 3
  type: 'chip-tap' | 'addon-toggle' | 'include-flat-toggle' | 'include-pitched-toggle'
  value: string | boolean
}

export type ReplayResult = {
  /** Materials selected from chip-taps, in tap order (de-duplicated). */
  materials: string[]
  /** Addons selected from toggles, in toggle order (de-duplicated, off removes). */
  addons: string[]
  /** Effective includeFlat after chip-tap derivation + explicit toggles. */
  includeFlat: boolean
  /** Effective includePitched after explicit toggles. Default true (mount). */
  includePitched: boolean
}

/**
 * Resolve the includeFlat default from a chip-tap sequence.
 *
 * - tap on flat_roof (alone OR alongside pitched) -> true
 * - tap on a pitched material (no flat_roof tapped) -> false
 * - explicit include-flat-toggle action overrides the chip-derived default
 */
export function resolveIncludeFlat(actions: UserAction[]): boolean {
  let includeFlat = false
  let chipSeen = false
  for (const a of actions) {
    if (a.type === 'chip-tap' && typeof a.value === 'string') {
      chipSeen = true
      if (a.value === 'flat_roof') includeFlat = true
    } else if (a.type === 'include-flat-toggle' && typeof a.value === 'boolean') {
      includeFlat = a.value
    }
  }
  // No chip-tap, no explicit toggle -> default false (matches wizard mount).
  if (!chipSeen) return includeFlat
  return includeFlat
}

/**
 * Build the selections record (groupId -> optionId[]) the cart consumes.
 * For roofing, chip-taps populate selections.material; addon-toggles populate
 * selections.addons. Multi-tap on the same chip toggles it off (matching
 * wizard chip-tap behavior).
 */
export function buildSelections(actions: UserAction[]): Record<string, string[]> {
  const materials = new Set<string>()
  const addons = new Set<string>()
  for (const a of actions) {
    if (a.type === 'chip-tap' && typeof a.value === 'string') {
      if (materials.has(a.value)) materials.delete(a.value)
      else materials.add(a.value)
    } else if (a.type === 'addon-toggle' && typeof a.value === 'string') {
      if (addons.has(a.value)) addons.delete(a.value)
      else addons.add(a.value)
    }
  }
  const out: Record<string, string[]> = {}
  if (materials.size > 0) out.material = Array.from(materials)
  if (addons.size > 0) out.addons = Array.from(addons)
  return out
}

/**
 * Resolve the includePitched default from a toggle sequence. Defaults true
 * on wizard mount (pitched is the dominant case). Explicit
 * include-pitched-toggle actions override.
 */
export function resolveIncludePitched(actions: UserAction[]): boolean {
  let includePitched = true
  for (const a of actions) {
    if (a.type === 'include-pitched-toggle' && typeof a.value === 'boolean') {
      includePitched = a.value
    }
  }
  return includePitched
}

/** Convenience: replay actions to a single result struct. */
export function replayUserActions(actions: UserAction[]): ReplayResult {
  const sels = buildSelections(actions)
  const includeFlat = resolveIncludeFlat(actions)
  const includePitched = resolveIncludePitched(actions)
  return {
    materials: sels.material ?? [],
    addons: sels.addons ?? [],
    includeFlat,
    includePitched,
  }
}
