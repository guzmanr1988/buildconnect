// Neutral home for roofing per-option qty math.
//
// Lift of buildRoofingBaseLines' L111-138 (square/sqft branch) + L154-167
// (linear_ft branch) AS-IS, NOT a reimplementation. Both the snapshot writer
// (roofing-base-lines.ts) and the live renderer's qty resolver
// (resolve-option-qty.ts) import + call from here, so they cannot drift by
// construction — the moment one changes, both change.
//
// Doctrine (kratos + apollo locked 2026-06-15): reimplementing writer math
// in the renderer was the bug generator on the card-grid sectionTotalCents
// patch (roofSize=21 / gutter-drops bypass / pitched+flat sum). Lift, don't
// re-derive. This module exists strictly to hold the lifted math so the
// writer–renderer dependency forms a DAG (writer → roofing-qty, renderer →
// roofing-qty) with no edge between writer and renderer.

import {
  findCatalogOption,
  getOptionMetadata,
  sqftToSquares,
} from './option-metadata'
import {
  computeGutterTotalLinFt,
  FLAT_WASTE_FACTOR,
  isRepairOption,
  PITCHED_WASTE_FACTOR,
  resolveRepairAreaSqft,
} from './roof-pricing'
import type { CartItem } from '@/stores/cart-store'
import type { ServiceConfig } from '@/types'

const FLAT_ROOF_OPTION_ID = 'flat_roof'

export type RoofingSquareQty = {
  qty: number
  rawSqft: number
  sliceZeroed: boolean
  useSplit: boolean
  isFlat: boolean
  note?: string
}

// Lift of buildRoofingBaseLines square/sqft branch (L111-138). Returns the
// qty the writer would assign to a non-repair square/sqft roofing option for
// THIS cart item. For repair_* options the writer takes a separate
// resolveRepairAreaSqft branch (L91-110); the helper preserves that by
// dispatching early so callers can use ONE entry point for any roofing
// square/sqft option without branching.
export function resolveRoofingSquareQty(
  item: CartItem,
  optionId: string,
  services?: ServiceConfig[],
): RoofingSquareQty {
  if (isRepairOption(optionId)) {
    const rawSqft = resolveRepairAreaSqft(item, optionId)
    return {
      qty: rawSqft,
      rawSqft,
      sliceZeroed: false,
      useSplit: false,
      isFlat: optionId === 'repair_flat_roof',
    }
  }

  const areaSqft = item.roofMeasurement?.areaSqft ?? 0
  const pitchedAreaSqft = item.roofMeasurement?.pitchedAreaSqft
  const flatAreaSqft = item.roofMeasurement?.flatAreaSqft
  const hasFlatSection =
    item.roofMeasurement?.pitchedAreaSqft !== undefined &&
    item.roofMeasurement?.flatAreaSqft !== undefined

  const allMaterialIds = Object.values(item.selections ?? {}).flat()
  const hasFlatRoofSelected =
    allMaterialIds.includes(FLAT_ROOF_OPTION_ID) ||
    allMaterialIds.includes('repair_flat_roof')
  const hasPitchedSelected = allMaterialIds.some((id) => {
    if (id === FLAT_ROOF_OPTION_ID || id === 'repair_flat_roof') return false
    const sib = services ? findCatalogOption(services, 'roofing', id) : undefined
    const u = getOptionMetadata(id, 'roofing', sib).priceUnit
    return u === 'square' || u === 'sqft'
  })
  const includeMaterialOrderOpt = item.roofMeasurement?.includeMaterialOrder !== false
  const includeFlatAreaOpt = item.roofMeasurement?.includeFlatArea !== false
  const useSplit =
    hasFlatSection && hasFlatRoofSelected && hasPitchedSelected && includeMaterialOrderOpt

  const isFlat = optionId === FLAT_ROOF_OPTION_ID
  const catalogOption = services ? findCatalogOption(services, 'roofing', optionId) : undefined
  const meta = getOptionMetadata(optionId, 'roofing', catalogOption)
  const useSquares = meta.priceUnit === 'square'
  const sliceZeroed = !includeMaterialOrderOpt || (isFlat && !includeFlatAreaOpt)

  let rawSqft: number
  let note: string | undefined
  if (sliceZeroed) {
    rawSqft = 0
  } else if (useSplit) {
    if (isFlat) {
      rawSqft = flatAreaSqft ?? 0
      if (rawSqft === 0)
        note = 'No flat section detected by satellite imagery — confirm with vendor.'
    } else {
      rawSqft = pitchedAreaSqft ?? 0
      if (rawSqft === 0)
        note = 'No pitched section detected by satellite imagery — confirm with vendor.'
    }
  } else if (isFlat) {
    rawSqft = flatAreaSqft ?? areaSqft
  } else {
    rawSqft = pitchedAreaSqft ?? areaSqft
  }

  const wasteFactor = isFlat ? FLAT_WASTE_FACTOR : PITCHED_WASTE_FACTOR
  const qty = useSquares
    ? sqftToSquares(Math.round(rawSqft * wasteFactor))
    : rawSqft

  return { qty, rawSqft, sliceZeroed, useSplit, isFlat, note }
}

export type RoofingLinearFtQty = {
  effectiveLinFt: number
  gated: boolean
}

// Lift of buildRoofingBaseLines linear_ft branch (L154-167). Roofing-only:
// uses roofAddonLinearFt[optionId] (mirror writer L156). For gutters,
// routes through computeGutterTotalLinFt to add drops × per-floor.
// `gated` surfaces the includePerimeter opt-out so the writer can skip the
// line entirely while the renderer simply contributes 0.
export function resolveRoofingLinearFtQty(
  item: CartItem,
  optionId: string,
): RoofingLinearFtQty {
  const includePerimeterOpt = item.roofMeasurement?.includePerimeter !== false
  if (!includePerimeterOpt) {
    return { effectiveLinFt: 0, gated: true }
  }
  const raw = item.roofAddonLinearFt?.[optionId] ?? 0
  const effectiveLinFt =
    optionId === 'gutters'
      ? computeGutterTotalLinFt(raw, item.gutterDropsConfig)
      : raw
  return { effectiveLinFt, gated: false }
}
