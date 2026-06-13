#!/usr/bin/env node
/**
 * pin-29 — upsale / discount reconcile invariant runner.
 *
 * Pins the math contract: after markSold (and hydrate-backfill) the
 * priceLineItems on every sold project sum exactly to saleAmount, with
 * an auto_sold_adjustment row appended for non-zero delta (Upsale when
 * positive, Discount when negative, nothing when zero). The hydrate
 * sweep is content-guarded so a second hydrate produces zero writes.
 *
 * Legs:
 *
 *   1. Positive delta → 'Upsale' row, sum == saleAmount.
 *   2. Negative delta → 'Discount' row, sum == saleAmount.
 *   3. Zero delta → no adjustment row, sum == saleAmount.
 *   4. Re-reconcile (idempotency): prior auto_sold_adjustment lines are
 *      stripped before recomputing — applying reconcileLines twice in a
 *      row collapses to the same content (ignoring the volatile id /
 *      timestamp suffix).
 *   5. Vendor-edit baseLines: source='vendor_edit' lines are anchored on
 *      (not stripped), so delta is computed against the actual rendered
 *      breakdown sum.
 *   6. windows_doors-shape baseLines (multi-line catalog set): same
 *      invariant holds — sum(returned) == saleAmount regardless of
 *      shape.
 *   7. Content-equivalence guard: reconcileLinesEquivalent returns true
 *      for already-reconciled input (volatile id / timestamp ignored) →
 *      hydrate sweep skips DB write. saleAmount change OR baseLine
 *      change produces inequivalence → hydrate sweep writes.
 *
 * Usage:
 *   npm run upsale-reconcile
 *
 * Exit codes:
 *   0  all legs green
 *   1  one or more legs failed
 */

import {
  reconcileLines,
  reconcileLinesEquivalent,
} from '../../src/lib/reconcile-lines.ts'
import type { PriceLineItem } from '../../src/types/index.ts'

type LegResult = { name: string; ok: boolean; detail?: string }

const results: LegResult[] = []

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail })
  const prefix = ok ? 'PASS' : 'FAIL'
  console.log(`[${prefix}] ${name}${detail ? `  — ${detail}` : ''}`)
}

const sum = (lines: PriceLineItem[]) =>
  lines.reduce((s, l) => s + (l.amount ?? 0), 0)

const preset = (id: string, label: string, amount: number): PriceLineItem => ({
  id,
  label,
  amount,
  originalAmount: amount,
  source: 'preset',
})

const vendorEdit = (
  id: string,
  label: string,
  amount: number,
): PriceLineItem => ({
  id,
  label,
  amount,
  originalAmount: amount,
  source: 'vendor_edit',
})

// Leg 1 — positive delta
{
  const base: PriceLineItem[] = [
    preset('roof', 'Roof Replacement', 8000),
    preset('gutters', 'Gutters', 1200),
    preset('fascia', 'Fascia Wood', 600),
  ]
  const next = reconcileLines(11000, base)
  const adj = next[next.length - 1]
  const ok =
    sum(next) === 11000 &&
    next.length === base.length + 1 &&
    adj.label === 'Upsale' &&
    adj.amount === 1200 &&
    adj.source === 'auto_sold_adjustment'
  record(
    'leg 1 — positive delta appends Upsale, sum == saleAmount',
    ok,
    `sum=${sum(next)} adj=${adj.label}:${adj.amount}`,
  )
}

// Leg 2 — negative delta
{
  const base: PriceLineItem[] = [
    preset('roof', 'Roof Replacement', 8000),
    preset('gutters', 'Gutters', 1200),
  ]
  const next = reconcileLines(8500, base)
  const adj = next[next.length - 1]
  const ok =
    sum(next) === 8500 &&
    next.length === base.length + 1 &&
    adj.label === 'Discount' &&
    adj.amount === -700 &&
    adj.source === 'auto_sold_adjustment'
  record(
    'leg 2 — negative delta appends Discount, sum == saleAmount',
    ok,
    `sum=${sum(next)} adj=${adj.label}:${adj.amount}`,
  )
}

