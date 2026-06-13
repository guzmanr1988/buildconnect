#!/usr/bin/env node
/**
 * pin-31 — per-unit math display + projectPermit gate runner.
 *
 * Pins the math contracts pin-31 ships:
 *
 *   1. Every preset_calculated line carries unitRate × unitQuantity ===
 *      amount at integer-cent precision.
 *   2. The shared buildRoofingBaseLines helper is the single source of
 *      truth — booking-confirmation (display + write at sendProject),
 *      computeVendorTotal (vendor-compare quote), and projects-store
 *      hydrate backfill all consume the same breakdown, so sum(base) ===
 *      quoted_price_cents for any cart that survives the helper.
 *   3. projectPermit gate is honored end-to-end. 'no' (cash-only waiver)
 *      drops the permit line to $0 with the no-permit/no-price label
 *      AND drops the computeVendorTotal quote by the same permit_price_cents
 *      — pre-pin-31 the quote billed the permit unconditionally while
 *      buildRoofingLineItems gated on the same choice, so base lines
 *      failed to sum to the quote for any 'no' flow.
 *   4. Rod's upsale rule: upsale = saleAmount − quoted_price_cents (NOT
 *      saleAmount − reconstructed breakdown). Donald sold AT quote
 *      ($33,248) → upsale $0. Donald sold above ($40,000) → upsale $6,752.
 *
 * Legs:
 *
 *   a. Per-line integer-cent unitRate × qty === amount on every
 *      preset_calculated row (Donald fixture).
 *   b. base.sum === quote (Donald fixture, projectPermit=yes,
 *      breakdown = $27,800 + $3,948 + $0 + $1,500 = $33,248).
 *   c. Donald $33,248 sold at quote → upsale row absent, sum stays at
 *      quote (pin-29 reconcile zero-delta omits adjustment).
 *   d. Donald $40,000 sold above quote → Upsale row $6,752, sum = $40,000.
 *   e. projectPermit=yes → roofing-permit line at $1,500 (vendor seed).
 *   f. projectPermit=no → roofing-permit line at $0 (no-permit/no-price);
 *      base sums to $31,748 ($1,500 lower); computeVendorTotal quote
 *      drops by the same $1,500 (parity with helper).
 *   g. Re-reconcile idempotency — reconcileLines twice produces
 *      content-equivalent output (hydrate write-amp guard fires).
 *   h. Backfill sanity gate — sum(base lines) === quoted_price_cents at
 *      integer-cent precision for both Donald fixtures (the gate the
 *      hydrate sweep checks before persisting backfilled rows).
 *
 * Usage:
 *   npm run per-unit-math
 *
 * Exit codes:
 *   0  all legs green
 *   1  one or more legs failed
 */

import {
  buildRoofingBaseLines,
  sumRoofingBaseLines,
} from '../../src/lib/roofing-base-lines.ts'
import {
  priceKey,
  computeVendorTotal,
  type VendorPriceMap,
  type VendorPermitMap,
} from '../../src/lib/api/pricing.ts'
import {
  reconcileLines,
  reconcileLinesEquivalent,
} from '../../src/lib/reconcile-lines.ts'
import type { CartItem } from '../../src/stores/cart-store.ts'
import type { PriceLineItem } from '../../src/types/index.ts'

type LegResult = { name: string; ok: boolean; detail?: string }
const results: LegResult[] = []
function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail })
  const prefix = ok ? 'PASS' : 'FAIL'
  console.log(`[${prefix}] ${name}${detail ? `  — ${detail}` : ''}`)
}

// --- Donald fixture ------------------------------------------------------
// Vendor 3e0821aa seeded prices (cents):
//   metal:        139000 = $1,390 / sq
//   gutters:        1200 = $12 / lin_ft
//   fascia_wood:       0 = $0 / lin_ft  (silent / zero-rate line)
//   permit:       150000 = $1,500 (vendor_service_permits roofing)
//
// Donald cart:
//   roofMeasurement.areaSqft = 1961 → waste 2000 → 20 squares
//   roofAddonLinearFt:
//     gutters    = 229 (perimeter)
//     fascia_wood = 229
//   gutterDropsConfig: { floors: 2, drops: 4 } → 229 + 4*25 = 329 lin_ft
//
// Expected base (projectPermit=yes):
//   Material — Metal:   $1,390 × 20  = $27,800
//   Gutters:            $12   × 329  = $3,948
//   Fascia Wood:        $0    × 229  = $0
//   Permit:                            $1,500
//   --------------------------------------------
//   Quote:                            $33,248
//
// Expected base (projectPermit=no):
//   ...same first three lines...
//   Permit — no permit, no price:     $0
//   --------------------------------------------
//   Quote:                            $31,748   (drop of $1,500)

