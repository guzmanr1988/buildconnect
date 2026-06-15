#!/usr/bin/env node
/**
 * Live project-items-card-grid sectionTotalCents qty-resolver lockstep
 * runner. Pins the math contract introduced by the resolver and the
 * roofing-qty.ts neutral module that extracts buildRoofingBaseLines'
 * per-option qty math:
 *
 *   1. linear_ft addons resolve through the WRITER's roofAddonLinearFt
 *      source (mirror buildRoofingBaseLines L156), WITHOUT the qty=1
 *      fallback that materially undercounted the vendor project-details
 *      dialog pre-fix.
 *   2. gutters route through computeGutterTotalLinFt — perimeter + drops ×
 *      per-floor — NOT raw perimeter. Half-fix detector: a $2,748 gutter
 *      total (qty=229) would mean drops bypassed; the correct number is
 *      $3,948 (qty=329).
 *   3. Area materials (square priceUnit) resolve through the SAME branch
 *      the snapshot writer uses — pitched/flat split + useSplit gate +
 *      sliceZeroed gate + waste-factor + sqftToSquares — extracted into
 *      roofing-qty.ts.  Resolver and writer call the same neutral helper,
 *      so live display matches frozen-billed snapshot by construction.
 *   4. Matrix coverage on the writer's branching surface:
 *        3a Donald pitched-primary path (real shape: pitched=2002, flat=379)
 *        3b useSplit path (both flat_roof and a pitched material selected)
 *        3c pitched-absent fallback (areaSqft only)
 *        3d linear_ft gutter-drops route
 *        3e roofMeasurement absent → qty=0 (writer-mirror, NOT roofSize-21)
 *        3f includePerimeter=false → linear_ft gated
 *   5. Whole-writer GOLDEN snapshot: buildRoofingBaseLines on the real-
 *      Donald cart produces a locked price_line_items array byte-identical
 *      across the refactor. Catches any drift the helper-lift introduces
 *      in unitQuantity or amount on ANY of the 3 priceUnit paths (square +
 *      linear_ft + permit gate). Kratos-escalated scope (msg 1781496103880).
 *   6. Writer-delta-zero by-construction: roofing carts ONLY land
 *      roofAddonLinearFt (apollo walker verified service-detail.tsx
 *      L3013-3026, msg 1781496309722) → resolveRoofingLinearFtQty matches
 *      writer L156 by construction for any roofing cart.
 *   7. Regression-doc: the OLD qty=1 fallback produced $24 add-ons and
 *      $1,390 materials on the Donald fixture. The new resolver MUST
 *      diverge from those values on the same input.
 *
 * Donald fixture (sent_projects d11d1c01, vendor 3e0821aa) — real frozen
 * roofMeasurement captured by apollo's blast-radius walker (msg
 * 1781495958802):
 *   areaSqft=2381, pitchedAreaSqft=2002, flatAreaSqft=379,
 *   includeFlatArea=true, includePerimeter=true, includeMaterialOrder=true,
 *   perimeterFt=229, pitch=5/12.
 *
 * Writer trace through buildRoofingBaseLines on this fixture (verified
 * against current writer L43-168 + roofing-qty.ts helpers):
 *   useSplit=false (hasFlatRoofSelected=false, no flat_roof in selections)
 *   metal: isFlat=false, sliceZeroed=false, useSplit=false →
 *          rawSqft = pitchedAreaSqft ?? areaSqft = 2002 → ×1.02 →
 *          sqftToSquares(2042) = 20 sq
 *   gutters: includePerimeter=true → roofAddonLinearFt.gutters=229 →
 *            gutters route → 229 + 4 × 25 = 329 lin_ft
 *   fascia_wood: includePerimeter=true → roofAddonLinearFt=229
 *
 * Usage:
 *   npm run sectiontotal-qty-resolver
 *
 * Exit codes:
 *   0  all legs green
 *   1  one or more legs failed
 */

import { resolveOptionQty } from '../../src/lib/resolve-option-qty.ts'
import {
  buildRoofingBaseLines,
  type ProjectPermitChoice,
} from '../../src/lib/roofing-base-lines.ts'
import {
  resolveRoofingLinearFtQty,
  resolveRoofingSquareQty,
} from '../../src/lib/roofing-qty.ts'
import {
  priceKey,
  type VendorPriceMap,
  type VendorPermitMap,
} from '../../src/lib/api/pricing.ts'
import type { CartItem } from '../../src/stores/cart-store.ts'
import type { PriceLineItem } from '../../src/types/index.ts'

