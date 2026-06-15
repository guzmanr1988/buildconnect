// Single SoT for per-option quantity resolution across snapshot writer and
// live renderer. Pre-fix the live project-items-card-grid renderer reads
// selectionQuantities[optId] ?? 1, which is qty-blind to roofAddonLinearFt
// (linear_ft addons) and the area materials. The snapshot writer
// (buildRoofingBaseLines) carried the correct shape; this helper extracts
// it so both paths produce identical squares / lin ft for the same cart
// item — live display reconciles to the billed snapshot, not just within
// rounding but in lockstep on the exact qty.
//
// Governing rule (kratos 2026-06-15): live RATES × frozen-MEASURED qty.
// RATE comes from the live vendor catalog (outside the resolver). QUANTITY
// is a physical property of THIS roof, measured once at sale, and the
// resolver returns the SAME qty the writer used at snapshot time. Anything
// else reintroduces snapshot-vs-live divergence — the exact class this
// patch kills. The resolver MIRRORS the writer at roofing-base-lines.ts;
// any fallback the writer doesn't have, the resolver doesn't have either
// (configurator *Selection.roofSize is explicitly NOT a writer source, so
// the resolver returns 0 when roofMeasurement is absent — matches the
// writer producing a $0 line).
//
// Behavior is keyed off the resolved meta.priceUnit from getOptionMetadata
// (catalog-overlay-aware — admin-set price_unit on options row wins over
// static OPTION_METADATA; matches the WD-B Q1 hardening from 2026-06-13).
//
//   linear_ft → roofAddonLinearFt[optId] ?? addonLinearFt[optId] ??
//               subGroupLinearFt[optId] ?? 0; gutters route through
//               computeGutterTotalLinFt to add drops × per-floor.
//   square    → sqftToSquares(round(roofMeasurement.{pitched|flat|area}Sqft
//               × waste-factor)) — SAME source as the snapshot writer's
//               common path. Returns 0 when roofMeasurement is absent
//               (writer-mirror; no roofSize fallback).
//   sqft      → customSizeSqft[optId] ?? roofMeasurement.areaSqft ?? 0.
//   default   → selectionQuantities[optId] ?? 1 (preserves pre-fix
//               behavior for flat-priced WD selections etc.).

import { getOptionMetadata, sqftToSquares } from './option-metadata'
import {
  computeGutterTotalLinFt,
  FLAT_WASTE_FACTOR,
  PITCHED_WASTE_FACTOR,
} from './roof-pricing'
import type { CartItem } from '@/stores/cart-store'
import type { ServiceOption } from '@/types'

const FLAT_AREA_OPT_IDS = new Set(['flat_roof', 'repair_flat_roof'])

export function resolveOptionQty(
  item: CartItem,
  optionId: string,
  serviceId: string,
  catalogOption?: ServiceOption,
): number {
  const meta = getOptionMetadata(optionId, serviceId, catalogOption)

  if (meta.priceUnit === 'linear_ft') {
    const raw =
      item.roofAddonLinearFt?.[optionId] ??
      item.addonLinearFt?.[optionId] ??
      item.subGroupLinearFt?.[optionId] ??
      0
    return optionId === 'gutters'
      ? computeGutterTotalLinFt(raw, item.gutterDropsConfig)
      : raw
  }

  if (meta.priceUnit === 'square') {
    const isFlat = FLAT_AREA_OPT_IDS.has(optionId)
    const m = item.roofMeasurement
    const primary = isFlat ? m?.flatAreaSqft : m?.pitchedAreaSqft
    const rawSqft = primary ?? m?.areaSqft ?? 0
    if (rawSqft <= 0) return 0
    const wasteFactor = isFlat ? FLAT_WASTE_FACTOR : PITCHED_WASTE_FACTOR
    return sqftToSquares(Math.round(rawSqft * wasteFactor))
  }

  if (meta.priceUnit === 'sqft') {
    return item.customSizeSqft?.[optionId] ?? item.roofMeasurement?.areaSqft ?? 0
  }

  return item.selectionQuantities?.[optionId] ?? 1
}
