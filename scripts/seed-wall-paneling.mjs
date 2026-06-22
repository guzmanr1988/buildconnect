#!/usr/bin/env node
/*
 * seed-wall-paneling.mjs — WALL-PANELING-SCOPED catalog migration.
 *
 * Replaces the legacy wall_paneling{style,rooms} groups with the 11 new
 * image-tile groups + 84 tiles + image_url. Wall-paneling-SCOPED ONLY —
 * the other 12 services in services/option_groups/options are NEVER
 * touched. NO global truncate.
 *
 * Sequencing (the non-empty-window guarantee):
 *   1. SELECT existing wall_paneling option_groups → cache (id, group_id)
 *   2. INSERT new 11 option_groups with sort_order 100..110 (well above old
 *      sort_order 0,1 — coexist for the brief flush window)
 *   3. INSERT new 84 options with image_url, each under its new group's UUID
 *   4. VERIFY all 11 groups + 84 options present in DB
 *   5. DELETE OLD wall_paneling groups WHERE group_id IN
 *      (existing-old-group-ids) — ON DELETE CASCADE clears their options.
 *      This is the moment legacy style+rooms disappear; new shape is already
 *      live so user never sees an empty catalog.
 *   6. UPDATE new groups sort_order = 0..10 (canonical positions)
 *
 * IDEMPOTENCY: each step is guarded — re-running after a partial failure
 * skips already-applied rows. Specifically:
 *   - Step 2 skips a new group if (service_id='wall_paneling', group_id=X)
 *     already exists.
 *   - Step 3 skips an option if (option_group_id=Y, option_id=Z) already
 *     exists.
 *   - Step 5 only deletes groups whose group_id matches the CACHED-OLD
 *     list from Step 1 (won't accidentally delete a newly-inserted group
 *     if its group_id collides — but it won't, slugs are disjoint).
 *
 * Usage (from /tmp/bc-post461, requires service_role):
 *   VITE_SUPABASE_URL=https://llybxugitrbgybplgpsi.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/seed-wall-paneling.mjs
 *
 *   (or via secrets.env fresh-subshell source pattern)
 *
 * DRY-RUN: pass --dry to print the plan + per-row preview WITHOUT writing.
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
const supabase = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a)
}

async function loadNewWallPaneling() {
  const mod = await import('../src/lib/constants.ts')
  const wp = mod.SERVICE_CATALOG.find((s) => s.id === SERVICE_ID)
  if (!wp) throw new Error(`SERVICE_CATALOG has no service id=${SERVICE_ID}`)
  if (!wp.optionGroups || wp.optionGroups.length === 0) {
    throw new Error('wall_paneling.optionGroups is empty in constants.ts')
  }
  return wp.optionGroups
}

async function step1_snapshotExistingGroups() {
  const { data, error } = await supabase
    .from('option_groups')
    .select('id, group_id, sort_order')
    .eq('service_id', SERVICE_ID)
  if (error) throw new Error(`step1 select: ${error.message}`)
  log(`step1: existing wall_paneling groups in DB: ${data.length}`)
  for (const g of data) log(`        - id=${g.id.slice(0, 8)}... group_id=${g.group_id} sort=${g.sort_order}`)
  return data // [{id, group_id, sort_order}]
}

async function step2_insertNewGroups(newOptionGroups, existingGroups) {
  const existingGroupIds = new Set(existingGroups.map((g) => g.group_id))
  const inserted = []
  for (let i = 0; i < newOptionGroups.length; i++) {
    const g = newOptionGroups[i]
    if (existingGroupIds.has(g.id)) {
      log(`step2: group_id=${g.id} already exists in DB — skipping insert (idempotent)`)
      const existing = existingGroups.find((e) => e.group_id === g.id)
      inserted.push({ ...existing, fromConstants: g })
      continue
    }
    const row = {
      service_id: SERVICE_ID,
      group_id: g.id,
      label: g.label,
      required: g.required ?? false,
      type: g.type ?? 'multi',
      reveals_on_group_id: g.revealsOn?.group ?? null,
      reveals_on_equals: g.revealsOn?.equals ?? null,
      sort_order: 100 + i, // staging-zone sort_order; finalize in step 6
    }
    if (DRY) {
      log(`step2 DRY: INSERT option_groups ${JSON.stringify(row)}`)
      inserted.push({ id: `DRY-${g.id}`, group_id: g.id, fromConstants: g })
      continue
    }
    const { data, error } = await supabase
      .from('option_groups')
      .insert(row)
      .select()
      .single()
    if (error) throw new Error(`step2 insert ${g.id}: ${error.message}`)
    inserted.push({ ...data, fromConstants: g })
    log(`step2: inserted group_id=${g.id} → id=${data.id.slice(0, 8)}...`)
  }
  log(`step2: ${inserted.length} new groups now present`)
  return inserted
}

async function step3_insertNewOptions(groupRecords) {
  let totalInserted = 0
  let totalSkipped = 0
  for (const gr of groupRecords) {
    const g = gr.fromConstants
    if (DRY) {
      log(`step3 DRY: under group_id=${g.id} would insert ${g.options.length} options`)
      totalInserted += g.options.length
      continue
    }
    // Fetch existing options under this group (idempotency check)
    const { data: existingOpts, error: selErr } = await supabase
      .from('options')
      .select('option_id')
      .eq('option_group_id', gr.id)
    if (selErr) throw new Error(`step3 select ${g.id}: ${selErr.message}`)
    const existingOptionIds = new Set((existingOpts ?? []).map((o) => o.option_id))

    for (let oi = 0; oi < g.options.length; oi++) {
      const o = g.options[oi]
      if (existingOptionIds.has(o.id)) {
        totalSkipped++
        continue
      }
      const row = {
        option_group_id: gr.id,
        option_id: o.id,
        label: o.label,
        description: o.description ?? null,
        image_url: o.image_url ?? null,
        sort_order: oi,
      }
      const { error } = await supabase.from('options').insert(row)
      if (error) throw new Error(`step3 insert ${g.id}/${o.id}: ${error.message}`)
      totalInserted++
    }
    log(`step3: group ${g.id} → inserted=${g.options.length - Array.from(existingOptionIds).filter(id => g.options.some(o => o.id === id)).length} skipped=${totalSkipped}`)
  }
  log(`step3: total options inserted=${totalInserted} skipped=${totalSkipped}`)
  return { totalInserted, totalSkipped }
}

async function step4_verify(newOptionGroups) {
  if (DRY) {
    log('step4 DRY: skip verify')
    return true
  }
  const { data, error } = await supabase
    .from('option_groups')
    .select('id, group_id, options(option_id, image_url)')
    .eq('service_id', SERVICE_ID)
  if (error) throw new Error(`step4 verify select: ${error.message}`)

  const newGroupIds = new Set(newOptionGroups.map((g) => g.id))
  const dbNewGroups = data.filter((g) => newGroupIds.has(g.group_id))
  if (dbNewGroups.length !== newOptionGroups.length) {
    throw new Error(
      `step4 verify: expected ${newOptionGroups.length} new groups, found ${dbNewGroups.length}`,
    )
  }

  let expectedOptionCount = 0
  let actualOptionCount = 0
  let missingImageUrl = 0
  for (const expGroup of newOptionGroups) {
    expectedOptionCount += expGroup.options.length
    const dbGroup = dbNewGroups.find((g) => g.group_id === expGroup.id)
    actualOptionCount += dbGroup.options.length
    for (const expOpt of expGroup.options) {
      const dbOpt = dbGroup.options.find((o) => o.option_id === expOpt.id)
      if (!dbOpt) throw new Error(`step4 verify: missing option ${expGroup.id}/${expOpt.id}`)
      if (!dbOpt.image_url) missingImageUrl++
    }
  }
  log(`step4 verify: groups=${dbNewGroups.length}/${newOptionGroups.length} options=${actualOptionCount}/${expectedOptionCount} missing_image_url=${missingImageUrl}`)
  if (actualOptionCount !== expectedOptionCount) {
    throw new Error(`step4 verify: option count mismatch (${actualOptionCount} != ${expectedOptionCount})`)
  }
  if (missingImageUrl > 0) {
    throw new Error(`step4 verify: ${missingImageUrl} options missing image_url`)
  }
  return true
}

async function step5_deleteOldGroups(existingGroups, newOptionGroups) {
  const newGroupIds = new Set(newOptionGroups.map((g) => g.id))
  const oldOnly = existingGroups.filter((g) => !newGroupIds.has(g.group_id))
  if (oldOnly.length === 0) {
    log('step5: no legacy groups to delete (idempotent — already cleaned)')
    return 0
  }
  log(`step5: deleting ${oldOnly.length} legacy groups: ${oldOnly.map((g) => g.group_id).join(', ')}`)
  if (DRY) {
    log(`step5 DRY: would DELETE option_groups WHERE id IN (${oldOnly.map((g) => g.id.slice(0, 8)).join(', ')})`)
    return oldOnly.length
  }
  const oldIds = oldOnly.map((g) => g.id)
  const { error } = await supabase.from('option_groups').delete().in('id', oldIds)
  if (error) throw new Error(`step5 delete: ${error.message}`)
  log(`step5: deleted ${oldOnly.length} legacy groups (options cascade-cleared)`)
  return oldOnly.length
}

async function step6_normalizeSortOrder(newOptionGroups) {
  if (DRY) {
    log('step6 DRY: skip normalize sort_order')
    return
  }
  for (let i = 0; i < newOptionGroups.length; i++) {
    const g = newOptionGroups[i]
    const { error } = await supabase
      .from('option_groups')
      .update({ sort_order: i })
      .eq('service_id', SERVICE_ID)
      .eq('group_id', g.id)
    if (error) throw new Error(`step6 update ${g.id}: ${error.message}`)
  }
  log(`step6: normalized sort_order for ${newOptionGroups.length} new groups → 0..${newOptionGroups.length - 1}`)
}

async function main() {
  log(`=== wall_paneling scoped seed ${DRY ? '[DRY-RUN]' : '[LIVE]'} ===`)
  log(`target: ${URL.replace(/^https:\/\//, '').slice(0, 24)}...`)
  log(`service_role key: ${KEY.slice(0, 12)}...${KEY.slice(-4)}`)
  if (!DRY) log('LIVE-WRITE mode. Proceeding in 2 seconds — Ctrl-C to abort.')
  if (!DRY) await new Promise((r) => setTimeout(r, 2000))

  const newOptionGroups = await loadNewWallPaneling()
  log(`constants.ts has ${newOptionGroups.length} new wall_paneling groups (${newOptionGroups.reduce((n, g) => n + g.options.length, 0)} options total)`)

  const existing = await step1_snapshotExistingGroups()
  const newGroupRecords = await step2_insertNewGroups(newOptionGroups, existing)
  await step3_insertNewOptions(newGroupRecords)
  await step4_verify(newOptionGroups)
  // Step 4 must pass before step 5 — guarantees new shape exists before old deleted (no empty window)
  await step5_deleteOldGroups(existing, newOptionGroups)
  await step6_normalizeSortOrder(newOptionGroups)

  log('=== DONE ===')
}

main().catch((e) => {
  console.error('SEED FAILED:', e.message)
  process.exit(1)
})
