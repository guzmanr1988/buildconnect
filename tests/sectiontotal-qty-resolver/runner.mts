#!/usr/bin/env node
/**
 * Live project-items-card-grid sectionTotalCents qty-resolver lockstep
 * runner. Pins the math contract introduced by the resolver:
 *
 *   1. linear_ft addons resolve through the same source the snapshot
 *      writer used (roofAddonLinearFt -> addonLinearFt -> subGroupLinearFt),
 *      WITHOUT the qty=1 fallback that materially undercounted the vendor
 *      project-details dialog pre-fix.
 *   2. gutters route through computeGutterTotalLinFt — perimeter + drops ×
 *      per-floor — NOT raw perimeter. Half-fix detector: a $2,748 gutter
 *      total (qty=229) would mean drops bypassed; the correct number is
 *      $3,948 (qty=329).
 *   3. Area materials (square priceUnit) resolve through the SAME path
 *      the snapshot writer uses — roofMeasurement.{pitched|flat|area}Sqft
 *      × waste-factor -> sqftToSquares — so live display matches the
 *      frozen-billed snapshot (Donald: 20 squares × $1,390 = $27,800).
 *      The lockstep assertion: resolver qty === writer's unitQuantity on
 *      the same fixture.
 *   4. Regression doc: the OLD qty=1 fallback would produce $24 add-ons
 *      ($12 gutters + $12 fascia) and $1,390 materials ($27,800 / 20)
 *      for the Donald fixture. The new resolver MUST diverge from those
 *      values on the same input.
 *
 * Donald fixture (sent_projects d11d1c01, vendor 3e0821aa) — frozen prod
 * snapshot, NO algorithmically synthesized rates (per banked
 * no-guessed-fixture-prices doctrine).
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
  priceKey,
  type VendorPriceMap,
  type VendorPermitMap,
} from '../../src/lib/api/pricing.ts'
import type { CartItem } from '../../src/stores/cart-store.ts'

type LegResult = { name: string; ok: boolean; detail?: string }
const results: LegResult[] = []
function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail })
  const prefix = ok ? 'PASS' : 'FAIL'
  console.log(`[${prefix}] ${name}${detail ? `  — ${detail}` : ''}`)
}

// --- Donald fixture ------------------------------------------------------
// Vendor 3e0821aa seeded prices (cents) — LIVE vop snapshot 2026-06-15
// captured via scripts/probe-project-33170.mjs (read-only):
//   metal:        139000 = $1,390 / sq
//   gutters:        1200 = $12   / lin_ft
//   fascia_wood:    1200 = $12   / lin_ft  (parent vop active 2026-06-15)
//
// Live cart shape ('addons' group carrying linear_ft slugs per
// blast-radius walker probe of sent_projects.item; 'material' group
// carrying metal):
//   roofMeasurement.areaSqft = 1961 → × 1.02 waste → 2000 → 20 squares
//   roofAddonLinearFt.gutters     = 229
//   roofAddonLinearFt.fascia_wood = 229
//   gutterDropsConfig: { floors: 2, drops: 4 } → 229 + 4*25 = 329 lin_ft
//   metalRoofSelection.roofSize   = "21" (configurator value — diverges
//     from roofMeasurement by 1, intentionally tested as last-resort
//     fallback only when roofMeasurement absent)
//   selectionQuantities = {} (empty — the source of the qty=1 fallback bug)

const VENDOR_METAL_CENTS = 139_000
const VENDOR_GUTTERS_CENTS = 1_200
const VENDOR_FASCIA_WOOD_CENTS = 1_200

const priceMap: VendorPriceMap = new Map<string, number>([
  [priceKey('roofing', 'material', 'metal'), VENDOR_METAL_CENTS],
  [priceKey('roofing', 'addons', 'gutters'), VENDOR_GUTTERS_CENTS],
  [priceKey('roofing', 'addons', 'fascia_wood'), VENDOR_FASCIA_WOOD_CENTS],
])
const permitMap: VendorPermitMap = new Map<string, number>([
  ['roofing', 150_000],
])

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
      areaSqft: 1961,
      pitch: 'medium',
      address: '10990 SW 225 Terrace, Miami FL 33170',
      perimeterFt: 229,
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
  // Post-fix sectionTotalCents for gutters = $12 × 329 = $3,948.
  const cents = VENDOR_GUTTERS_CENTS * qty
  record(
    '2b. gutters sectionTotalCents = $3,948 (matches kratos-locked target)',
    cents === 3_948_00,
    `cents=${cents} (expected 394800)`,
  )
}

// --- Test 3: area material — lockstep with writer ------------------------
// kratos-locked governing rule: live RATES × frozen-MEASURED qty. Resolver
// square branch IS buildRoofingBaseLines' qty logic EXTRACTED; both must
// produce 20 squares for Donald (1961 sqft × 1.02 waste → 2000 → 20). The
// configurator's metalRoofSelection.roofSize="21" is intentionally
// ignored — it diverges from billing measurement and is a last-resort
// fallback only when roofMeasurement is absent.
{
  const item = makeDonaldItem()
  const resolverQty = resolveOptionQty(item, 'metal', 'roofing')
  record(
    '3. metal area material → qty=20 (roofMeasurement source, waste-factor applied)',
    resolverQty === 20,
    `qty=${resolverQty} (expected 20)`,
  )
  // sectionTotalCents for materials = $1,390 × 20 = $27,800 (matches the
  // frozen snapshot priceLineItems on Donald — billed = displayed).
  const cents = VENDOR_METAL_CENTS * resolverQty
  record(
    '3a. metal sectionTotalCents = $27,800 (matches frozen snapshot, NOT $29,190 via configurator-21)',
    cents === 27_800_00,
    `cents=${cents} (expected 2780000)`,
  )
  // Lockstep proof: snapshot writer's unitQuantity on the metal line must
  // EQUAL the resolver's qty. Any drift here re-opens the snapshot-vs-live
  // class this patch closes.
  const lines = buildRoofingBaseLines(
    item,
    'yes' as ProjectPermitChoice,
    priceMap,
    permitMap,
  )
  const metalLine = (lines ?? []).find((l) => l.id === 'roofing-material-metal')
  const writerQty = metalLine?.unitQuantity
  record(
    '3b. resolver qty === writer unitQuantity (lockstep)',
    writerQty === resolverQty,
    `resolver=${resolverQty} writer=${writerQty}`,
  )
  // Writer-mirror: when roofMeasurement is absent, the writer skips the
  // line (rawSqft=0 → $0 amount). Resolver must mirror — returning the
  // configurator's metalRoofSelection.roofSize would re-introduce the
  // writer-vs-renderer drift class this patch kills. Per apollo nit:
  // any fallback the writer doesn't have, the resolver doesn't have.
  const itemNoMeas: CartItem = { ...item, roofMeasurement: undefined }
  const noMeasQty = resolveOptionQty(itemNoMeas, 'metal', 'roofing')
  record(
    '3c. resolver mirrors writer: no roofMeasurement → qty=0 (NOT configurator-21)',
    noMeasQty === 0,
    `qty=${noMeasQty} (expected 0; metalRoofSelection.roofSize="21" intentionally ignored)`,
  )
}

// --- Test 4: buggy-baseline regression-doc -------------------------------
// Documents the pre-fix qty=1 fallback symptom on the Donald fixture:
//   Add-Ons OLD = $12 (gutters × 1) + $12 (fascia × 1) = $24
//             NEW = $3,948 (gutters × 329) + $2,748 (fascia × 229) = $6,696
//   Materials OLD = $1,390 (metal × 1) = $1,390
//             NEW = $27,800 (metal × 20) = $27,800
//   Total Donald patch delta = ($6,696 − $24) + ($27,800 − $1,390) = $33,082
{
  const item = makeDonaldItem()
  // OLD sectionTotalCents qty fallback (selectionQuantities ?? 1).
  const oldGuttersCents = VENDOR_GUTTERS_CENTS * (item.selectionQuantities?.['gutters'] ?? 1)
  const oldFasciaCents = VENDOR_FASCIA_WOOD_CENTS * (item.selectionQuantities?.['fascia_wood'] ?? 1)
  const oldAddonsCents = oldGuttersCents + oldFasciaCents
  record(
    '4. regression-doc OLD Add-Ons total = $24 (the visible bug Rod reported)',
    oldAddonsCents === 24_00,
    `OLD Add-Ons cents=${oldAddonsCents} (expected 2400)`,
  )
  const newGuttersCents = VENDOR_GUTTERS_CENTS * resolveOptionQty(item, 'gutters', 'roofing')
  const newFasciaCents = VENDOR_FASCIA_WOOD_CENTS * resolveOptionQty(item, 'fascia_wood', 'roofing')
  const newAddonsCents = newGuttersCents + newFasciaCents
  record(
    '4a. regression-doc NEW Add-Ons total = $6,696 (qty-correct via resolver)',
    newAddonsCents === 6_696_00,
    `NEW Add-Ons cents=${newAddonsCents} (expected 669600)`,
  )
  // Materials hole — OLD: $1,390 × 1 = $1,390. NEW: $1,390 × 20 = $27,800.
  const oldMetalCents = VENDOR_METAL_CENTS * (item.selectionQuantities?.['metal'] ?? 1)
  const newMetalCents = VENDOR_METAL_CENTS * resolveOptionQty(item, 'metal', 'roofing')
  record(
    '4b. regression-doc OLD Materials = $1,390 (the visible Materials hole)',
    oldMetalCents === 1_390_00,
    `OLD metal cents=${oldMetalCents} (expected 139000)`,
  )
  record(
    '4c. regression-doc NEW Materials = $27,800 (qty-correct, matches snapshot)',
    newMetalCents === 27_800_00,
    `NEW metal cents=${newMetalCents} (expected 2780000)`,
  )
  // Total delta the patch closes on Donald.
  const delta = (newAddonsCents - oldAddonsCents) + (newMetalCents - oldMetalCents)
  record(
    '4d. regression-doc Donald patch delta = $33,082 (Add-Ons + Materials hole closed)',
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
