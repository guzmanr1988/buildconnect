#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const groupIds = [
  '4695c6fb-c146-447f-9fdb-f2bb106c7505', // aluminum (pergola)
  '7806cb2b-eb94-4117-97fb-35987ebdc608', // aluminum/barrel_tile/flat_roof/metal/shingle (roofing)
  '9628cd7d-0ef4-462a-8606-ddd73d42784d', // pool floor (artificial_turf/cement_floor/pavers/stamped_concrete/square_concrete/travertine)
  '1a3a9f94-7a95-45f8-ae97-2592770890fc', // custom #1
  'e55f2220-6649-4966-a0f4-3af83b8c49a7', // custom #2
  '1e1ace3a-d58c-4dc4-899f-beaebb8a1593', // custom #3 (designer-grade)
  '15d1c371-8310-40ee-bad7-7e238f90f2c2', // gutters/soffit/fascia/insulation
  '3589cbcf-ff69-434b-8a57-15b0cc840919', // pavers / square_concrete (driveways?)
  'fded898f-7154-4a36-863e-21d7270210c6', // pool_fence
  '493fc88d-9019-4ee2-9945-cf3fbb708674', // repair_*
  'c776faa9-79a2-46de-9fa7-7a28d0c185fa', // casement sub_group
  '98c080e8-46c3-43e0-8695-54df5937f2f7', // low_e sub_group #1
  '1da781bd-7073-46d4-878b-2540cc86c9e1', // low_e sub_group #2
  'f247bc73-006e-4be3-b9d9-b99e5e04c6da', // low_e sub_group #3
]

const { data: og, error: e1 } = await sb.from('option_groups').select('id, group_id, label, service_id').in('id', groupIds)
if (e1) { console.error(e1); process.exit(1) }
console.log('=== option_groups ===')
for (const g of og) console.log(`  ${g.id} | service=${g.service_id} | group_id=${g.group_id} | "${g.label}"`)

console.log('\n=== sub_groups (for casement / low_e) ===')
const subGroupIds = ['c776faa9-79a2-46de-9fa7-7a28d0c185fa', '98c080e8-46c3-43e0-8695-54df5937f2f7', '1da781bd-7073-46d4-878b-2540cc86c9e1', 'f247bc73-006e-4be3-b9d9-b99e5e04c6da']
const { data: sg } = await sb.from('sub_groups').select('id, sub_group_id, label, option_id').in('id', subGroupIds)
for (const s of sg ?? []) console.log(`  ${s.id} | parent_option=${s.option_id} | sub_group_id=${s.sub_group_id} | "${s.label}"`)
