#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('FATAL: env'); process.exit(1) }
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const ids = [
  'metal', 'shingle', 'barrel_tile', 'aluminum', 'flat_roof',
  'gutters', 'soffit_wood', 'fascia_wood', 'soffit_metal', 'fascia_metal', 'pool_fence',
  'insulation',
  'repair_shingle', 'repair_barrel_tile', 'repair_metal', 'repair_aluminum', 'repair_terracotta', 'repair_flat_roof',
  'custom', 'travertine', 'pavers', 'stamped_concrete', 'cement_floor', 'artificial_turf', 'square_concrete',
  'low_e', 'casement',
]

console.log('=== OPTIONS table matches ===')
const { data: opts, error: e1 } = await sb.from('options').select('id, option_id, label, option_group_id').in('option_id', ids)
if (e1) { console.error(e1); process.exit(1) }
for (const o of opts.sort((a,b)=>a.option_id.localeCompare(b.option_id))) console.log(`  ${o.option_id} | ${o.label} | group=${o.option_group_id}`)
console.log(`Total: ${opts.length}`)

console.log('\n=== SUB_OPTIONS table matches ===')
const { data: subs, error: e2 } = await sb.from('sub_options').select('id, sub_option_id, label, sub_group_id').in('sub_option_id', ids)
if (e2) { console.error(e2); process.exit(1) }
for (const s of subs.sort((a,b)=>a.sub_option_id.localeCompare(b.sub_option_id))) console.log(`  ${s.sub_option_id} | ${s.label} | sub_group=${s.sub_group_id}`)
console.log(`Total: ${subs.length}`)

console.log('\n=== Price_unit values currently set ===')
const { data: setOpts } = await sb.from('options').select('option_id, price_unit').not('price_unit', 'is', null)
console.log(`options w/ price_unit: ${setOpts?.length ?? 0}`)
for (const o of setOpts ?? []) console.log(`  ${o.option_id} = ${o.price_unit}`)
const { data: setSubs } = await sb.from('sub_options').select('sub_option_id, price_unit').not('price_unit', 'is', null)
console.log(`sub_options w/ price_unit: ${setSubs?.length ?? 0}`)
for (const s of setSubs ?? []) console.log(`  ${s.sub_option_id} = ${s.price_unit}`)
