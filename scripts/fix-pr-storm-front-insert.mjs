#!/usr/bin/env node
/*
 * fix-pr-storm-front-insert.mjs - Path C atomic insert for Storm Front product
 * on windows_doors / products. Pairs the bundled SERVICE_CATALOG add (constants.ts)
 * with the server-side mirror per feedback_bundle_edit_needs_server_data_update
 * (n=2 anchor: PR #119 Inspection-Only + PR #141 windows_doors-permit).
 *
 * Inserts (atomic, in order):
 *   1. UPDATE options.sort_order on garage_doors (2 -> 3) so storm_front lands
 *      between doors (1) and garage_doors.
 *   2. INSERT options row storm_front sort_order=2 under products option_group.
 *   3. INSERT 5 sub_groups under storm_front (sizes, types, frame/glass colors,
 *      glass types).
 *   4. INSERT 19 sub_options across those sub_groups.
 *
 * Pre-assertions verify the current 3-option layout (windows / doors / garage_doors)
 * is unchanged. Post-assertions verify 4 options in 0,1,2,3 sort sequence ending
 * windows / doors / storm_front / garage_doors and 5 sub_groups + 19 sub_options
 * under the new option.
 *
 * Usage:
 *   set -a; source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env; set +a
 *   node scripts/fix-pr-storm-front-insert.mjs            # apply
 *   node scripts/fix-pr-storm-front-insert.mjs --dry-run  # preview only
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

const PRODUCTS_OPTION_GROUP_ID = 'c4f6e770-f2dd-422e-baff-fa03e5ddbcbc'
const GARAGE_DOORS_OPTION_ID = 'c92929fd-5112-4288-bcc1-68f649f4df60'

const STORM_FRONT_SUB_GROUPS = [
  {
    sub_group_id: 'storm_front_sizes',
    label: 'Storm Front Sizes',
    type: 'multi',
    sort_order: 0,
    sub_options: [
      { sub_option_id: 'sf_24x80', label: '24\u00d780' },
      { sub_option_id: 'sf_24x96', label: '24\u00d796' },
      { sub_option_id: 'sf_36x80', label: '36\u00d780' },
      { sub_option_id: 'sf_36x96', label: '36\u00d796' },
      { sub_option_id: 'sf_48x80', label: '48\u00d780' },
      { sub_option_id: 'sf_48x96', label: '48\u00d796' },
      { sub_option_id: 'sf_60x80', label: '60\u00d780' },
      { sub_option_id: 'sf_60x96', label: '60\u00d796' },
    ],
  },
  {
    sub_group_id: 'storm_front_types',
    label: 'Storm Front Types',
    type: 'single',
    sort_order: 1,
    sub_options: [
      { sub_option_id: 'storm_front_only', label: 'Storm Front' },
    ],
  },
  {
    sub_group_id: 'sf_frame_colors',
    label: 'Frame Colors',
    type: 'single',
    sort_order: 2,
    sub_options: [
      { sub_option_id: 'white', label: 'White' },
      { sub_option_id: 'bronze', label: 'Bronze' },
      { sub_option_id: 'black', label: 'Black' },
    ],
  },
  {
    sub_group_id: 'sf_glass_colors',
    label: 'Glass Colors',
    type: 'single',
    sort_order: 3,
    sub_options: [
      { sub_option_id: 'grey_white', label: 'Grey-White', description: 'Dark Grey Tinted Glass' },
      { sub_option_id: 'clear_white', label: 'Clear-White', description: 'Light grey tinted' },
      { sub_option_id: 'clear', label: 'Clear' },
      { sub_option_id: 'gray', label: 'Gray', description: 'Tint color grey' },
      { sub_option_id: 'green', label: 'Green', description: 'Low-E Color only' },
    ],
  },
  {
    sub_group_id: 'sf_glass_types',
    label: 'Glass Types',
    type: 'single',
    sort_order: 4,
    sub_options: [
      { sub_option_id: 'impact_glass', label: 'Impact Glass' },
      { sub_option_id: 'low_e', label: 'Low-E Glass' },
    ],
  },
]

const EXPECTED_SUB_OPTION_COUNT = STORM_FRONT_SUB_GROUPS.reduce((s, g) => s + g.sub_options.length, 0)

function fatal(msg) {
  console.error(`FATAL: ${msg}`)
  process.exit(1)
}

async function main() {
  console.log(`PR Path C - storm_front insert${DRY_RUN ? ' (DRY RUN)' : ''}\n`)

  // ------------------------------------------------------------- Pre-assertions
  const { data: pre, error: preErr } = await supabase
    .from('options')
    .select('id, option_id, sort_order')
    .eq('option_group_id', PRODUCTS_OPTION_GROUP_ID)
    .order('sort_order')
  if (preErr) fatal(`pre-fetch options: ${preErr.message}`)

  console.log('PRE-STATE options under products:')
  for (const o of pre) console.log(`  sort=${o.sort_order} ${o.option_id} (${o.id})`)
  console.log('')

  if (pre.length !== 3) fatal(`expected 3 options pre-insert, got ${pre.length}`)
  const expectedPre = [
    { sort_order: 0, option_id: 'windows' },
    { sort_order: 1, option_id: 'doors' },
    { sort_order: 2, option_id: 'garage_doors' },
  ]
  for (let i = 0; i < expectedPre.length; i++) {
    if (pre[i].sort_order !== expectedPre[i].sort_order || pre[i].option_id !== expectedPre[i].option_id) {
      fatal(`pre-state row ${i} mismatch: expected sort=${expectedPre[i].sort_order}/${expectedPre[i].option_id}, got sort=${pre[i].sort_order}/${pre[i].option_id}`)
    }
  }
  if (pre.find((o) => o.option_id === 'storm_front')) fatal('storm_front already exists - aborting (idempotency safety)')
  console.log('Pre-assertions: PASS\n')

  if (DRY_RUN) {
    console.log('DRY RUN - planned mutations:')
    console.log(`  UPDATE options SET sort_order=3 WHERE id='${GARAGE_DOORS_OPTION_ID}' (garage_doors 2 -> 3)`)
    console.log(`  INSERT options (storm_front, sort_order=2) under option_group_id=${PRODUCTS_OPTION_GROUP_ID}`)
    console.log(`  INSERT ${STORM_FRONT_SUB_GROUPS.length} sub_groups under storm_front`)
    console.log(`  INSERT ${EXPECTED_SUB_OPTION_COUNT} sub_options across those sub_groups`)
    console.log('\nDRY RUN end - re-run without --dry-run to apply.')
    return
  }

  // ------------------------------------------------------------- Mutations
  // 1. Shift garage_doors sort_order 2 -> 3
  console.log('UPDATE garage_doors sort_order 2 -> 3 ...')
  const { error: shiftErr } = await supabase
    .from('options')
    .update({ sort_order: 3 })
    .eq('id', GARAGE_DOORS_OPTION_ID)
  if (shiftErr) fatal(`shift garage_doors: ${shiftErr.message}`)
  console.log('  shifted\n')

  // 2. INSERT storm_front option
  console.log('INSERT storm_front option ...')
  const { data: sfOption, error: sfErr } = await supabase
    .from('options')
    .insert({
      option_group_id: PRODUCTS_OPTION_GROUP_ID,
      option_id: 'storm_front',
      label: 'Storm Front',
      sort_order: 2,
    })
    .select('id')
    .single()
  if (sfErr || !sfOption) fatal(`insert storm_front: ${sfErr?.message ?? 'no row returned'}`)
  const STORM_FRONT_OPTION_ID = sfOption.id
  console.log(`  inserted id=${STORM_FRONT_OPTION_ID}\n`)

  // 3. INSERT sub_groups (one at a time so we can capture their generated ids)
  console.log(`INSERT ${STORM_FRONT_SUB_GROUPS.length} sub_groups ...`)
  const subGroupIdMap = new Map()
  for (const sg of STORM_FRONT_SUB_GROUPS) {
    const { data: sgRow, error: sgErr } = await supabase
      .from('sub_groups')
      .insert({
        option_id: STORM_FRONT_OPTION_ID,
        sub_group_id: sg.sub_group_id,
        label: sg.label,
        required: false,
        type: sg.type,
        sort_order: sg.sort_order,
      })
      .select('id')
      .single()
    if (sgErr || !sgRow) fatal(`insert sub_group ${sg.sub_group_id}: ${sgErr?.message ?? 'no row returned'}`)
    subGroupIdMap.set(sg.sub_group_id, sgRow.id)
    console.log(`  ${sg.sub_group_id} (id=${sgRow.id}) type=${sg.type}`)
  }
  console.log('')

  // 4. INSERT sub_options batched per sub_group
  console.log(`INSERT ${EXPECTED_SUB_OPTION_COUNT} sub_options ...`)
  let inserted = 0
  for (const sg of STORM_FRONT_SUB_GROUPS) {
    const parentId = subGroupIdMap.get(sg.sub_group_id)
    const rows = sg.sub_options.map((so, idx) => ({
      sub_group_id: parentId,
      sub_option_id: so.sub_option_id,
      label: so.label,
      description: so.description ?? null,
      sort_order: idx,
    }))
    const { error: soErr, count } = await supabase
      .from('sub_options')
      .insert(rows, { count: 'exact' })
    if (soErr) fatal(`insert sub_options for ${sg.sub_group_id}: ${soErr.message}`)
    inserted += count ?? rows.length
    console.log(`  +${rows.length} under ${sg.sub_group_id}`)
  }
  console.log(`  total inserted: ${inserted}\n`)

  if (inserted !== EXPECTED_SUB_OPTION_COUNT) {
    fatal(`sub_options insert count mismatch: expected ${EXPECTED_SUB_OPTION_COUNT}, got ${inserted}`)
  }

  // ------------------------------------------------------------- Post-assertions
  const { data: post, error: postErr } = await supabase
    .from('options')
    .select('id, option_id, sort_order, sub_groups(id, sub_group_id, type, sub_options(id, sub_option_id))')
    .eq('option_group_id', PRODUCTS_OPTION_GROUP_ID)
    .order('sort_order')
  if (postErr) fatal(`post-fetch: ${postErr.message}`)

  console.log('POST-STATE options under products:')
  const expectedPost = [
    { sort_order: 0, option_id: 'windows' },
    { sort_order: 1, option_id: 'doors' },
    { sort_order: 2, option_id: 'storm_front' },
    { sort_order: 3, option_id: 'garage_doors' },
  ]
  for (const o of post) {
    const sgCount = o.sub_groups?.length ?? 0
    const soCount = (o.sub_groups ?? []).reduce((s, sg) => s + (sg.sub_options?.length ?? 0), 0)
    console.log(`  sort=${o.sort_order} ${o.option_id} (${o.id}) - ${sgCount} sub_groups / ${soCount} sub_options`)
  }
  console.log('')

  if (post.length !== 4) fatal(`expected 4 options post-insert, got ${post.length}`)
  for (let i = 0; i < expectedPost.length; i++) {
    if (post[i].sort_order !== expectedPost[i].sort_order || post[i].option_id !== expectedPost[i].option_id) {
      fatal(`post-state row ${i} mismatch: expected sort=${expectedPost[i].sort_order}/${expectedPost[i].option_id}, got sort=${post[i].sort_order}/${post[i].option_id}`)
    }
  }

  const sfPostRow = post.find((o) => o.option_id === 'storm_front')
  if (!sfPostRow) fatal('storm_front missing from post-state')
  if ((sfPostRow.sub_groups?.length ?? 0) !== STORM_FRONT_SUB_GROUPS.length) {
    fatal(`storm_front sub_groups count mismatch: expected ${STORM_FRONT_SUB_GROUPS.length}, got ${sfPostRow.sub_groups?.length ?? 0}`)
  }
  const totalSubOptions = (sfPostRow.sub_groups ?? []).reduce((s, sg) => s + (sg.sub_options?.length ?? 0), 0)
  if (totalSubOptions !== EXPECTED_SUB_OPTION_COUNT) {
    fatal(`storm_front sub_options total mismatch: expected ${EXPECTED_SUB_OPTION_COUNT}, got ${totalSubOptions}`)
  }
  console.log('Post-assertions: PASS\n')

  console.log('Done - Path C applied successfully.')
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
