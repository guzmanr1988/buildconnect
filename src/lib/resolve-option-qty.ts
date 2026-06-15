// Per-option quantity resolver for the live renderer.
//
// Bridges the live project-items-card-grid sectionTotalCents path to the
// same qty logic the snapshot writer (buildRoofingBaseLines) uses, so live
// display reconciles to the billed snapshot in lockstep on the exact qty.
// Pre-fix the renderer read selectionQuantities[optId] ?? 1, qty-blind to
// roofAddonLinearFt (linear_ft addons) and area materials, undercounting
// Donald's $33,082 of vendor project-details dialog totals.
//
// Doctrine (kratos + apollo 2026-06-15 trio):
//   1. writer-source-authority for qty/measurement/adjustment
//   2. live-catalog-authority for RATE only (narrow exception)
//   3. shared helper must be writer logic EXTRACTED, not reimplemented
//
// (3) is enforced by depending on src/lib/roofing-qty.ts — the neutral home
// for the lifted writer math. The writer (roofing-base-lines.ts) and this
// resolver both import from there; neither imports the other; the math
// lives ONCE and cannot drift by construction.
//
// Service-gated dispatch:
//   serviceId === 'roofing'         square/sqft → resolveRoofingSquareQty
//                                   linear_ft   → resolveRoofingLinearFtQty
//   non-roofing linear_ft           addonLinearFt ?? subGroupLinearFt ?? 0
//                                   (pool_fence / kitchen-sub_options; their
//                                   own writers consume those fields).
//   non-roofing sqft                customSizeSqft ?? roofMeasurement.areaSqft
//   default                         selectionQuantities[optId] ?? 1
//                                   (flat-priced WD selections etc.).
//
// `services` is optional: when omitted, the catalog-overlay-aware
// hasPitchedSelected check inside resolveRoofingSquareQty falls back to
// static OPTION_METADATA. Renderers without ready service-list access pass
// undefined; the writer passes its services arg through.

import { getOptionMetadata } from './option-metadata'
import {
  resolveRoofingLinearFtQty,
  resolveRoofingSquareQty,
} from './roofing-qty'
import type { CartItem } from '@/stores/cart-store'
import type { ServiceConfig, ServiceOption } from '@/types'

export function resolveOptionQty(
  item: CartItem,
  optionId: string,
  serviceId: string,
  catalogOption?: ServiceOption,
  services?: ServiceConfig[],
): number {
  const meta = getOptionMetadata(optionId, serviceId, catalogOption)

  if (meta.priceUnit === 'linear_ft') {
    if (serviceId === 'roofing') {
      return resolveRoofingLinearFtQty(item, optionId).effectiveLinFt
    }
    // Non-roofing linear_ft: pool_fence reads addonLinearFt, kitchen sub_options
    // read subGroupLinearFt — mirror those writers. For roofing this branch is
    // dead code (cart-write path at service-detail.tsx never lands those keys
    // on a roofing CartItem; verified by apollo walker, msg 1781496309722).
    return (
      item.addonLinearFt?.[optionId] ??
      item.subGroupLinearFt?.[optionId] ??
      0
    )
  }

  if (meta.priceUnit === 'square' || meta.priceUnit === 'sqft') {
    if (serviceId === 'roofing') {
      return resolveRoofingSquareQty(item, optionId, services).qty
    }
    if (meta.priceUnit === 'sqft') {
      return item.customSizeSqft?.[optionId] ?? item.roofMeasurement?.areaSqft ?? 0
    }
  }

  return item.selectionQuantities?.[optionId] ?? 1
}