type LegResult = { name: string; ok: boolean; detail?: string }
const results: LegResult[] = []
function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail })
  const prefix = ok ? 'PASS' : 'FAIL'
  console.log(`[${prefix}] ${name}${detail ? `  — ${detail}` : ''}`)
}

// --- Vendor rates --------------------------------------------------------
// LIVE vop snapshot 2026-06-15 captured via
// scripts/probe-project-33170.mjs (read-only).
const VENDOR_METAL_CENTS = 139_000 // $1,390 / sq
const VENDOR_GUTTERS_CENTS = 1_200 // $12 / lin_ft
const VENDOR_FASCIA_WOOD_CENTS = 1_200 // $12 / lin_ft (post Rod-update; frozen
//                                       snapshot fascia was $0 — golden
//                                       reconciles on unitQuantity, amount
//                                       reflects current rate × frozen qty
//                                       per live-catalog-authority-for-rate
//                                       doctrine).
const VENDOR_FLAT_ROOF_CENTS = 120_000 // $1,200 / sq (synthetic for matrix
//                                       test 3b; flat_roof material rate)
const VENDOR_PERMIT_CENTS = 150_000 // $1,500 roofing permit

const priceMap: VendorPriceMap = new Map<string, number>([
  [priceKey('roofing', 'material', 'metal'), VENDOR_METAL_CENTS],
  [priceKey('roofing', 'material', 'flat_roof'), VENDOR_FLAT_ROOF_CENTS],
  [priceKey('roofing', 'addons', 'gutters'), VENDOR_GUTTERS_CENTS],
  [priceKey('roofing', 'addons', 'fascia_wood'), VENDOR_FASCIA_WOOD_CENTS],
])
const permitMap: VendorPermitMap = new Map<string, number>([
  ['roofing', VENDOR_PERMIT_CENTS],
])

// --- Real Donald fixture (apollo walker verified) ------------------------
function makeDonaldItem(): CartItem {
  return {
    id: 'donald-d11d1c01',
    serviceId: 'roofing',
    serviceName: 'Roofing',
    selections: {
      service_type: ['replace'],
      material: ['metal'],
      addons: ['gutters', 'fascia_wood'],
    },
    roofMeasurement: {
      areaSqft: 2381,
      pitchedAreaSqft: 2002,
      flatAreaSqft: 379,
      includeFlatArea: true,
      includePerimeter: true,
      includeMaterialOrder: true,
      perimeterFt: 229,
      pitch: '5/12',
      address: '10990 SW 225th Terrace, Miami, FL 33170, USA',
    },
    roofAddonLinearFt: {
      gutters: 229,
      fascia_wood: 229,
    },
    gutterDropsConfig: { floors: 2, drops: 4 },
    metalRoofSelection: { color: 'black', roofSize: '21' },
    selectionQuantities: {},
    addedAt: '2026-06-10T00:00:00.000Z',
  }
}

// --- Test 1: linear_ft WITHOUT drops (fascia_wood) → qty=229 -------------
{
  const item = makeDonaldItem()
  const qty = resolveOptionQty(item, 'fascia_wood', 'roofing')
  record(
    '1. fascia_wood lin_ft (no drops) → qty=229',
    qty === 229,
    `qty=${qty} (expected 229)`,
  )
  // Bug-class guard: old qty=1 fallback must NOT survive.
  record(
    '1a. fascia_wood NOT qty=1 (selectionQuantities fallback dead)',
    qty !== 1,
    `qty=${qty}`,
  )
  // sectionTotalCents post-fix = $12 × 229 = $2,748 (NO drops routing).
  const cents = VENDOR_FASCIA_WOOD_CENTS * qty
  record(
    '1b. fascia_wood sectionTotalCents = $2,748 (qty=229, no gutter-drops bypass)',
    cents === 2_748_00,
    `cents=${cents} (expected 274800)`,
  )
}

// --- Test 2: linear_ft WITH drops (gutters) → effective=329 --------------
{
  const item = makeDonaldItem()
  const qty = resolveOptionQty(item, 'gutters', 'roofing')
  record(
    '2. gutters lin_ft WITH drops → qty=329 (perimeter 229 + 4 drops × 25 ft/2fl)',
    qty === 329,
    `qty=${qty} (expected 329)`,
  )
  // Half-fix detector: 229 raw would mean drops bypassed.
  record(
    '2a. gutters NOT qty=229 (drops not bypassed)',
    qty !== 229,
    `qty=${qty}`,
  )
  const cents = VENDOR_GUTTERS_CENTS * qty
  record(
    '2b. gutters sectionTotalCents = $3,948 (matches kratos-locked target)',
    cents === 3_948_00,
    `cents=${cents} (expected 394800)`,
  )
}

