#!/usr/bin/env node
/*
 * fix-pr-price-unit-backfill.mjs - Path C backfill of options.price_unit (and
 * sub_options.price_unit, no-op) to mirror the FE-side OPTION_METADATA +
 * OPTION_METADATA_BY_SERVICE map. Pairs with PR #145 amend (priceUnit field
 * surfaced in admin Option / Sub-Option dialogs + threaded through catalog
 * store + getOptionMetadata).
 *
 * Discipline: zero behavior change on first ship. Every UPDATE here mirrors
 * exactly what getOptionMetadata returns today for that (optionId, serviceId)
 * pair, so the new "catalog priceUnit wins, fallback to OPTION_METADATA" path
 * resolves to the same string for every existing row.
 *
 * Sub-options touched today: NONE. low_e / casement carry only
 * supportsPercentMarkup, no priceUnit. Skipped.
 *
 * Usage:
 *   set -a; source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env; set +a
 *   export VITE_SUPABASE_URL="$SUPABASE_URL"
 *   node scripts/fix-pr-price-unit-backfill.mjs --dry-run
 *   node scripts/fix-pr-price-unit-backfill.mjs
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1) }
const DRY_RUN = process.argv.includes('--dry-run')
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

// (option_group_id, option_id) → price_unit. Multiple rows can share an
// option_id across groups; we scope by group_id to preserve service semantics.
const PLAN = [
  // roofing / Roofing Material — square
  { group: '7806cb2b-eb94-4117-97fb-35987ebdc608', option: 'metal',         unit: 'square' },
  { group: '7806cb2b-eb94-4117-97fb-35987ebdc608', option: 'shingle',       unit: 'square' },
  { group: '7806cb2b-eb94-4117-97fb-35987ebdc608', option: 'barrel_tile',   unit: 'square' },
  { group: '7806cb2b-eb94-4117-97fb-35987ebdc608', option: 'aluminum',      unit: 'square' },
  { group: '7806cb2b-eb94-4117-97fb-35987ebdc608', option: 'flat_roof',     unit: 'square' },
  // roofing / Add-Ons — linear_ft + sqft
  { group: '15d1c371-8310-40ee-bad7-7e238f90f2c2', option: 'gutters',       unit: 'linear_ft' },
  { group: '15d1c371-8310-40ee-bad7-7e238f90f2c2', option: 'soffit_wood',   unit: 'linear_ft' },
  { group: '15d1c371-8310-40ee-bad7-7e238f90f2c2', option: 'fascia_wood',   unit: 'linear_ft' },
  { group: '15d1c371-8310-40ee-bad7-7e238f90f2c2', option: 'soffit_metal',  unit: 'linear_ft' },
  { group: '15d1c371-8310-40ee-bad7-7e238f90f2c2', option: 'fascia_metal',  unit: 'linear_ft' },
  { group: '15d1c371-8310-40ee-bad7-7e238f90f2c2', option: 'insulation',    unit: 'sqft' },
  // roofing / Repair Materials — sqft
  { group: '493fc88d-9019-4ee2-9945-cf3fbb708674', option: 'repair_shingle',     unit: 'sqft' },
  { group: '493fc88d-9019-4ee2-9945-cf3fbb708674', option: 'repair_barrel_tile', unit: 'sqft' },
  { group: '493fc88d-9019-4ee2-9945-cf3fbb708674', option: 'repair_metal',       unit: 'sqft' },
  { group: '493fc88d-9019-4ee2-9945-cf3fbb708674', option: 'repair_aluminum',    unit: 'sqft' },
  { group: '493fc88d-9019-4ee2-9945-cf3fbb708674', option: 'repair_terracotta',  unit: 'sqft' },
  { group: '493fc88d-9019-4ee2-9945-cf3fbb708674', option: 'repair_flat_roof',   unit: 'sqft' },
  // pool / Pool Size — sqft (per OPTION_METADATA_BY_SERVICE.pool.custom)
  { group: '1a3a9f94-7a95-45f8-ae97-2592770890fc', option: 'custom',           unit: 'sqft' },
  // pool / Pool Floor — sqft (per OPTION_METADATA_BY_SERVICE.pool)
  { group: '9628cd7d-0ef4-462a-8606-ddd73d42784d', option: 'travertine',       unit: 'sqft' },
  { group: '9628cd7d-0ef4-462a-8606-ddd73d42784d', option: 'pavers',           unit: 'sqft' },
  { group: '9628cd7d-0ef4-462a-8606-ddd73d42784d', option: 'stamped_concrete', unit: 'sqft' },
  { group: '9628cd7d-0ef4-462a-8606-ddd73d42784d', option: 'cement_floor',     unit: 'sqft' },
  { group: '9628cd7d-0ef4-462a-8606-ddd73d42784d', option: 'artificial_turf',  unit: 'sqft' },
  { group: '9628cd7d-0ef4-462a-8606-ddd73d42784d', option: 'square_concrete',  unit: 'sqft' },
  // pool / Add-Ons — linear_ft
  { group: 'fded898f-7154-4a36-863e-21d7270210c6', option: 'pool_fence',       unit: 'linear_ft' },
  // driveways / Surface Material — sqft for square_concrete only (pavers stays flat per comment)
  { group: '3589cbcf-ff69-434b-8a57-15b0cc840919', option: 'square_concrete',  unit: 'sqft' },
  // pergolas / Structure Type — aluminum mirrors current global-map fall-through (no per-service override)
  { group: '4695c6fb-c146-447f-9fdb-f2bb106c7505', option: 'aluminum',         unit: 'square' },
]

function fatal(msg) { console.error(`FATAL: ${msg}`); process.exit(1) }

async function main() {
  console.log(`PR #145 Path C - price_unit backfill${DRY_RUN ? ' (DRY RUN)' : ''}\n`)

  // ---- pre-assertions
  const { data: pre, error: preErr } = await sb.from('options').select('id, option_id, option_group_id, price_unit').not('price_unit', 'is', null)
  if (preErr) fatal(`pre-fetch: ${preErr.message}`)
  console.log(`PRE: options w/ price_unit set = ${pre.length}`)
  if (pre.length !== 0) {
    console.log('  existing values:')
    for (const o of pre) console.log(`    ${o.option_id} = ${o.price_unit} (group=${o.option_group_id})`)
    fatal('expected 0 options with price_unit pre-backfill (idempotency safety)')
  }
  const { data: preSub } = await sb.from('sub_options').select('id, sub_option_id, price_unit').not('price_unit', 'is', null)
  console.log(`PRE: sub_options w/ price_unit set = ${preSub?.length ?? 0}`)
  if ((preSub?.length ?? 0) !== 0) fatal('expected 0 sub_options with price_unit pre-backfill')
  console.log('Pre-assertions: PASS\n')

  // ---- expand plan to row-level: each (group, option_id) maps to exactly 1 row
  const targets = []
  for (const p of PLAN) {
    const { data: rows, error } = await sb.from('options').select('id, option_id').eq('option_group_id', p.group).eq('option_id', p.option)
    if (error) fatal(`fetch (${p.group}/${p.option}): ${error.message}`)
    if (rows.length !== 1) fatal(`expected 1 row for (${p.group}/${p.option}), got ${rows.length}`)
    targets.push({ rowId: rows[0].id, optionId: p.option, group: p.group, unit: p.unit })
  }
  console.log(`Plan resolved: ${targets.length} rows to update\n`)
  for (const t of targets) console.log(`  ${t.optionId} (${t.group}) -> ${t.unit}`)
  console.log('')

  if (DRY_RUN) {
    console.log('DRY RUN — re-run without --dry-run to apply.')
    return
  }

  // ---- mutations (per-row UPDATE; small N, no need for bulk)
  let updated = 0
  for (const t of targets) {
    const { error } = await sb.from('options').update({ price_unit: t.unit }).eq('id', t.rowId)
    if (error) fatal(`update ${t.rowId} (${t.optionId}): ${error.message}`)
    updated++
  }
  console.log(`Updated ${updated} options rows.\n`)

  // ---- post-assertions
  const { data: post, error: postErr } = await sb.from('options').select('id, option_id, option_group_id, price_unit').not('price_unit', 'is', null).order('option_id')
  if (postErr) fatal(`post-fetch: ${postErr.message}`)
  console.log(`POST: options w/ price_unit set = ${post.length}`)
  for (const o of post) console.log(`  ${o.option_id} = ${o.price_unit} (group=${o.option_group_id})`)
  if (post.length !== PLAN.length) fatal(`expected ${PLAN.length} options post-backfill, got ${post.length}`)

  // verify each plan entry resolved correctly
  const postBy = new Map(post.map(o => [`${o.option_group_id}/${o.option_id}`, o.price_unit]))
  for (const p of PLAN) {
    const got = postBy.get(`${p.group}/${p.option}`)
    if (got !== p.unit) fatal(`mismatch (${p.group}/${p.option}): expected ${p.unit}, got ${got}`)
  }
  console.log('\nPost-assertions: PASS')
  console.log('Done.')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
