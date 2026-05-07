import type { CartItem } from '@/stores/cart-store'

// Project-level permit Q skip rule (per kratos directive 2026-05-07,
// CHAIN-touch dispatch authorized by Rodolfo).
//
// Skip the Q iff EVERY cart item is roofing in addons-only flow.
// Any non-roofing item OR any roofing item with material[] non-empty
// (full-replacement path) triggers the Q.
//
// Rationale: addons-only roofing (gutters, soffit/fascia replacement,
// roof inspection-style work) does not require a building permit;
// every other configured service does or may. The Q is asked once
// at cart-submit and applies project-wide.
export function shouldAskProjectPermit(items: CartItem[]): boolean {
  if (items.length === 0) return false
  return items.some((item) => itemTriggersPermit(item))
}

function itemTriggersPermit(item: CartItem): boolean {
  if (item.serviceId !== 'roofing') return true
  const materials = item.selections?.material ?? []
  return materials.length > 0
}
