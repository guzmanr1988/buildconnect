import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

// 1. Find products option_group
const { data: ogs, error: ogErr } = await supabase
  .from('option_groups')
  .select('*')
  .eq('service_id', 'windows_doors')
if (ogErr) { console.error(ogErr); process.exit(1) }
console.log(`option_groups for windows_doors (${ogs.length}):`)
for (const og of ogs) console.log(`  ${og.group_id} | ${og.label} | id=${og.id} | sort=${og.sort_order ?? 'n/a'}`)

const productsOg = ogs.find(o => o.group_id === 'products')
console.log('\nproducts option_group_id:', productsOg?.id, '\n')

// 2. Find options under products
const { data: opts, error: optErr } = await supabase
  .from('options')
  .select('*')
  .eq('option_group_id', productsOg.id)
  .order('sort_order')
if (optErr) { console.error(optErr); process.exit(1) }
console.log(`options under products (${opts.length}):`)
for (const o of opts) console.log(`  sort=${o.sort_order} ${o.option_id} | ${o.label} | id=${o.id}`)

// 3. Show one options row shape to map columns
console.log('\noptions[0] full row:', JSON.stringify(opts[0], null, 2))
