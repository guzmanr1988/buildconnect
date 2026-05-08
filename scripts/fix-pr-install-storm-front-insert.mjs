#!/usr/bin/env node
/*
 * fix-pr-install-storm-front-insert.mjs - Path C atomic insert for install_storm_front
 * leaf option on windows_doors / install_products. Pairs the bundled SERVICE_CATALOG add
 * (constants.ts) with the server-side mirror per feedback_bundle_edit_needs_server_data_update.
 *
 * Inserts (atomic):
 *   1. INSERT options row install_storm_front sort_order=2 under install_products.
 *
 * Pre-assertions verify the current 2-option layout (install_windows / install_doors)
 * is unchanged. Post-assertions verify 3 options in 0,1,2 sort sequence ending
 * install_windows / install_doors / install_storm_front.
 *
 * No sub_groups / sub_options - install_products entries are leaf-level (qty input
 * driven, no nested config like products entries).
 *
 * Usage:
 *   set -a; source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env; set +a
 *   node scripts/fix-pr-install-storm-front-insert.mjs            # apply
 *   node scripts/fix-pr-install-storm-front-insert.mjs --dry-run  # preview only
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

const INSTALL_PRODUCTS_OPTION_GROUP_ID = 'fc8b3505-1bb2-4b6b-a02d-1f9d4533a793'

function fatal(msg) {
  console.error(`FATAL: ${msg}`)
  process.exit(1)
}

async function main() {
  console.log(`PR Path C - install_storm_front insert${DRY_RUN ? ' (DRY RUN)' : ''}\n`)

  // ------------------------------------------------------------- Pre-assertions
  const { data: pre, error: preErr } = await supabase
    .from('options')
    .select('id, option_id, sort_order')
    .eq('option_group_id', INSTALL_PRODUCTS_OPTION_GROUP_ID)
    .order('sort_order')
  if (preErr) fatal(`pre-fetch options: ${preErr.message}`)

  console.log('PRE-STATE options under install_products:')
  for (const o of pre) console.log(`  sort=${o.sort_order} ${o.option_id} (${o.id})`)
  console.log('')

  if (pre.length !== 2) fatal(`expected 2 options pre-insert, got ${pre.length}`)
  const expectedPre = [
    { sort_order: 0, option_id: 'install_windows' },
    { sort_order: 1, option_id: 'install_doors' },
  ]
  for (let i = 0; i < expectedPre.length; i++) {
    if (pre[i].sort_order !== expectedPre[i].sort_order || pre[i].option_id !== expectedPre[i].option_id) {
      fatal(`pre-state row ${i} mismatch: expected sort=${expectedPre[i].sort_order}/${expectedPre[i].option_id}, got sort=${pre[i].sort_order}/${pre[i].option_id}`)
    }
  }
  if (pre.find((o) => o.option_id === 'install_storm_front')) fatal('install_storm_front already exists - aborting (idempotency safety)')
  console.log('Pre-assertions: PASS\n')

  if (DRY_RUN) {
    console.log('DRY RUN - planned mutations:')
    console.log(`  INSERT options (install_storm_front, sort_order=2) under option_group_id=${INSTALL_PRODUCTS_OPTION_GROUP_ID}`)
    console.log('\nDRY RUN end - re-run without --dry-run to apply.')
    return
  }

  // ------------------------------------------------------------- Mutation
  console.log('INSERT install_storm_front option ...')
  const { data: insRow, error: insErr } = await supabase
    .from('options')
    .insert({
      option_group_id: INSTALL_PRODUCTS_OPTION_GROUP_ID,
      option_id: 'install_storm_front',
      label: 'Install Storm Front',
      sort_order: 2,
    })
    .select('id')
    .single()
  if (insErr || !insRow) fatal(`insert install_storm_front: ${insErr?.message ?? 'no row returned'}`)
  console.log(`  inserted id=${insRow.id}\n`)

  // ------------------------------------------------------------- Post-assertions
  const { data: post, error: postErr } = await supabase
    .from('options')
    .select('id, option_id, sort_order')
    .eq('option_group_id', INSTALL_PRODUCTS_OPTION_GROUP_ID)
    .order('sort_order')
  if (postErr) fatal(`post-fetch: ${postErr.message}`)

  console.log('POST-STATE options under install_products:')
  for (const o of post) console.log(`  sort=${o.sort_order} ${o.option_id} (${o.id})`)
  console.log('')

  const expectedPost = [
    { sort_order: 0, option_id: 'install_windows' },
    { sort_order: 1, option_id: 'install_doors' },
    { sort_order: 2, option_id: 'install_storm_front' },
  ]
  if (post.length !== 3) fatal(`expected 3 options post-insert, got ${post.length}`)
  for (let i = 0; i < expectedPost.length; i++) {
    if (post[i].sort_order !== expectedPost[i].sort_order || post[i].option_id !== expectedPost[i].option_id) {
      fatal(`post-state row ${i} mismatch: expected sort=${expectedPost[i].sort_order}/${expectedPost[i].option_id}, got sort=${post[i].sort_order}/${post[i].option_id}`)
    }
  }
  console.log('Post-assertions: PASS\n')

  console.log('Done - Path C applied successfully.')
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
