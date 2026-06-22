// pin-31 — shared roofing base-line helper.
//
// Single SoT for roofing base lines so that:
//   1. booking-confirmation buildRoofingLineItems (display + write at sendProject)
//   2. computeVendorTotal (vendor-compare quote)
//   3. projects-store hydrate sweep (legacy backfill)
// all produce identical breakdowns that sum to the same quote.
//
// Pre-pin-31 the three paths diverged on permit handling: computeVendorTotal
// unconditionally billed the vendor's per-service permit_price_cents, while
// the display helper gated the permit line on projectPermit === 'yes'. For
// projectPermit === 'no' (homeowner signed the waiver, opted out of permit),
// the quote overcharged by the vendor permit fee and the breakdown failed
// to sum to the total. Folding the gate into the shared helper closes the
// divergence at source — quote, display, and hydrate now mirror one another.

import { findCatalogOption, getOptionMetadata } from '@/lib/option-metadata'
import { isRepairOption, resolveRepairAreaSqft } from '@/lib/roof-pricing'
import {
  resolveRoofingLinearFtQty,
  resolveRoofingSquareQty,
} from '@/lib/roofing-qty'
import { resolveOptionPriceKey, type VendorPriceMap, type VendorPermitMap } from '@/lib/api/pricing'
import type { CartItem } from '@/stores/cart-store'
import type { PriceLineItem, ServiceConfig } from '@/types'

export type ProjectPermitChoice = 'yes' | 'no' | undefined

// Build per-line roofing breakdown for ONE cart item against ONE vendor's
// catalog. Returns null when no priced lines can be computed (caller falls
// back to preset / undefined).
//
// Permit handling — projectPermit drives the permit row label/amount:
//   'yes'      → permit row at vendor permit_price_cents (or "Permit — no price" $0
//                when vendor has not seeded one)
//   'no'       → permit row at $0 with the no-permit / cash-only label
//   undefined  → assume permit is charged when vendor has seeded one. This
//                matches pre-pin-31 computeVendorTotal behavior (unconditional
//                add) and is the safe default for legacy hydrate where the
//                project_permit signal was never persisted. Callers that
//                have the homeowner's choice in hand should always pass it
//                explicitly.
export function buildRoofingBaseLines(
  item: CartItem,
  projectPermit: ProjectPermitChoice,
  priceMap: VendorPriceMap,
  permitMap: VendorPermitMap | undefined,
  services?: ServiceConfig[],
): PriceLineItem[] | null {
  const lines: PriceLineItem[] = []
  let anyComputed = false

  for (const [groupId, optionIds] of Object.entries(item.selections ?? {})) {
    if (groupId === 'service_type') continue
    for (const optionId of optionIds) {
      const key = resolveOptionPriceKey(services, 'roofing', groupId, optionId, priceMap)
      const priceCents = priceMap.get(key)
      if (priceCents === undefined) continue

      const catalogOption = services ? findCatalogOption(services, 'roofing', optionId) : undefined
      const meta = getOptionMetadata(optionId, 'roofing', catalogOption)
      const unitRateDollars = priceCents / 100

      if (meta.priceUnit === 'square' || meta.priceUnit === 'sqft') {
        if (isRepairOption(optionId)) {
          const rawSqft = resolveRepairAreaSqft(item, optionId)
          const amount = Math.round(unitRateDollars * rawSqft * 100) / 100
          const labelName = optionId
            .replace(/^repair_/, '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
          lines.push({
            id: `roofing-repair-${optionId}`,
            label: `Repair — ${labelName}`,
            amount,
            originalAmount: amount,
            source: 'preset_calculated',
            priceUnit: 'sqft',
            unitRate: unitRateDollars,
            unitQuantity: rawSqft,
          })
          anyComputed = true
          continue
        }
        const { qty, useSplit, isFlat, note } = resolveRoofingSquareQty(
          item,
          optionId,
          services,
        )
        const useSquares = meta.priceUnit === 'square'
        const amount = Math.round(unitRateDollars * qty * 100) / 100
        const labelName = optionId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        const areaLabel = useSplit ? (isFlat ? ' (flat section)' : ' (pitched section)') : ''
        lines.push({
          id: `roofing-material-${optionId}`,
          label: `Material — ${labelName}${areaLabel}`,
          amount,
          originalAmount: amount,
          source: 'preset_calculated',
          priceUnit: useSquares ? 'square' : 'sqft',
          unitRate: unitRateDollars,
          unitQuantity: qty,
          ...(note ? { note } : {}),
        } as PriceLineItem & { note?: string })
        anyComputed = true
      } else if (meta.priceUnit === 'linear_ft') {
        const { effectiveLinFt, gated } = resolveRoofingLinearFtQty(item, optionId)
        if (gated) continue
        if (effectiveLinFt > 0) {
          const amount = Math.round(unitRateDollars * effectiveLinFt * 100) / 100
          lines.push({
            id: `roofing-addon-${optionId}`,
            label: `${optionId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
            amount,
            originalAmount: amount,
            source: 'preset_calculated',
            priceUnit: 'linear_ft',
            unitRate: unitRateDollars,
            unitQuantity: effectiveLinFt,
          })
          anyComputed = true
        }
      }
    }
  }

  if (!anyComputed) return null

  // Permit gate — projectPermit drives the row. Customer opt-out ('no') with
  // signed waiver means no permit pulled, no charge. 'yes' bills vendor's
  // permit_price_cents (or renders a $0 "no price" row when vendor has not
  // seeded one). undefined = legacy hydrate fallback: assume the quote did
  // bill the permit (matches pre-pin-31 computeVendorTotal unconditional
  // behavior). Falls back to legacy per-item item.roofPermit when project-
  // level signal absent (widen-reads-narrow-writes).
  const permitChoice: ProjectPermitChoice =
    projectPermit ?? ((item.roofPermit as 'yes' | 'no' | undefined) ?? undefined)
  const permitCents = permitMap?.get(item.serviceId) ?? 0

  if (permitChoice === 'yes' || (permitChoice === undefined && permitCents > 0)) {
    if (permitCents > 0) {
      lines.push({
        id: 'roofing-permit',
        label: 'Permit',
        amount: Math.round(permitCents) / 100,
        originalAmount: Math.round(permitCents) / 100,
        source: 'preset_calculated' as const,
      })
    } else {
      lines.push({
        id: 'roofing-permit',
        label: 'Permit — no price',
        amount: 0,
        originalAmount: 0,
        source: 'preset_calculated' as const,
      })
    }
  } else {
    lines.push({
      id: 'roofing-permit',
      label: 'Permit — no permit, no price',
      amount: 0,
      originalAmount: 0,
      source: 'preset_calculated' as const,
    })
  }

  return lines
}

// Sum of base-line amounts in dollars (rounded to integer cents). Helper for
// hydrate-time sanity asserts and for tests.
export function sumRoofingBaseLines(lines: PriceLineItem[]): number {
  return Math.round(lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100
}