// --- Test 3: matrix — equality assertions (resolver == helper) -----------
// kratos+apollo locked doctrine: resolveOptionQty for roofing MUST equal
// the neutral helper's output. Cannot drift by construction — both call
// the same module. Matrix covers the writer's branching surface.

// 3a. Donald pitched-primary path: pitched=2002 → 20 sq (NOT pitched+flat sum=24)
{
  const item = makeDonaldItem()
  const resolverQty = resolveOptionQty(item, 'metal', 'roofing')
  const helper = resolveRoofingSquareQty(item, 'metal')
  record(
    '3a. metal pitched-primary: resolver === helper.qty (lockstep)',
    resolverQty === helper.qty,
    `resolver=${resolverQty} helper=${helper.qty}`,
  )
  record(
    '3a-i. metal pitched-primary qty=20 (real Donald path, NOT 24-sq pitched+flat sum)',
    resolverQty === 20,
    `qty=${resolverQty}`,
  )
  record(
    '3a-ii. metal rawSqft=2002 (pitchedAreaSqft branch, NOT areaSqft=2381 fallback, NOT sum)',
    helper.rawSqft === 2002,
    `rawSqft=${helper.rawSqft}`,
  )
  record(
    '3a-iii. useSplit=false on Donald (no flat_roof selected)',
    helper.useSplit === false,
    `useSplit=${helper.useSplit}`,
  )
  // sectionTotalCents for materials = $1,390 × 20 = $27,800 (matches the
  // frozen snapshot priceLineItems on Donald — billed = displayed).
  const cents = VENDOR_METAL_CENTS * resolverQty
  record(
    '3a-iv. metal sectionTotalCents = $27,800 (NOT $33,360 via pitched+flat sum)',
    cents === 27_800_00,
    `cents=${cents} (expected 2780000)`,
  )
}

// 3b. useSplit path: flat_roof + metal both selected → useSplit=true
//   metal uses pitchedAreaSqft via useSplit (NOT areaSqft)
//   flat_roof uses flatAreaSqft via useSplit (NOT areaSqft)
{
  const item: CartItem = {
    ...makeDonaldItem(),
    selections: {
      service_type: ['replace'],
      material: ['metal', 'flat_roof'],
      addons: ['gutters', 'fascia_wood'],
    },
  }
  const metalHelper = resolveRoofingSquareQty(item, 'metal')
  const flatHelper = resolveRoofingSquareQty(item, 'flat_roof')
  record(
    '3b. useSplit=true when both pitched material + flat_roof selected',
    metalHelper.useSplit === true && flatHelper.useSplit === true,
    `metal.useSplit=${metalHelper.useSplit} flat.useSplit=${flatHelper.useSplit}`,
  )
  record(
    '3b-i. metal under useSplit uses pitched=2002 (NOT sum=2381, NOT areaSqft)',
    metalHelper.rawSqft === 2002,
    `rawSqft=${metalHelper.rawSqft}`,
  )
  record(
    '3b-ii. flat_roof under useSplit uses flat=379',
    flatHelper.rawSqft === 379,
    `rawSqft=${flatHelper.rawSqft}`,
  )
  record(
    '3b-iii. metal resolver === helper.qty under useSplit',
    resolveOptionQty(item, 'metal', 'roofing') === metalHelper.qty,
    `resolver=${resolveOptionQty(item, 'metal', 'roofing')} helper=${metalHelper.qty}`,
  )
  record(
    '3b-iv. flat_roof resolver === helper.qty under useSplit',
    resolveOptionQty(item, 'flat_roof', 'roofing') === flatHelper.qty,
    `resolver=${resolveOptionQty(item, 'flat_roof', 'roofing')} helper=${flatHelper.qty}`,
  )
}

// 3c. pitched-absent fallback: only areaSqft (no pitched/flat) → L131 ?? areaSqft
{
  const item: CartItem = {
    ...makeDonaldItem(),
    roofMeasurement: {
      areaSqft: 1961,
      pitch: '5/12',
      address: '10990 SW 225 Terrace',
      perimeterFt: 229,
      includeFlatArea: true,
      includePerimeter: true,
      includeMaterialOrder: true,
    },
  }
  const helper = resolveRoofingSquareQty(item, 'metal')
  record(
    '3c. pitched-absent fallback: rawSqft = areaSqft = 1961 (L131 ?? areaSqft)',
    helper.rawSqft === 1961,
    `rawSqft=${helper.rawSqft}`,
  )
  record(
    '3c-i. fallback qty=20 via 1961×1.02→sqftToSquares',
    helper.qty === 20,
    `qty=${helper.qty}`,
  )
  record(
    '3c-ii. resolver === helper.qty on fallback path',
    resolveOptionQty(item, 'metal', 'roofing') === helper.qty,
    '',
  )
}

