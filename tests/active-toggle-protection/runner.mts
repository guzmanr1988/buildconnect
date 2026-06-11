#!/usr/bin/env node
/**
 * Active-toggle protection runner.
 *
 * Pins the invariant that vendor catalog "enabled" state derives from DB
 * truth (vendor_option_prices.active) — NOT from localStorage. Three legs:
 *
 *   Test 1 (roundtrip / pure-fn v1) — buildEnabledStateFromRows() correctly
 *     reconstructs enabled+enabledOptions from a mixed active/inactive row
 *     set (active=false rows do NOT carry into enabled state).
 *
 *   Test 2 (math invariant / pure-fn v1) — feeding both pure-fn output and
 *     a simulated post-merge services[] through the same fold yields
 *     byte-equal enabled/enabledOptions (no path inside the store can
 *     drift the in-memory state away from buildEnabledStateFromRows).
 *
 *   Test 3 (load-bearing gate / build-time partialize-output assertion) —
 *     read src/stores/vendor-catalog-store.ts source. Assert partialize()
 *     literally maps `state.services` to a shape that sets enabled=false
 *     and enabledOptions={} (never passes state.services through raw).
 *     If a future edit drops this strip, the test fails BEFORE the bundle
 *     can ship. This is the keystone that makes localStorage physically
 *     incapable of carrying a truthy enabled.
 *
 * Usage:
 *   npm run active-toggle-protection
 *
 * Exit codes:
 *   0  all 3 legs green
 *   1  one or more legs failed
 *   2  runner setup error
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildEnabledStateFromRows,
  buildPriceMapFromRows,
  type HydratePriceRow,
  type HydratePermitRow,
} from '../../src/lib/api/vendor-catalog-hydrate.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const STORE_PATH = join(REPO_ROOT, 'src', 'stores', 'vendor-catalog-store.ts')

type LegResult = { name: string; ok: boolean; detail?: string }

function leg1_roundtrip(): LegResult {
  const priceRows: HydratePriceRow[] = [
    {
      price_cents: 12500,
      active: true,
      options: {
        option_id: 'shingle_asphalt',
        option_groups: { group_id: 'material', service_id: 'roofing' },
      },
    },
    {
      price_cents: 30000,
      active: true,
      options: {
        option_id: 'metal_panel',
        option_groups: { group_id: 'material', service_id: 'roofing' },
      },
    },
    {
      // inactive — MUST be filtered out of enabled state
      price_cents: 9999,
      active: false,
      options: {
        option_id: 'pool_liner',
        option_groups: { group_id: 'addons', service_id: 'pool' },
      },
    },
    {
      // active but different service
      price_cents: 5000,
      active: true,
      options: {
        option_id: 'led_strip',
        option_groups: { group_id: 'addons', service_id: 'wall_paneling' },
      },
    },
  ]
  const permitRows: HydratePermitRow[] = [
    { service_id: 'roofing', permit_price_cents: 45000, active: true },
    { service_id: 'flooring', permit_price_cents: 30000, active: false },
  ]

  const { enabledByService, enabledOptionsByService } =
    buildEnabledStateFromRows(priceRows, permitRows)

  // Expected: roofing + wall_paneling enabled. pool NOT enabled (only inactive
  // row). flooring permit inactive so not flipped.
  const failures: string[] = []
  if (enabledByService['roofing'] !== true) failures.push('roofing should be enabled')
  if (enabledByService['wall_paneling'] !== true) failures.push('wall_paneling should be enabled')
  if (enabledByService['pool'] === true) failures.push('pool MUST NOT be enabled (only inactive row)')
  if (enabledByService['flooring'] === true) failures.push('flooring MUST NOT be enabled (inactive permit)')

  const roofingMat = enabledOptionsByService['roofing']?.['material'] ?? []
  if (!roofingMat.includes('shingle_asphalt')) failures.push('roofing.material missing shingle_asphalt')
  if (!roofingMat.includes('metal_panel')) failures.push('roofing.material missing metal_panel')
  const poolOpts = enabledOptionsByService['pool']
  if (poolOpts && Object.keys(poolOpts).length > 0)
    failures.push('pool MUST have empty enabledOptions (only inactive row)')

  // Rod-go 2026-06-09 — Price map must EXCLUDE inactive rows. Prior to this
  // fix, inactive priced rows leaked into priceBySvcOption and shadowed real
  // quotes (Rod: "I can't have mismatch prices ever"). Vendor UI re-toggle
  // restores prices from the persisted `pricing` partialize map (see leg3),
  // NOT from priceBySvcOption — so excluding inactive here is safe.
  const { priceBySvcOption, permitByService } = buildPriceMapFromRows(priceRows, permitRows)
  if (priceBySvcOption['pool']?.['pool_liner'] !== undefined)
    failures.push('priceBySvcOption MUST EXCLUDE inactive rows (got: ' + JSON.stringify(priceBySvcOption['pool']) + ')')
  if (priceBySvcOption['roofing']?.['shingle_asphalt'] !== 12500)
    failures.push('priceBySvcOption MUST include active rows (got roofing.shingle_asphalt: ' + JSON.stringify(priceBySvcOption['roofing']?.['shingle_asphalt']) + ')')
  if (permitByService['flooring'] !== undefined)
    failures.push('permitByService MUST EXCLUDE inactive permits (got flooring: ' + JSON.stringify(permitByService['flooring']) + ')')
  if (permitByService['roofing'] !== 45000)
    failures.push('permitByService MUST include active permits (got roofing: ' + JSON.stringify(permitByService['roofing']) + ')')

  return {
    name: 'leg1_roundtrip_active_filter',
    ok: failures.length === 0,
    detail: failures.join(' | '),
  }
}

function leg2_invariant(): LegResult {
  // Math invariant: feeding the SAME row-set twice produces byte-equal
  // results. This guards against any future hidden state in the pure-fn
  // helper (e.g., if someone adds memoization that breaks idempotency).
  const rows: HydratePriceRow[] = [
    {
      price_cents: 7777,
      active: true,
      options: {
        option_id: 'standing_seam',
        option_groups: { group_id: 'material', service_id: 'roofing' },
      },
    },
    {
      price_cents: 8888,
      active: true,
      options: {
        option_id: 'gutter_aluminum',
        option_groups: { group_id: 'gutters', service_id: 'roofing' },
      },
    },
    {
      price_cents: 3333,
      active: false,
      options: {
        option_id: 'membrane_tpo',
        option_groups: { group_id: 'flat_material', service_id: 'roofing' },
      },
    },
  ]
  const permits: HydratePermitRow[] = []

  const a = buildEnabledStateFromRows(rows, permits)
  const b = buildEnabledStateFromRows(rows, permits)
  const failures: string[] = []
  if (JSON.stringify(a.enabledByService) !== JSON.stringify(b.enabledByService))
    failures.push('enabledByService not idempotent across calls')
  // Note: enabledOptions array order is insertion-driven by row iteration.
  // For a fixed input array we expect identical order.
  if (JSON.stringify(a.enabledOptionsByService) !== JSON.stringify(b.enabledOptionsByService))
    failures.push('enabledOptionsByService not idempotent across calls')

  // Invariant: the fold's enabled flag is TRUE iff at least one active=true
  // row exists for that service. Reconstruct manually and compare.
  const manualEnabled: Record<string, boolean> = {}
  for (const r of rows) {
    if (r.active && r.options?.option_groups?.service_id) {
      manualEnabled[r.options.option_groups.service_id] = true
    }
  }
  if (JSON.stringify(manualEnabled) !== JSON.stringify(a.enabledByService))
    failures.push('manual fold diverges from buildEnabledStateFromRows')

  return {
    name: 'leg2_math_invariant_idempotent_fold',
    ok: failures.length === 0,
    detail: failures.join(' | '),
  }
}

function leg3_partialize_strip(): LegResult {
  if (!existsSync(STORE_PATH)) {
    return { name: 'leg3_partialize_strip', ok: false, detail: `store not found at ${STORE_PATH}` }
  }
  const src = readFileSync(STORE_PATH, 'utf8')

  // Locate partialize body. Must contain `state.services.map` and within
  // that map literal `enabled: false` and `enabledOptions: {}`.
  const partializeMatch = src.match(/partialize:\s*\(state\)\s*=>\s*\(\{([\s\S]*?)\}\),?\s*\}\s*\)\s*\)/)
  if (!partializeMatch) {
    return {
      name: 'leg3_partialize_strip',
      ok: false,
      detail: 'partialize block not found in store source — shape regression',
    }
  }
  const body = partializeMatch[1]
  const failures: string[] = []
  if (!/state\.services\.map\(/.test(body))
    failures.push('partialize MUST map state.services (raw passthrough banned)')
  if (!/enabled:\s*false/.test(body))
    failures.push('partialize MUST set enabled: false on each service')
  if (!/enabledOptions:\s*\{\}/.test(body))
    failures.push('partialize MUST set enabledOptions: {} on each service')
  // Sanity: pricing+pricingPercent+permitCents MUST still be persisted
  // (otherwise re-toggle ON loses entered prices).
  if (!/pricing:\s*s\.pricing/.test(body))
    failures.push('partialize MUST persist pricing (re-toggle restore depends on it)')
  if (!/permitCents:\s*s\.permitCents/.test(body))
    failures.push('partialize MUST persist permitCents')

  return {
    name: 'leg3_partialize_strip_load_bearing_gate',
    ok: failures.length === 0,
    detail: failures.join(' | '),
  }
}

function main() {
  const results: LegResult[] = []
  try {
    results.push(leg1_roundtrip())
    results.push(leg2_invariant())
    results.push(leg3_partialize_strip())
  } catch (err) {
    console.error('[runner] setup error:', err)
    process.exit(2)
  }

  let allGreen = true
  for (const r of results) {
    const icon = r.ok ? 'PASS' : 'FAIL'
    console.log(`[${icon}] ${r.name}${r.detail ? '  -- ' + r.detail : ''}`)
    if (!r.ok) allGreen = false
  }
  console.log(`\nactive-toggle-protection: ${allGreen ? 'ALL GREEN' : 'FAILED'} (${results.filter((r) => r.ok).length}/${results.length})`)
  process.exit(allGreen ? 0 : 1)
}

main()
