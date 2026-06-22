import type { PriceLineItem } from '@/types'

// pin-29 — pure reconcile helper. Strips prior auto_sold_adjustment lines,
// computes anchor = sum(non-adjustment lines), appends a single delta row
// (Upsale / Discount) when delta != 0. Sum of returned lines == saleAmount
// by construction. Used by markSold AND the hydrate-time backfill sweep
// (content-guarded via reconcileLinesEquivalent so identical reconciles
// do not re-write).
export function reconcileLines(
  saleAmount: number,
  current: PriceLineItem[] | undefined,
): PriceLineItem[] {
  const baseLines = (current ?? []).filter(
    (line) => line.source !== 'auto_sold_adjustment',
  )
  const anchor = baseLines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
  const delta = saleAmount - anchor
  if (delta === 0) return baseLines
  return [
    ...baseLines,
    {
      id: `auto-adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: delta > 0 ? 'Upsale' : 'Discount',
      amount: delta,
      originalAmount: 0,
      source: 'auto_sold_adjustment' as const,
    },
  ]
}

// pin-29 — content-equivalence check that ignores the volatile id +
// timestamp suffix on auto_sold_adjustment lines. Used by the hydrate
// backfill sweep to skip the persist when the reconcile result is
// content-identical to what is already stored (no write-amplification).
export function reconcileLinesEquivalent(
  a: PriceLineItem[] | undefined,
  b: PriceLineItem[] | undefined,
): boolean {
  const aa = a ?? []
  const bb = b ?? []
  if (aa.length !== bb.length) return false
  for (let i = 0; i < aa.length; i++) {
    const la = aa[i]
    const lb = bb[i]
    if (la.label !== lb.label) return false
    if ((la.amount ?? 0) !== (lb.amount ?? 0)) return false
    if (la.source !== lb.source) return false
  }
  return true
}
