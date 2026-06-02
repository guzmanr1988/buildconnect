#!/usr/bin/env node
/*
 * canary-wall-paneling-number-input.mjs — STEP 2.5 canary (kratos
 * msg 1780443541961, 2026-06-02).
 *
 * Goal: prove migration 063 + single-row UPDATE is safe and renders correctly
 * BEFORE running the full 84-option STEP 3 write. Apollo's STEP 2 verify was
 * structural-pass on a stub; this canary lets him verify on a REAL option
 * (inline-$ + "N lin ft" value-chip legs unverifiable on stub).
 *
 * Phases:
 *   A. DDL: apply migration 063 (alter table options add column if not exists
 *      input_type text) via Mgmt API. Additive, nullable, reversible.
 *   B. SELECT all 84 wall_paneling options (before-state).
 *   C. UPDATE exactly ONE option:
 *        group  = 'laminas-de-pvc'
 *        option = 'black-and-white'
 *        set    input_type='number-input', price_unit='linear_ft'
 *      NO price seed — option stays unpriced per kratos directive (matches
 *      ship-time state; Rod prices later).
 *   D. VERIFY:
 *      - target option row has input_type='number-input' + price_unit='linear_ft'
 *      - the OTHER 83 wall_paneling options are unchanged (input_type stays NULL,
 *        price_unit unchanged from before)
 *      - total still 84 / 11 groups / 0 orphans
 *
 * Usage (from /tmp/bc-post461, requires SUPABASE_SERVICE_ROLE_KEY +
 * SUPABASE_ACCESS_TOKEN):
 *   bash -c 'set -a; source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env; set +a; \
 *     node scripts/canary-wall-paneling-number-input.mjs'
 *
 * Flags:
 *   --dry        Print plan; no DDL, no UPDATE.
 *   --skip-ddl   Skip Phase A (migration 063 already applied).
 *
 * Reversibility: single-row UPDATE — to undo, set input_type=NULL + price_unit
 * back to its before value on that one row.
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
  console.error('FATAL: SUPABASE_ACCESS_TOKEN required for Phase A.')
  console.error('       Pass --skip-ddl if migration 063 is already applied.')
  process.exit(1)
}

const SERVICE_ID = 'wall_paneling'
const CANARY_GROUP = 'laminas-de-pvc'
const CANARY_OPTION = 'black-and-white'
const TARGET_INPUT_TYPE = 'number-input'
const TARGET_PRICE_UNIT = 'linear_ft'

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

console.log(`[canary] mode: ${DRY ? 'DRY-RUN' : 'LIVE'}`)
console.log(`[canary] target: service=${SERVICE_ID} / group=${CANARY_GROUP} / option=${CANARY_OPTION}`)
console.log(`[canary] set: input_type=${TARGET_INPUT_TYPE}, price_unit=${TARGET_PRICE_UNIT}`)
console.log(`[canary] skip_ddl: ${SKIP_DDL}`)
console.log('')

// Phase A: DDL via Mgmt API
if (!SKIP_DDL) {
  console.log('[A] apply migration 063 (alter table add column if not exists input_type) via Mgmt API')
  if (DRY) {
    console.log(`[A] DRY-RUN: would POST to https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`)
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
      console.error('[A] DDL failed:', resp.status, txt)
      process.exit(2)
    }
    console.log('[A] DDL OK (options.input_type + sub_options.input_type columns ensured)')
  }
  console.log('')
}

// Phase B: SELECT before-state (all 84)
console.log('[B] SELECT all wall_paneling options (before)')
const { data: groupsBefore, error: bErr } = await supabase
  .from('option_groups')
  .select('id, group_id, label, sort_order, options(id, option_id, label, input_type, price_unit)')
  .eq('service_id', SERVICE_ID)
  .order('sort_order', { ascending: true })

if (bErr) {
  console.error('[B] SELECT failed:', bErr)
  process.exit(3)
}

const allBefore = []
for (const g of groupsBefore) {
  for (const o of g.options ?? []) {
    allBefore.push({
      group_id: g.group_id,
      option_id: o.option_id,
      id: o.id,
      input_type: o.input_type,
      price_unit: o.price_unit,
    })
  }
}
const targetBefore = allBefore.find(
  (r) => r.group_id === CANARY_GROUP && r.option_id === CANARY_OPTION,
)
console.log(`[B] cached ${groupsBefore.length} groups / ${allBefore.length} options`)
if (!targetBefore) {
  console.error(`[B] FATAL: target option not found (group=${CANARY_GROUP}, option=${CANARY_OPTION})`)
  console.error('[B] laminas-de-pvc options found:', allBefore.filter((r) => r.group_id === CANARY_GROUP).map((r) => r.option_id))
  process.exit(4)
}
console.log(`[B] target before: id=${targetBefore.id}, input_type=${targetBefore.input_type}, price_unit=${targetBefore.price_unit}`)
console.log('')

// Phase C: UPDATE single row
console.log('[C] UPDATE single row')
if (DRY) {
  console.log(`[C] DRY-RUN: would UPDATE options SET input_type='${TARGET_INPUT_TYPE}', price_unit='${TARGET_PRICE_UNIT}' WHERE id='${targetBefore.id}'`)
} else {
  const { error: uErr } = await supabase
    .from('options')
    .update({ input_type: TARGET_INPUT_TYPE, price_unit: TARGET_PRICE_UNIT })
    .eq('id', targetBefore.id)
  if (uErr) {
    console.error('[C] UPDATE failed:', uErr)
    process.exit(5)
  }
  console.log('[C] UPDATE OK')
}
console.log('')

// Phase D: VERIFY
console.log('[D] VERIFY (after)')
const { data: groupsAfter, error: aErr } = await supabase
  .from('option_groups')
  .select('id, group_id, label, sort_order, options(id, option_id, label, input_type, price_unit)')
  .eq('service_id', SERVICE_ID)
  .order('sort_order', { ascending: true })

if (aErr) {
  console.error('[D] SELECT failed:', aErr)
  process.exit(6)
}

const allAfter = []
for (const g of groupsAfter) {
  for (const o of g.options ?? []) {
    allAfter.push({
      group_id: g.group_id,
      option_id: o.option_id,
      id: o.id,
      input_type: o.input_type,
      price_unit: o.price_unit,
    })
  }
}
const targetAfter = allAfter.find((r) => r.id === targetBefore.id)

console.log(`[D] total: ${groupsAfter.length} groups / ${allAfter.length} options`)
console.log(`[D] target after: id=${targetAfter?.id}, input_type=${targetAfter?.input_type}, price_unit=${targetAfter?.price_unit}`)

// Count rows that changed (excluding target)
const beforeById = new Map(allBefore.map((r) => [r.id, r]))
const changedOthers = []
for (const r of allAfter) {
  if (r.id === targetBefore.id) continue
  const b = beforeById.get(r.id)
  if (!b) {
    changedOthers.push({ id: r.id, kind: 'new-row' })
    continue
  }
  if (b.input_type !== r.input_type || b.price_unit !== r.price_unit) {
    changedOthers.push({
      id: r.id,
      group: r.group_id,
      option: r.option_id,
      before: { input_type: b.input_type, price_unit: b.price_unit },
      after: { input_type: r.input_type, price_unit: r.price_unit },
    })
  }
}

console.log(`[D] other 83 rows changed: ${changedOthers.length}`)
if (changedOthers.length > 0) {
  console.error('[D] ANOMALY — other rows touched:', JSON.stringify(changedOthers, null, 2))
  process.exit(7)
}

// Final assertions
const expectedInputType = DRY ? targetBefore.input_type : TARGET_INPUT_TYPE
const expectedPriceUnit = DRY ? targetBefore.price_unit : TARGET_PRICE_UNIT
const targetOK =
  targetAfter?.input_type === expectedInputType &&
  targetAfter?.price_unit === expectedPriceUnit
const totalOK = allAfter.length === 84 && groupsAfter.length === 11

console.log('')
console.log('[done] summary:')
console.log(`  groups=${groupsAfter.length} (expected 11) ${groupsAfter.length === 11 ? '✓' : '✗'}`)
console.log(`  total options=${allAfter.length} (expected 84) ${allAfter.length === 84 ? '✓' : '✗'}`)
console.log(`  target option flipped: ${targetOK ? '✓' : '✗'}`)
console.log(`  other 83 untouched: ${changedOthers.length === 0 ? '✓' : '✗'}`)
console.log(`  canary uuid: ${targetBefore.id}`)
console.log(`  canary group/option_id: ${CANARY_GROUP} / ${CANARY_OPTION}`)
console.log(`  canary route: /home/service/${SERVICE_ID}`)

if (!targetOK || !totalOK || changedOthers.length > 0) {
  console.error('[done] FAILED gates — see above.')
  process.exit(8)
}
console.log(`[done] ${DRY ? 'DRY-RUN' : 'LIVE'} canary PASS`)
