/**
 * Pure-fn replay of homeowner wizard userActions.
 *
 * The roofing-wizard surface accumulates state from chip-taps, addon
 * toggles, and section-level include toggles (material-order, perimeter).
 * The pricing-protection runner replays a recorded userActions[] sequence
 * to derive the same selections + section-include flags the live wizard
 * would produce — without mounting React or jsdom.
 *
 * Section-include toggles default to true (everything in the order); an
 * explicit toggle action flips the section off. Chip-taps populate the
 * selections record (materials + addons) but no longer derive section
 * defaults — pitched and flat are bundled under a single material-order
 * toggle (per Rod's section-header design).
 */

export type UserAction = {
  step: 1 | 2 | 3
  type: 'chip-tap' | 'addon-toggle' | 'include-material-order-toggle' | 'include-perimeter-toggle'
  value: string | boolean
}

export type ReplayResult = {
  /** Materials selected from chip-taps, in tap order (de-duplicated). */
  materials: string[]
  /** Addons selected from toggles, in toggle order (de-duplicated, off removes). */
  addons: string[]
  /** Effective includeMaterialOrder after explicit toggles (defaults true). */
  includeMaterialOrder: boolean
  /** Effective includePerimeter after explicit toggles (defaults true). */
  includePerimeter: boolean
}

/**
 * Resolve includeMaterialOrder from the action stream. Defaults true; the
 * last include-material-order-toggle action with a boolean value wins.
 */
export function resolveIncludeMaterialOrder(actions: UserAction[]): boolean {
  let includeMaterialOrder = true
  for (const a of actions) {
    if (a.type === 'include-material-order-toggle' && typeof a.value === 'boolean') {
      includeMaterialOrder = a.value
    }
  }
  return includeMaterialOrder
}

/**
 * Resolve includePerimeter from the action stream. Defaults true; the
 * last include-perimeter-toggle action with a boolean value wins.
 */
export function resolveIncludePerimeter(actions: UserAction[]): boolean {
  let includePerimeter = true
  for (const a of actions) {
    if (a.type === 'include-perimeter-toggle' && typeof a.value === 'boolean') {
      includePerimeter = a.value
    }
  }
  return includePerimeter
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

/** Convenience: replay actions to a single result struct. */
export function replayUserActions(actions: UserAction[]): ReplayResult {
  const sels = buildSelections(actions)
  return {
    materials: sels.material ?? [],
    addons: sels.addons ?? [],
    includeMaterialOrder: resolveIncludeMaterialOrder(actions),
    includePerimeter: resolveIncludePerimeter(actions),
  }
}