const DONALD_VENDOR = '3e0821aa-0000-0000-0000-000000000000'
const DONALD_QUOTE_PERMIT_YES_CENTS = 33_248_00
const DONALD_QUOTE_PERMIT_NO_CENTS = 31_748_00

const priceMap: VendorPriceMap = new Map<string, number>([
  [priceKey('roofing', 'material', 'metal'), 139_000],
  [priceKey('roofing', 'gutters', 'gutters'), 1_200],
  [priceKey('roofing', 'fascia', 'fascia_wood'), 0],
])
const permitMap: VendorPermitMap = new Map<string, number>([
  ['roofing', 150_000],
])

function makeDonaldItem(): CartItem {
  return {
    id: 'donald-cart-1',
    serviceId: 'roofing',
    serviceName: 'Roofing',
    selections: {
      service_type: ['replace'],
      material: ['metal'],
      gutters: ['gutters'],
      fascia: ['fascia_wood'],
    },
    roofMeasurement: {
      areaSqft: 1961,
      pitch: 'medium',
      address: '123 Donald Ln',
      perimeterFt: 229,
    },
    roofAddonLinearFt: {
      gutters: 229,
      fascia_wood: 229,
    },
    gutterDropsConfig: { floors: 2, drops: 4 },
  }
}

// --- Leg a: per-line integer-cent unitRate × qty === amount --------------
{
  const item = makeDonaldItem()
  const lines = buildRoofingBaseLines(item, 'yes', priceMap, permitMap)
  const presetLines = (lines ?? []).filter((l) => l.source === 'preset_calculated' && l.priceUnit)
  const offenders: string[] = []
  for (const l of presetLines) {
    if (l.unitRate === undefined || l.unitQuantity === undefined) continue
    const expectedCents = Math.round(l.unitRate * l.unitQuantity * 100)
    const amountCents = Math.round((l.amount ?? 0) * 100)
    if (expectedCents !== amountCents) {
      offenders.push(`${l.id}: ${l.unitRate}×${l.unitQuantity}=${expectedCents / 100} vs amount=${l.amount}`)
    }
  }
  record(
    'leg a — every preset_calculated line has unitRate × unitQuantity === amount (integer cents)',
    offenders.length === 0 && presetLines.length >= 3,
    `priced=${presetLines.length} offenders=${offenders.length}${offenders.length ? ` (${offenders.join('; ')})` : ''}`,
  )
}

// --- Leg b: base.sum === quote (projectPermit=yes) -----------------------
{
  const item = makeDonaldItem()
  const lines = buildRoofingBaseLines(item, 'yes', priceMap, permitMap)
  const baseCents = lines ? Math.round(sumRoofingBaseLines(lines) * 100) : -1
  record(
    'leg b — base.sum === quote at integer cents (Donald projectPermit=yes)',
    baseCents === DONALD_QUOTE_PERMIT_YES_CENTS,
    `base_cents=${baseCents} expected=${DONALD_QUOTE_PERMIT_YES_CENTS}`,
  )
}

// --- Leg c: Donald $33,248 sold at quote → upsale = $0 -------------------
{
  const item = makeDonaldItem()
  const baseLines = buildRoofingBaseLines(item, 'yes', priceMap, permitMap) ?? []
  // Rod's rule: upsale = saleAmount − quoted_price_cents. saleAmount = quote
  // → delta zero → reconcileLines omits the auto_sold_adjustment row.
  const saleAmount = DONALD_QUOTE_PERMIT_YES_CENTS / 100
  const reconciled = reconcileLines(saleAmount, baseLines)
  const hasAdj = reconciled.some((l) => l.source === 'auto_sold_adjustment')
  const sumDollars = reconciled.reduce((s, l) => s + (l.amount ?? 0), 0)
  const sumCents = Math.round(sumDollars * 100)
  record(
    'leg c — Donald sold AT $33,248 quote → no Upsale row, sum stays at quote',
    !hasAdj && sumCents === DONALD_QUOTE_PERMIT_YES_CENTS,
    `hasAdj=${hasAdj} sum_cents=${sumCents}`,
  )
}

