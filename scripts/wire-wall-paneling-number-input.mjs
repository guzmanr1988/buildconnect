#!/usr/bin/env node
/*
 * wire-wall-paneling-number-input.mjs — STEP 3 prep (DO NOT RUN until kratos go).
 *
 * Wires per-option inputType='number-input' + priceUnit onto ALL 84 wall-paneling
 * options, scoped to service_id='wall_paneling'. Two phases in one script:
 *
 *   Phase A: DDL — apply migration 063 (alter table add column input_type)
 *            via Supabase Management API. Idempotent (IF NOT EXISTS).
 *   Phase B: DATA — non-truncating per-row UPDATE on options.input_type +
 *            options.price_unit, grouped by option_groups.group_id slug.
 *
 * NON-TRUNCATING discipline: no delete-then-insert, no full-table touch. Only
 * the 84 wall-paneling option rows are UPDATEd. Empty-window is zero (read-
 * modify-write per row). Slugs untouched.
 *
 * Per-group priceUnit mapping (kratos directive 2026-06-02, msg 1780442808980):
 *   8 panel groups → 'linear_ft'  (label "Linear ft")
 *     - laminas-de-pvc
 *     - wallpanels-interior
 *     - wallpanels-exterior
 *     - flat-panels
 *     - pu-stone-piedra
 *     - wallpanel-lego
 *     - liston-decorativo
 *     - corner-para-wallpanels
 *   grama-artificial   → 'sqft'   (label "Sq ft")
 *   herramientas       → null     (label "Quantity" — plain count, no enum fit)
 *   sitema-de-luces    → null     (label "Quantity" — plain count, no enum fit)
 *
 * All options get input_type='number-input' regardless of group.
 *
 * Steps:
 *   1. Phase A: apply migration 063 DDL via Mgmt API (skip if --skip-ddl).
 *   2. Phase B step 1: SELECT all wall_paneling option_groups + their options
 *      (cache before-state).
 *   3. Phase B step 2: For each option, UPDATE input_type + price_unit per
 *      group mapping. Skip no-op (already set to target).
 *   4. Phase B step 3: VERIFY — re-SELECT, group counts by (input_type, price_unit),
 *      confirm 84/84 input_type='number-input', expected priceUnit distribution.
 *
 * Usage (from /tmp/bc-post461; requires SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ACCESS_TOKEN):
 *   bash -c 'set -a; source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env; set +a; \
 *     node scripts/wire-wall-paneling-number-input.mjs'
 *
 * Flags:
 *   --dry        Print plan; do NOT write anything (no DDL, no UPDATEs).
 *   --skip-ddl   Skip Phase A (e.g. migration 063 already applied).
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = (URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
const DRY = process.argv.includes('--dry')
const SKIP_DDL = process.argv.includes('--skip-ddl')

if (!URL || !KEY) {
  console.error('FATAL: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.')
  process.exit(1)
}
if (!SKIP_DDL && !DRY && !MGMT_TOKEN) {
  console.error('FATAL: SUPABASE_ACCESS_TOKEN required for Phase A (Mgmt API DDL).')
  console.error('       Pass --skip-ddl if migration 063 is already applied.')
  process.exit(1)
}

const SERVICE_ID = 'wall_paneling'

const PANEL_GROUPS = new Set([
  'laminas-de-pvc',
  'wallpanels-interior',
  'wallpanels-exterior',
  'flat-panels',
  'pu-stone-piedra',
  'wallpanel-lego',
  'liston-decorativo',
  'corner-para-wallpanels',
])
const SQFT_GROUPS = new Set(['grama-artificial'])
const COUNT_GROUPS = new Set(['herramientas', 'sitema-de-luces'])

function targetPriceUnitFor(groupSlug) {
  if (PANEL_GROUPS.has(groupSlug)) return 'linear_ft'
  if (SQFT_GROUPS.has(groupSlug)) return 'sqft'
  if (COUNT_GROUPS.has(groupSlug)) return null
  return null
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

console.log(`[wire] mode: ${DRY ? 'DRY-RUN' : 'LIVE'}`)
console.log(`[wire] service_id: ${SERVICE_ID}`)
console.log(`[wire] skip_ddl: ${SKIP_DDL}`)
console.log('')

// Phase A: DDL
if (!SKIP_DDL) {
  console.log('[phase A] apply migration 063 (alter table add column input_type) via Mgmt API')
  if (DRY) {
    console.log('[phase A] DRY-RUN: would POST to https://api.supabase.com/v1/projects/' + PROJECT_REF + '/database/query')
  } else {
    const ddl = `
      alter table public.options add column if not exists input_type text;
      alter table public.sub_options add column if not exists input_type text;
    `
    const resp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: ddl }),
    })
    if (!resp.ok) {
      const txt = await resp.text()
      console.error('[phase A] DDL failed:', resp.status, txt)
      process.exit(2)
    }
    console.log('[phase A] DDL OK')
  }
  console.log('')
}

// Phase B step 1: SELECT before-state
console.log('[phase B.1] SELECT wall_paneling option_groups + options (before)')
const { data: groups, error: gErr } = await supabase
  .from('option_groups')
  .select('id, group_id, label, sort_order, options(id, option_id, label, input_type, price_unit)')
  .eq('service_id', SERVICE_ID)
  .order('sort_order', { ascending: true })

if (gErr) {
  console.error('[phase B.1] SELECT failed:', gErr)
  process.exit(3)
}

const totalOptionsBefore = groups.reduce((sum, g) => sum + (g.options?.length ?? 0), 0)
console.log(`[phase B.1] cached ${groups.length} groups, ${totalOptionsBefore} options`)
console.log('')

// Phase B step 2: per-row UPDATE
console.log('[phase B.2] UPDATE input_type + price_unit per option')
const ops = []
for (const g of groups) {
  const targetUnit = targetPriceUnitFor(g.group_id)
  for (const opt of g.options ?? []) {
    const needsInputType = opt.input_type !== 'number-input'
    const needsPriceUnit = opt.price_unit !== targetUnit
    if (!needsInputType && !needsPriceUnit) {
      ops.push({ group: g.group_id, option: opt.option_id, action: 'skip-noop' })
      continue
    }
    if (DRY) {
      ops.push({
        group: g.group_id,
        option: opt.option_id,
        before_input_type: opt.input_type,
        after_input_type: 'number-input',
        before_price_unit: opt.price_unit,
        after_price_unit: targetUnit,
        action: 'dry-update',
      })
      continue
    }
    const { error: uErr } = await supabase
      .from('options')
      .update({ input_type: 'number-input', price_unit: targetUnit })
      .eq('id', opt.id)
    if (uErr) {
      console.error(`[phase B.2] UPDATE option ${opt.option_id} (group ${g.group_id}) failed:`, uErr)
      process.exit(4)
    }
    ops.push({
      group: g.group_id,
      option: opt.option_id,
      before_input_type: opt.input_type,
      after_input_type: 'number-input',
      before_price_unit: opt.price_unit,
      after_price_unit: targetUnit,
      action: 'updated',
    })
  }
}
const updatedCount = ops.filter((o) => o.action === 'updated' || o.action === 'dry-update').length
const noopCount = ops.filter((o) => o.action === 'skip-noop').length
console.log(`[phase B.2] ${updatedCount} updates, ${noopCount} no-ops, ${ops.length} total option rows handled`)
console.log('')

// Phase B step 3: VERIFY
console.log('[phase B.3] VERIFY (after)')
const { data: groupsAfter, error: aErr } = await supabase
  .from('option_groups')
  .select('id, group_id, label, options(id, input_type, price_unit)')
  .eq('service_id', SERVICE_ID)
  .order('sort_order', { ascending: true })

if (aErr) {
  console.error('[phase B.3] SELECT failed:', aErr)
  process.exit(5)
}

const dist = { 'number-input/linear_ft': 0, 'number-input/sqft': 0, 'number-input/null': 0, other: 0 }
const perGroup = []
let totalAfter = 0
for (const g of groupsAfter) {
  const opts = g.options ?? []
  totalAfter += opts.length
  const counts = { 'number-input/linear_ft': 0, 'number-input/sqft': 0, 'number-input/null': 0, other: 0 }
  for (const o of opts) {
    const key = `${o.input_type}/${o.price_unit ?? 'null'}`
    if (key in dist) { dist[key]++; counts[key]++ } else { dist.other++; counts.other++ }
  }
  perGroup.push({ group: g.group_id, n: opts.length, counts })
}

console.log(`[phase B.3] total options: ${totalAfter}`)
console.log('[phase B.3] distribution:')
for (const [k, v] of Object.entries(dist)) console.log(`  ${k.padEnd(28)} : ${v}`)
console.log('')
console.log('[phase B.3] per-group:')
for (const g of perGroup) {
  const main = Object.entries(g.counts).find(([_, v]) => v === g.n)?.[0] ?? 'mixed'
  console.log(`  ${g.group.padEnd(28)} | n=${String(g.n).padStart(2)} | ${main}`)
}
console.log('')

// Expected: 84 total. distribution per spec:
//   8 panel groups × ~10 each = ~74 linear_ft
//   grama-artificial (~3) = sqft
//   herramientas (~4) + sitema-de-luces (~3) = ~7 null
const expected = {
  totalAfter: 84,
  numberInput: dist['number-input/linear_ft'] + dist['number-input/sqft'] + dist['number-input/null'],
}
const numberInputTotal = expected.numberInput
console.log(`[done] ${DRY ? 'DRY-RUN' : 'LIVE'} complete.`)
console.log(`[done] expected: 84 total / all number-input.`)
console.log(`[done] actual:   ${totalAfter} total / ${numberInputTotal} number-input / ${dist.other} other.`)
if (totalAfter !== 84 || numberInputTotal !== 84 || dist.other !== 0) {
  console.error('[done] ANOMALY — re-check before STEP 3 finalization.')
  process.exit(6)
}