// 3d. linear_ft gutter-drops route: roofAddonLinearFt + computeGutterTotalLinFt
{
  const item = makeDonaldItem()
  const helper = resolveRoofingLinearFtQty(item, 'gutters')
  record(
    '3d. gutters effectiveLinFt=329 (perimeter 229 + drops 4×25=100)',
    helper.effectiveLinFt === 329,
    `effectiveLinFt=${helper.effectiveLinFt}`,
  )
  record(
    '3d-i. gutters NOT gated (includePerimeter=true)',
    helper.gated === false,
    `gated=${helper.gated}`,
  )
  record(
    '3d-ii. resolver === helper.effectiveLinFt for gutters',
    resolveOptionQty(item, 'gutters', 'roofing') === helper.effectiveLinFt,
    '',
  )
}

// 3e. roofMeasurement absent → resolver returns 0 (writer-mirror, NOT roofSize-21)
{
  const itemNoMeas: CartItem = { ...makeDonaldItem(), roofMeasurement: undefined }
  const helper = resolveRoofingSquareQty(itemNoMeas, 'metal')
  record(
    '3e. no roofMeasurement → helper.qty=0 (writer-mirror, NOT configurator roofSize-21)',
    helper.qty === 0,
    `qty=${helper.qty}`,
  )
  record(
    '3e-i. no roofMeasurement → resolver=0',
    resolveOptionQty(itemNoMeas, 'metal', 'roofing') === 0,
    `qty=${resolveOptionQty(itemNoMeas, 'metal', 'roofing')}`,
  )
}

// 3f. includePerimeter=false → linear_ft gated
{
  const base = makeDonaldItem()
  const item: CartItem = {
    ...base,
    roofMeasurement: { ...base.roofMeasurement!, includePerimeter: false },
  }
  const helper = resolveRoofingLinearFtQty(item, 'gutters')
  record(
    '3f. includePerimeter=false → helper gated, effectiveLinFt=0',
    helper.gated === true && helper.effectiveLinFt === 0,
    `gated=${helper.gated} eff=${helper.effectiveLinFt}`,
  )
  record(
    '3f-i. resolver=0 when includePerimeter=false',
    resolveOptionQty(item, 'gutters', 'roofing') === 0,
    `qty=${resolveOptionQty(item, 'gutters', 'roofing')}`,
  )
}

// --- Test 4: writer-delta-zero by-construction ---------------------------
// Apollo Q1 walker verified roofing carts ONLY land roofAddonLinearFt
// (service-detail.tsx L3013-3026, msg 1781496309722). So
// resolveRoofingLinearFtQty mirrors writer L156 verbatim for any roofing
// cart — delta provably ZERO by construction. Encoded here as a CI guard.
{
  const item = makeDonaldItem()
  // fascia_wood: no gutter-drops route, pure roofAddonLinearFt lookup.
  const helper = resolveRoofingLinearFtQty(item, 'fascia_wood')
  record(
    '4. writer-delta-zero by-construction: fascia_wood helper.effectiveLinFt === roofAddonLinearFt[optId]',
    helper.effectiveLinFt === item.roofAddonLinearFt!.fascia_wood,
    `helper=${helper.effectiveLinFt} cart.roofAddonLinearFt.fascia_wood=${item.roofAddonLinearFt!.fascia_wood}`,
  )
}