// --- Leg d: Donald $40,000 sold above → Upsale $6,752, sum = $40,000 -----
{
  const item = makeDonaldItem()
  const baseLines = buildRoofingBaseLines(item, 'yes', priceMap, permitMap) ?? []
  const saleAmount = 40_000
  const reconciled = reconcileLines(saleAmount, baseLines)
  const adj = reconciled[reconciled.length - 1]
  const sumCents = Math.round(reconciled.reduce((s, l) => s + (l.amount ?? 0), 0) * 100)
  const expectedUpsale = saleAmount - DONALD_QUOTE_PERMIT_YES_CENTS / 100 // 6752
  const ok =
    adj &&
    adj.source === 'auto_sold_adjustment' &&
    adj.label === 'Upsale' &&
    adj.amount === expectedUpsale &&
    sumCents === saleAmount * 100
  record(
    'leg d — Donald sold $40,000 → Upsale row $6,752, sum === $40,000',
    !!ok,
    `adj=${adj?.label}:${adj?.amount} expected=${expectedUpsale} sum_cents=${sumCents}`,
  )
}

// --- Leg e: projectPermit=yes → permit line at $1,500 --------------------
{
  const item = makeDonaldItem()
  const lines = buildRoofingBaseLines(item, 'yes', priceMap, permitMap) ?? []
  const permit = lines.find((l) => l.id === 'roofing-permit')
  const ok = !!permit && permit.label === 'Permit' && permit.amount === 1_500
  record(
    'leg e — projectPermit=yes → roofing-permit at $1,500 (vendor seed)',
    ok,
    `permit=${permit?.label}:${permit?.amount}`,
  )
}

// --- Leg f: projectPermit=no → permit $0, base $1,500 lower, parity ------
{
  const item = makeDonaldItem()
  const lines = buildRoofingBaseLines(item, 'no', priceMap, permitMap) ?? []
  const permit = lines.find((l) => l.id === 'roofing-permit')
  const baseCents = Math.round(sumRoofingBaseLines(lines) * 100)
  // Computed vendor quote should also drop the permit $1,500 with projectPermit='no'.
  const tot = computeVendorTotal(priceMap, [item], undefined, permitMap, undefined, 'no')
  const okHelper =
    !!permit &&
    permit.amount === 0 &&
    permit.label === 'Permit — no permit, no price' &&
    baseCents === DONALD_QUOTE_PERMIT_NO_CENTS
  const okComputeParity = tot.totalCents === DONALD_QUOTE_PERMIT_NO_CENTS
  record(
    'leg f — projectPermit=no → permit $0, base $31,748, computeVendorTotal parity',
    okHelper && okComputeParity,
    `permit=${permit?.label}:${permit?.amount} base_cents=${baseCents} compute_cents=${tot.totalCents}`,
  )
}

// --- Leg g: re-reconcile idempotency (hydrate write-amp guard) -----------
{
  const item = makeDonaldItem()
  const baseLines = buildRoofingBaseLines(item, 'yes', priceMap, permitMap) ?? []
  const saleAmount = 40_000
  const first = reconcileLines(saleAmount, baseLines)
  const second = reconcileLines(saleAmount, first)
  const equiv = reconcileLinesEquivalent(first, second)
  record(
    'leg g — pin-29 reconcile idempotency on roofing-base-lines breakdown',
    equiv,
    `equiv=${equiv}`,
  )
}

// --- Leg h: backfill sanity gate (base.sum === quote, both fixtures) -----
{
  const item = makeDonaldItem()
  const linesYes = buildRoofingBaseLines(item, 'yes', priceMap, permitMap) ?? []
  const linesNo = buildRoofingBaseLines(item, 'no', priceMap, permitMap) ?? []
  const yesCents = Math.round(sumRoofingBaseLines(linesYes) * 100)
  const noCents = Math.round(sumRoofingBaseLines(linesNo) * 100)
  const ok =
    yesCents === DONALD_QUOTE_PERMIT_YES_CENTS &&
    noCents === DONALD_QUOTE_PERMIT_NO_CENTS
  record(
    'leg h — hydrate backfill sanity gate: sum(base) === quote (yes + no)',
    ok,
    `yes_cents=${yesCents} no_cents=${noCents}`,
  )
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`Legs run: ${results.length}, failed: ${failed.length}`)
if (failed.length > 0) {
  console.log('FAILED:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`)
  process.exit(1)
}
process.exit(0)
