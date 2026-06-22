#!/usr/bin/env node
/*
 * rename-wall-paneling-labels.mjs — wall-paneling group-label rename ES→EN.
 *
 * Scoped UPDATE on option_groups.label WHERE service_id='wall_paneling'.
 * Pure text rename — does NOT touch options, sort_order, structure, or any
 * other service. Slugs are LEFT ALONE (incl. the 'sitema' typo per kratos
 * directive — slug stability preserves FK plumbing + frontend lookups).
 *
 * Mapping (11 groups, Rod-locked 2026-06-02):
 *   laminas-de-pvc          → "PVC Panels"
 *   wallpanels-interior     → "Interior Wall Panels"
 *   wallpanels-exterior     → "Exterior Wall Panels"
 *   flat-panels             → "Flat Panels" (unchanged, idempotent set)
 *   pu-stone-piedra         → "PU Stone"
 *   sitema-de-luces         → "Lighting"
 *   grama-artificial        → "Artificial Grass"
 *   herramientas            → "Tools"
 *   wallpanel-lego          → "Lego Wall Panels"
 *   liston-decorativo       → "Decorative Trim"
 *   corner-para-wallpanels  → "Wall Panel Corners"
 *
 * Steps:
 *   1. SELECT all wall_paneling groups: cache (group_id, label_before).
 *   2. UPDATE label per slug match. Skips with no-op if label already matches.
 *   3. VERIFY: re-SELECT all wall_paneling groups + count options per group
 *      to confirm 0 orphans, 84 total options still attached.
 *   4. Print before/after table.
 *
 * Usage (from /tmp/bc-post461, requires service_role):
 *   bash -c 'set -a; source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env; set +a; \
 *     node scripts/rename-wall-paneling-labels.mjs'
 *
 * DRY-RUN: pass --dry to print the plan WITHOUT writing.
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY = process.argv.includes('--dry')

if (!URL || !KEY) {
  console.error('FATAL: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.')
  process.exit(1)
}

const SERVICE_ID = 'wall_paneling'

const LABEL_MAP = {
  'laminas-de-pvc': 'PVC Panels',
  'wallpanels-interior': 'Interior Wall Panels',
  'wallpanels-exterior': 'Exterior Wall Panels',
  'flat-panels': 'Flat Panels',
  'pu-stone-piedra': 'PU Stone',
  'sitema-de-luces': 'Lighting',
  'grama-artificial': 'Artificial Grass',
  'herramientas': 'Tools',
  'wallpanel-lego': 'Lego Wall Panels',
  'liston-decorativo': 'Decorative Trim',
  'corner-para-wallpanels': 'Wall Panel Corners',
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

console.log(`[rename] mode: ${DRY ? 'DRY-RUN' : 'LIVE'}`)
console.log(`[rename] service_id: ${SERVICE_ID}`)
console.log(`[rename] slug→label mappings: ${Object.keys(LABEL_MAP).length}`)
console.log('')

// Step 1: cache before-state
console.log('[step 1] SELECT wall_paneling groups (before)')
const { data: before, error: beforeErr } = await supabase
  .from('option_groups')
  .select('id, group_id, label, sort_order')
  .eq('service_id', SERVICE_ID)
  .order('sort_order', { ascending: true })

if (beforeErr) {
  console.error('[step 1] SELECT failed:', beforeErr)
  process.exit(2)
}

console.log(`[step 1] cached ${before.length} groups`)
console.log('')

const beforeBySlug = new Map(before.map((g) => [g.group_id, g]))
const missing = Object.keys(LABEL_MAP).filter((slug) => !beforeBySlug.has(slug))
const extra = before.map((g) => g.group_id).filter((slug) => !(slug in LABEL_MAP))
if (missing.length > 0) {
  console.warn(`[step 1] WARN: ${missing.length} mapped slugs not found in DB:`, missing)
}
if (extra.length > 0) {
  console.warn(`[step 1] WARN: ${extra.length} DB slugs not in mapping (will not be touched):`, extra)
}

// Step 2: UPDATE per slug
console.log('[step 2] UPDATE labels per slug')
const ops = []
for (const [slug, newLabel] of Object.entries(LABEL_MAP)) {
  const row = beforeBySlug.get(slug)
  if (!row) {
    ops.push({ slug, before: '(missing)', after: newLabel, action: 'skip-missing' })
    continue
  }
  if (row.label === newLabel) {
    ops.push({ slug, before: row.label, after: newLabel, action: 'skip-noop' })
    continue
  }
  if (DRY) {
    ops.push({ slug, before: row.label, after: newLabel, action: 'dry-update' })
    continue
  }
  const { error: updErr } = await supabase
    .from('option_groups')
    .update({ label: newLabel })
    .eq('service_id', SERVICE_ID)
    .eq('group_id', slug)
  if (updErr) {
    console.error(`[step 2] UPDATE ${slug} failed:`, updErr)
    process.exit(3)
  }
  ops.push({ slug, before: row.label, after: newLabel, action: 'updated' })
}

// Step 3: VERIFY
console.log('[step 3] VERIFY wall_paneling groups + option counts (after)')
const { data: after, error: afterErr } = await supabase
  .from('option_groups')
  .select('id, group_id, label, sort_order, options(id)')
  .eq('service_id', SERVICE_ID)
  .order('sort_order', { ascending: true })

if (afterErr) {
  console.error('[step 3] SELECT failed:', afterErr)
  process.exit(4)
}

const totalOptions = after.reduce((sum, g) => sum + (g.options?.length ?? 0), 0)
const orphans = after.filter((g) => (g.options?.length ?? 0) === 0)
console.log(`[step 3] groups: ${after.length}, total options: ${totalOptions}, orphans: ${orphans.length}`)
console.log('')

// Step 4: before/after table
console.log('[step 4] BEFORE → AFTER label table:')
console.log('slug                          | before                              | after                       | options | action')
console.log('------------------------------+-------------------------------------+-----------------------------+---------+--------------')
for (const op of ops) {
  const afterRow = after.find((g) => g.group_id === op.slug)
  const optCount = afterRow ? (afterRow.options?.length ?? 0) : 0
  console.log(
    `${op.slug.padEnd(30)} | ${String(op.before).padEnd(35)} | ${String(op.after).padEnd(27)} | ${String(optCount).padStart(7)} | ${op.action}`,
  )
}

console.log('')
console.log(`[done] ${DRY ? 'DRY-RUN' : 'LIVE'} complete. groups=${after.length}, total_options=${totalOptions}, orphans=${orphans.length}.`)
if (after.length !== 11 || totalOptions !== 84 || orphans.length !== 0) {
  console.error(`[done] ANOMALY: expected 11 groups / 84 options / 0 orphans, got ${after.length} / ${totalOptions} / ${orphans.length}.`)
  process.exit(5)
}