// --- Test 5: GOLDEN snapshot, whole-writer delta-zero --------------------
// kratos escalated scope (msg 1781496103880): full price_line_items array
// byte-identical pre/post-refactor across the whole writer (square +
// linear_ft + permit). Golden values cross-checked against:
//   - manual writer trace through L43-168 + helpers
//   - apollo walker dump of frozen priceLineItems (unitQuantity matches
//     20/329/229; rates reflect LIVE catalog per live-catalog-rate
//     doctrine — fascia frozen $0 differs from live $12, expected).
{
  const item = makeDonaldItem()
  const lines = buildRoofingBaseLines(
    item,
    'yes' as ProjectPermitChoice,
    priceMap,
    permitMap,
  )
  const golden: PriceLineItem[] = [
    {
      id: 'roofing-material-metal',
      label: 'Material — Metal',
      amount: 27800,
      originalAmount: 27800,
      source: 'preset_calculated',
      priceUnit: 'square',
      unitRate: 1390,
      unitQuantity: 20,
    },
    {
      id: 'roofing-addon-gutters',
      label: 'Gutters',
      amount: 3948,
      originalAmount: 3948,
      source: 'preset_calculated',
      priceUnit: 'linear_ft',
      unitRate: 12,
      unitQuantity: 329,
    },
    {
      id: 'roofing-addon-fascia_wood',
      label: 'Fascia Wood',
      amount: 2748,
      originalAmount: 2748,
      source: 'preset_calculated',
      priceUnit: 'linear_ft',
      unitRate: 12,
      unitQuantity: 229,
    },
    {
      id: 'roofing-permit',
      label: 'Permit',
      amount: 1500,
      originalAmount: 1500,
      source: 'preset_calculated',
    },
  ]
  const actualJson = JSON.stringify(lines)
  const goldenJson = JSON.stringify(golden)
  const ok = actualJson === goldenJson
  record(
    '5. GOLDEN: buildRoofingBaseLines(realDonald) byte-identical to locked golden',
    ok,
    ok
      ? `${lines?.length ?? 0} lines match golden`
      : `\n  actual: ${actualJson}\n  golden: ${goldenJson}`,
  )
}

// --- Test 6: regression-doc — OLD vs NEW Donald display ------------------
// Documents the pre-fix qty=1 fallback symptom on the Donald fixture:
//   Add-Ons OLD = $12 (gutters × 1) + $12 (fascia × 1) = $24
//             NEW = $3,948 (gutters × 329) + $2,748 (fascia × 229) = $6,696
//   Materials OLD = $1,390 (metal × 1) = $1,390
//             NEW = $27,800 (metal × 20) = $27,800
//   Donald patch delta = ($6,696 − $24) + ($27,800 − $1,390) = $33,082
{
  const item = makeDonaldItem()
  const oldGuttersCents = VENDOR_GUTTERS_CENTS * (item.selectionQuantities?.['gutters'] ?? 1)
  const oldFasciaCents = VENDOR_FASCIA_WOOD_CENTS * (item.selectionQuantities?.['fascia_wood'] ?? 1)
  const oldAddonsCents = oldGuttersCents + oldFasciaCents
  record(
    '6. regression-doc OLD Add-Ons = $24 (the visible bug Rod reported)',
    oldAddonsCents === 24_00,
    `OLD Add-Ons cents=${oldAddonsCents} (expected 2400)`,
  )
  const newGuttersCents = VENDOR_GUTTERS_CENTS * resolveOptionQty(item, 'gutters', 'roofing')
  const newFasciaCents = VENDOR_FASCIA_WOOD_CENTS * resolveOptionQty(item, 'fascia_wood', 'roofing')
  const newAddonsCents = newGuttersCents + newFasciaCents
  record(
    '6a. regression-doc NEW Add-Ons = $6,696 (qty-correct via resolver)',
    newAddonsCents === 6_696_00,
    `NEW Add-Ons cents=${newAddonsCents} (expected 669600)`,
  )
  const oldMetalCents = VENDOR_METAL_CENTS * (item.selectionQuantities?.['metal'] ?? 1)
  const newMetalCents = VENDOR_METAL_CENTS * resolveOptionQty(item, 'metal', 'roofing')
  record(
    '6b. regression-doc OLD Materials = $1,390 (the visible Materials hole)',
    oldMetalCents === 1_390_00,
    `OLD metal cents=${oldMetalCents} (expected 139000)`,
  )
  record(
    '6c. regression-doc NEW Materials = $27,800 (qty-correct, matches snapshot)',
    newMetalCents === 27_800_00,
    `NEW metal cents=${newMetalCents} (expected 2780000)`,
  )
  const delta = (newAddonsCents - oldAddonsCents) + (newMetalCents - oldMetalCents)
  record(
    '6d. regression-doc Donald patch delta = $33,082 (Add-Ons + Materials hole closed)',
    delta === 33_082_00,
    `delta=${delta} (expected 3308200)`,
  )
}

// --- Summary -------------------------------------------------------------
const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} legs passed`)
if (failed.length > 0) {
  console.log('Failures:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `  (${f.detail})` : ''}`)
  process.exit(1)
}
process.exit(0)
