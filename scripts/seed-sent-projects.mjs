#!/usr/bin/env node
/*
 * seed-sent-projects.mjs — Surface 2 demo seed.
 *
 * Inserts MOCK_LEADS (L-0001, L-0005) + sample-review row as sent_projects
 * rows under the real demo homeowner/vendor UUIDs. Idempotent: upserts on
 * conflict(id) so re-runs are safe.
 *
 * Requires migration 018 (sent_projects table) to be applied first.
 *
 * Usage:
 *   set -a && source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env && set +a
 *   npx tsx scripts/seed-sent-projects.mjs
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('FATAL: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// Real demo UUIDs (from profiles table)
const HOMEOWNER = {
  maria:  '9e614c1d-d735-4425-9402-9876b06e4ba0',  // maria-demo@buildc.net  (ho-1)
  james:  '4deddf0d-8f58-479f-9e92-873040a39a8e',  // james-demo@buildc.net  (ho-2)
  sarah:  'd033c14f-92e8-42ac-8729-9f09a5dd27e8',  // sarah-demo@buildc.net  (ho-3)
}
const VENDOR = {
  apex:     'fc0d8ff3-cc1c-4101-a4b3-068594753bbf',  // v-1 Apex Roofing & Solar
  shield:   '4c3f13c3-4647-48af-864d-ecbbb92a47f9',  // v-2 Shield Impact Windows
  paradise: '9d9c6608-8ef3-4502-a1f3-12f29dea1ca1',  // v-3 Paradise Pools FL
}
const REP_UUID = 'a8358341-9c11-4d99-8c44-7885a5c45e48'  // account_rep@buildc.net

// Stable demo row UUIDs (hardcoded for idempotency)
const ROW = {
  L0001:        'bb000001-0000-0000-0000-000000000001',  // L-0001 Maria→Apex barrel tile
  L0005:        'bb000005-0000-0000-0000-000000000005',  // L-0005 James→Apex metal roof
  sampleReview: 'bb000099-0000-0000-0000-000000000099',  // sample-review sold row
}

const rows = [
  // L-0001 — Maria / Apex Roofing — Full Roof Replacement Barrel Tile
  {
    id:               ROW.L0001,
    homeowner_id:     HOMEOWNER.maria,
    vendor_id:        VENDOR.apex,
    item:             {
      id: 'mock-L-0001',
      serviceId: 'roofing',
      serviceName: 'Full Roof Replacement — Barrel Tile',
      selections: { material: ['barrel_tile'], service_type: ['replace'], addons: ['gutters'] },
      addedAt: '2026-04-07T14:22:00Z',
    },
    contractor:       {
      vendor_id:  VENDOR.apex,
      name:       'Carlos Mendez',
      company:    'Apex Roofing & Solar',
      rating:     4.8,
    },
    booking_date:     '2026-04-14',
    booking_time:     '9:00 AM',
    homeowner_name:   'Maria Rodriguez',
    homeowner_phone:  '(305) 555-0101',
    homeowner_email:  'maria@email.com',
    homeowner_address:'1234 Coral Way, Miami, FL 33145',
    status:           'pending',
    sent_at:          '2026-04-07T14:22:00Z',
    account_rep_id:   REP_UUID,
    assigned_rep:     { id: 'v-1-rep-1', name: 'Luis Ortega', role: 'Senior Project Manager', phone: '(305) 555-2001' },
    rep_assigned_at:  '2026-04-07T16:00:00Z',
    rep_acceptance:   'pending',
    price_line_items: [
      { id: 'roofing-material',  label: 'Roofing Material',        amount: 9187,  source: 'preset' },
      { id: 'roofing-tearoff',   label: 'Tear-off & Disposal',     amount: 2100,  source: 'preset' },
      { id: 'roofing-install',   label: 'Installation Labor',      amount: 2100,  source: 'preset' },
      { id: 'roofing-permit',    label: 'Permit & Inspection',     amount: 1563,  source: 'preset' },
    ],
  },

  // L-0005 — James / Apex Roofing — Metal Roof + Solar Prep
  {
    id:               ROW.L0005,
    homeowner_id:     HOMEOWNER.james,
    vendor_id:        VENDOR.apex,
    item:             {
      id: 'mock-L-0005',
      serviceId: 'roofing',
      serviceName: 'Metal Roof + Solar Prep',
      selections: { material: ['metal'], service_type: ['replace'], addons: ['solar_prep', 'insulation'] },
      addedAt: '2026-04-09T08:15:00Z',
    },
    contractor:       {
      vendor_id:  VENDOR.apex,
      name:       'Carlos Mendez',
      company:    'Apex Roofing & Solar',
      rating:     4.8,
    },
    booking_date:     '2026-04-17',
    booking_time:     '2:00 PM',
    homeowner_name:   'James Thompson',
    homeowner_phone:  '(786) 555-0202',
    homeowner_email:  'james@email.com',
    homeowner_address:'5678 Kendall Dr, Miami, FL 33156',
    status:           'pending',
    sent_at:          '2026-04-09T08:15:00Z',
    account_rep_id:   REP_UUID,
    assigned_rep:     { id: 'v-1-rep-2', name: 'Marco DeLeon', role: 'Roofing Lead', phone: '(305) 555-2002' },
    rep_assigned_at:  '2026-04-09T10:00:00Z',
    rep_acceptance:   'pending',
    price_line_items: [
      { id: 'roofing-material',  label: 'Roofing Material',    amount: 14400, source: 'preset' },
      { id: 'roofing-tearoff',   label: 'Tear-off & Disposal', amount: 2400,  source: 'preset' },
      { id: 'roofing-install',   label: 'Installation Labor',  amount: 2400,  source: 'preset' },
      { id: 'roofing-permit',    label: 'Permit & Inspection', amount: 1800,  source: 'preset' },
    ],
  },

  // sample-review — Maria / Apex Roofing — Sold, pending admin review
  {
    id:               ROW.sampleReview,
    homeowner_id:     HOMEOWNER.maria,
    vendor_id:        VENDOR.apex,
    item:             {
      id: 'sample-roofing-1',
      serviceId: 'roofing',
      serviceName: 'Full Roof Replacement - Architectural Shingle',
      selections: { roofing_type: ['architectural'], permit: ['permit'] },
      addedAt: new Date(Date.now() - 14 * 86400_000).toISOString(),
    },
    contractor:       {
      vendor_id:  VENDOR.apex,
      name:       'Apex Roofing & Solar',
      company:    'Apex Roofing & Solar',
      rating:     4.9,
    },
    booking_date:     '2026-04-10',
    booking_time:     '10:00 AM',
    homeowner_name:   'Maria Rodriguez',
    homeowner_phone:  '(305) 555-0101',
    homeowner_email:  'maria@email.com',
    homeowner_address:'1234 Coral Way, Miami, FL 33145',
    status:           'sold',
    sent_at:          new Date(Date.now() - 12 * 86400_000).toISOString(),
    confirmed_at:     new Date(Date.now() - 10 * 86400_000).toISOString(),
    sold_at:          new Date(Date.now() - 5 * 86400_000).toISOString(),
    sale_amount:      18500,
    review_status:    'pending',
    price_line_items: [
      { id: 'roofing-material',       label: 'Roofing Material',    amount: 9187,  source: 'preset' },
      { id: 'roofing-tearoff',        label: 'Tear-off & Disposal', amount: 2100,  source: 'preset' },
      { id: 'roofing-install',        label: 'Installation Labor',  amount: 2100,  source: 'preset' },
      { id: 'roofing-permit',         label: 'Permit & Inspection', amount: 1563,  source: 'preset' },
      { id: 'auto-extra-sample-review', label: 'Upsale',            amount: 3550, originalAmount: 0, source: 'auto_sold_adjustment' },
    ],
  },
]

async function run() {
  log('Seeding sent_projects — 3 demo rows')

  const { error } = await supabase
    .from('sent_projects')
    .upsert(rows, { onConflict: 'id' })

  if (error) {
    console.error('SEED FAILED:', error.message, error.details ?? '')
    process.exit(1)
  }

  log(`OK — ${rows.length} rows upserted`)

  // Verify
  const { data: check, error: chkErr } = await supabase
    .from('sent_projects')
    .select('id, status, homeowner_name')
    .in('id', Object.values(ROW))

  if (chkErr) { console.error('Verify failed:', chkErr.message); return }
  log('Verified rows in DB:')
  check.forEach(r => log(' ', r.id.slice(0, 8), r.status, r.homeowner_name))
}

run()