// Leg 3 — zero delta
{
  const base: PriceLineItem[] = [
    preset('roof', 'Roof Replacement', 8000),
    preset('gutters', 'Gutters', 1200),
  ]
  const next = reconcileLines(9200, base)
  const hasAdj = next.some((l) => l.source === 'auto_sold_adjustment')
  const ok = !hasAdj && sum(next) === 9200 && next.length === base.length
  record(
    'leg 3 — zero delta omits adjustment row, sum == saleAmount',
    ok,
    `sum=${sum(next)} len=${next.length} hasAdj=${hasAdj}`,
  )
}

// Leg 4 — re-reconcile idempotency (content-equivalent ignoring volatile suffix)
{
  const base: PriceLineItem[] = [
    preset('roof', 'Roof Replacement', 8000),
    preset('gutters', 'Gutters', 1200),
  ]
  const first = reconcileLines(11000, base)
  const second = reconcileLines(11000, first)
  const ok =
    reconcileLinesEquivalent(first, second) &&
    sum(first) === sum(second) &&
    sum(second) === 11000 &&
    second.filter((l) => l.source === 'auto_sold_adjustment').length === 1
  record(
    'leg 4 — re-reconcile is idempotent (content-equivalent, single adjustment row)',
    ok,
    `equiv=${reconcileLinesEquivalent(first, second)} sums=${sum(first)}/${sum(second)}`,
  )
}

// Leg 5 — vendor-edit baseLines are part of anchor (not stripped)
{
  const base: PriceLineItem[] = [
    preset('roof', 'Roof Replacement', 8000),
    vendorEdit('gutters', 'Gutters (Vendor Edit)', 1500), // bumped from 1200
  ]
  const next = reconcileLines(10000, base)
  const adj = next[next.length - 1]
  const ok =
    sum(next) === 10000 &&
    next.length === base.length + 1 &&
    adj.label === 'Upsale' &&
    adj.amount === 500 && // 10000 - (8000 + 1500)
    next.some((l) => l.source === 'vendor_edit') // vendor_edit preserved
  record(
    'leg 5 — vendor-edit lines anchor on delta (not stripped)',
    ok,
    `sum=${sum(next)} adj=${adj.amount} vendorEditPreserved=${next.some((l) => l.source === 'vendor_edit')}`,
  )
}

// Leg 6 — windows_doors-shape baseLines
{
  const base: PriceLineItem[] = [
    preset('wd-product', 'Windows & Doors (Product)', 5500),
    preset('wd-install-windows', 'Window Installation', 800),
    preset('wd-install-doors', 'Door Installation', 400),
    preset('wd-permit', 'Permit Fee', 250),
  ]
  const next = reconcileLines(8000, base)
  const adj = next[next.length - 1]
  const ok =
    sum(next) === 8000 &&
    adj.label === 'Upsale' &&
    adj.amount === 1050 && // 8000 - (5500 + 800 + 400 + 250)
    next.slice(0, 4).every((l, i) => l.id === base[i].id)
  record(
    'leg 6 — windows_doors-shape multi-line catalog reconciles to saleAmount',
    ok,
    `sum=${sum(next)} adj=${adj.amount}`,
  )
}

// Leg 7 — content-equivalence guard: equiv on identical content, inequivalent
// on saleAmount change OR baseLine change
{
  const base: PriceLineItem[] = [
    preset('roof', 'Roof Replacement', 8000),
    preset('gutters', 'Gutters', 1200),
  ]
  const stored = reconcileLines(11000, base)

  // (a) re-reconcile against same data → equivalent (NO write)
  const reReconciled = reconcileLines(11000, stored)
  const equivA = reconcileLinesEquivalent(stored, reReconciled)

  // (b) saleAmount changes → inequivalent (write expected)
  const saleChanged = reconcileLines(12000, stored)
  const equivB = reconcileLinesEquivalent(stored, saleChanged)

  // (c) baseLine changes → inequivalent (write expected)
  const editedBase: PriceLineItem[] = [
    preset('roof', 'Roof Replacement', 8000),
    vendorEdit('gutters', 'Gutters', 1500), // bumped 1200 → 1500
  ]
  const baseChanged = reconcileLines(11000, editedBase)
  const equivC = reconcileLinesEquivalent(stored, baseChanged)

  const ok = equivA === true && equivB === false && equivC === false
  record(
    'leg 7 — equivalence guard: stable on identical content, fires on saleAmount or baseLine change',
    ok,
    `identical=${equivA} saleChanged=${equivB} baseChanged=${equivC}`,
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
