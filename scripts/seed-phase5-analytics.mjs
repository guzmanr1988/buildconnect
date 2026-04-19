#!/usr/bin/env node
/*
 * seed-phase5-analytics.mjs — Phase 5 admin analytics seed.
 *
 * Populates leads + closed_sales + transactions tables with realistic
 * pre-launch demo data so admin analytics pages (/admin/overview,
 * /admin/revenue, /admin/transactions, /admin/reports) show non-zero
 * aggregates instead of empty-state /bin/zshs when wired to Supabase.
 *
 * Matches MOCK_LEADS + MOCK_CLOSED_SALES shapes from src/lib/mock-data.ts
 * so the transition to real booking data (when homeowners actually book
 * through the site) is continuous — the same aggregation queries run,
 * just against more rows.
 *
 * Dependencies:
 *   - 3 demo vendors (apex-demo / shield-demo / paradise-demo) already
 *     seeded by scripts/seed-vendor-prices.mjs — UUIDs pulled from
 *     src/lib/demo-vendor-ids.ts
 *   - 4 demo homeowners created by this script via supabase.auth.admin
 *
 * Usage:
 *   set -a && source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env && set +a
 *   npx tsx scripts/seed-phase5-analytics.mjs
 *
 * Idempotent: delete+reinsert on each run so re-running resets to the
 * current script's baseline.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('FATAL: need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

/* ---------------------------------------------------------------- */
/* Load vendor UUIDs from FE-facing mapping                         */
/* ---------------------------------------------------------------- */

const __dirname = dirname(fileURLToPath(import.meta.url))
const vendorIdsPath = join(__dirname, '..', 'src', 'lib', 'demo-vendor-ids.ts')
let VENDOR_UUIDS
try {
  const raw = readFileSync(vendorIdsPath, 'utf8')
  const match = raw.match(/= (\{[\s\S]*?\})/)
  if (!match) throw new Error('could not parse DEMO_VENDOR_UUID_BY_MOCK_ID')
  VENDOR_UUIDS = JSON.parse(match[1])
} catch (e) {
  console.error('FATAL: could not load vendor UUIDs from', vendorIdsPath, e.message)
  process.exit(1)
}

const APEX = VENDOR_UUIDS['v-1']
const SHIELD = VENDOR_UUIDS['v-2']
const PARADISE = VENDOR_UUIDS['v-3']

if (!APEX || !SHIELD || !PARADISE) {
  console.error('FATAL: missing one of Apex/Shield/Paradise UUIDs — rerun scripts/seed-vendor-prices.mjs first')
  process.exit(1)
}

/* ---------------------------------------------------------------- */
/* Demo homeowners — created if missing, then used as lead owners   */
/* ---------------------------------------------------------------- */

const HOMEOWNERS = [
  { mock: 'ho-1', email: 'maria-demo@buildc.net', name: 'Maria Rodriguez', phone: '(305) 555-0101', address: '1234 Coral Way, Miami, FL 33145' },
  { mock: 'ho-2', email: 'james-demo@buildc.net', name: 'James Thompson', phone: '(786) 555-0202', address: '5678 Kendall Dr, Miami, FL 33156' },
  { mock: 'ho-3', email: 'sarah-demo@buildc.net', name: 'Sarah Chen', phone: '(954) 555-0303', address: '910 Princeton Blvd, Homestead, FL 33032' },
  { mock: 'ho-4', email: 'robert-demo@buildc.net', name: 'Robert Wilson', phone: '(305) 555-0404', address: '2020 Biscayne Blvd, Miami, FL 33137' },
]

async function findUser(email) {
  let page = 1
  while (page <= 5) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers p${page}: ${error.message}`)
    const m = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (m) return m.id
    if (data.users.length < 200) return null
    page++
  }
  return null
}

async function ensureHomeowner(ho) {
  const existing = await findUser(ho.email)
  if (existing) {
    const { error } = await supabase.from('profiles').update({
      name: ho.name, role: 'homeowner', phone: ho.phone, address: ho.address, status: 'active',
    }).eq('id', existing)
    if (error) throw new Error(`profile update ${ho.email}: ${error.message}`)
    log(`  ${ho.email} existing → ${existing}`)
    return existing
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: ho.email,
    password: process.env.SUPABASE_DEMO_HOMEOWNER_PW || 'demoHomeowner!2026',
    email_confirm: true,
    user_metadata: { name: ho.name, role: 'homeowner' },
  })
  if (error) throw new Error(`createUser ${ho.email}: ${error.message}`)
  const uid = data.user.id
  const { error: pErr } = await supabase.from('profiles').update({
    phone: ho.phone, address: ho.address, status: 'active',
  }).eq('id', uid)
  if (pErr) throw new Error(`profile enrich ${ho.email}: ${pErr.message}`)
  log(`  ${ho.email} NEW → ${uid}`)
  return uid
}

/* ---------------------------------------------------------------- */
/* Lead + sale definitions (mirrors MOCK_LEADS + MOCK_CLOSED_SALES) */
/* ---------------------------------------------------------------- */

// Each lead entry tracks its intended vendor + homeowner + sale state.
// The seed inserts in leads → closed_sales → transactions order.
function buildLeadSpecs(hoUuids) {
  return [
    { homeowner: hoUuids['ho-1'], vendor: APEX, category: 'roofing', project: 'Full Roof Replacement — Barrel Tile', value: 28500, status: 'completed', slot: '2026-04-08T10:00:00Z', permit: true, saleAmount: 28500, commissionPaid: false, closedAt: '2026-04-08T16:00:00Z', received: '2026-04-07T14:22:00Z' },
    { homeowner: hoUuids['ho-2'], vendor: APEX, category: 'roofing', project: 'Architectural Shingle Re-roof + Gutters', value: 22000, status: 'confirmed', slot: '2026-04-12T09:00:00Z', permit: false, received: '2026-04-08T09:45:00Z' },
    { homeowner: hoUuids['ho-3'], vendor: PARADISE, category: 'pool', project: 'Resort Pool with Spa & LED', value: 65000, status: 'completed', slot: '2026-04-09T11:00:00Z', permit: true, saleAmount: 65000, commissionPaid: false, closedAt: '2026-04-09T12:00:00Z', received: '2026-04-06T16:10:00Z' },
    { homeowner: hoUuids['ho-4'], vendor: SHIELD, category: 'windows_doors', project: 'Full House Impact Windows + Sliding Doors', value: 47500, status: 'completed', slot: '2026-04-11T08:00:00Z', permit: true, saleAmount: 47500, commissionPaid: true, closedAt: '2026-04-11T15:00:00Z', commissionPaidAt: '2026-04-15T10:00:00Z', received: '2026-04-05T11:30:00Z' },
    { homeowner: hoUuids['ho-1'], vendor: SHIELD, category: 'windows_doors', project: '12 Impact Windows (Replacement)', value: 18000, status: 'confirmed', slot: '2026-04-14T10:00:00Z', permit: true, received: '2026-04-09T13:15:00Z' },
    { homeowner: hoUuids['ho-2'], vendor: APEX, category: 'air_conditioning', project: 'Central AC 4 Ton + Smart Thermostat', value: 9500, status: 'pending', slot: '2026-04-15T14:00:00Z', permit: false, received: '2026-04-13T10:00:00Z' },
    { homeowner: hoUuids['ho-3'], vendor: PARADISE, category: 'pergolas', project: 'Louvered Pergola 12×16', value: 22000, status: 'rejected', slot: '2026-04-19T10:00:00Z', permit: false, received: '2026-04-04T15:45:00Z' },
    { homeowner: hoUuids['ho-4'], vendor: APEX, category: 'roofing', project: 'Metal Standing Seam Roof', value: 41000, status: 'pending', slot: '2026-04-17T09:30:00Z', permit: true, received: '2026-04-14T11:00:00Z' },
  ]
}

/* ---------------------------------------------------------------- */
/* Seed sequence                                                    */
/* ---------------------------------------------------------------- */

async function truncate() {
  // transactions → closed_sales → leads order (FK chain)
  for (const t of ['transactions', 'closed_sales']) {
    const { error } = await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) throw new Error(`truncate ${t}: ${error.message}`)
  }
  // leads has text PK; use different neq sentinel
  const { error } = await supabase.from('leads').delete().neq('id', '__never__')
  if (error) throw new Error(`truncate leads: ${error.message}`)
  log('truncated leads + closed_sales + transactions')
}

async function seedLeads(specs) {
  const rows = specs.map(s => ({
    homeowner_id: s.homeowner,
    vendor_id: s.vendor,
    project: s.project,
    value: s.value,
    status: s.status,
    slot: s.slot,
    permit_choice: s.permit,
    service_category: s.category,
    pack_items: {},
    sq_ft: 2100,
    financing: false,
    address: '', // homeowner profile has real addr; leads.address is lead-specific
    phone: '',
    email: '',
    homeowner_name: '', // joined via profile at query time
    received_at: s.received,
  }))
  const { data, error } = await supabase.from('leads').insert(rows).select('id,homeowner_id,vendor_id,project,value,status,received_at')
  if (error) throw new Error(`insert leads: ${error.message}`)
  log(`  seeded ${data.length} leads`)
  return data
}

async function seedClosedSales(specs, seededLeads) {
  // Match specs that have saleAmount to the inserted leads (by homeowner+vendor+project+received_at tuple)
  const rows = []
  for (const spec of specs) {
    if (spec.saleAmount === undefined) continue
    const lead = seededLeads.find(l =>
      l.homeowner_id === spec.homeowner &&
      l.vendor_id === spec.vendor &&
      l.project === spec.project
    )
    if (!lead) { log(`  WARN: no matching lead for sale ${spec.project}`); continue }
    rows.push({
      lead_id: lead.id,
      vendor_id: spec.vendor,
      homeowner_id: spec.homeowner,
      sale_amount: spec.saleAmount,
      // vendor_share + commission are GENERATED columns — DB computes on insert
      commission_paid: spec.commissionPaid ?? false,
      commission_paid_at: spec.commissionPaidAt ?? null,
      closed_at: spec.closedAt,
      homeowner_name: '',
      project: spec.project,
    })
  }
  if (rows.length === 0) { log('  no closed_sales to seed'); return [] }
  const { data, error } = await supabase.from('closed_sales').insert(rows).select('id,sale_amount,vendor_share,commission,commission_paid,closed_at,vendor_id,project')
  if (error) throw new Error(`insert closed_sales: ${error.message}`)
  log(`  seeded ${data.length} closed_sales`)
  return data
}

async function seedTransactions(closedSales) {
  // For each closed sale, one commission transaction.
  // Plus: one monthly membership transaction per vendor for flavor.
  const vendorMap = {
    [APEX]: 'Apex Roofing & Solar',
    [SHIELD]: 'Shield Impact Windows',
    [PARADISE]: 'Paradise Pools FL',
  }
  const rows = []
  for (const s of closedSales) {
    rows.push({
      type: 'commission',
      vendor_id: s.vendor_id,
      company: vendorMap[s.vendor_id] || 'Vendor',
      detail: `Commission on ${s.project}`,
      customer: '',
      amount: s.commission,
      date: s.closed_at,
      status: s.commission_paid ? 'paid' : 'pending',
    })
  }
  // Monthly membership fees (Apex + Shield + Paradise, 2 months each for a mini ledger)
  const months = ['2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z']
  for (const vid of [APEX, SHIELD, PARADISE]) {
    for (const m of months) {
      rows.push({
        type: 'membership',
        vendor_id: vid,
        company: vendorMap[vid],
        detail: 'Monthly BuildConnect membership',
        customer: '',
        amount: 199,
        date: m,
        status: 'paid',
      })
    }
  }
  const { error } = await supabase.from('transactions').insert(rows)
  if (error) throw new Error(`insert transactions: ${error.message}`)
  log(`  seeded ${rows.length} transactions (${closedSales.length} commission + ${rows.length - closedSales.length} membership)`)
}

/* ---------------------------------------------------------------- */
/* Main                                                              */
/* ---------------------------------------------------------------- */

async function main() {
  log('ensuring demo homeowners')
  const hoUuids = {}
  for (const ho of HOMEOWNERS) {
    hoUuids[ho.mock] = await ensureHomeowner(ho)
  }

  log('building lead specs')
  const specs = buildLeadSpecs(hoUuids)
  log(`${specs.length} lead specs prepared`)

  log('truncating existing rows')
  await truncate()

  log('seeding leads')
  const seededLeads = await seedLeads(specs)

  log('seeding closed_sales')
  const closedSales = await seedClosedSales(specs, seededLeads)

  log('seeding transactions')
  await seedTransactions(closedSales)

  // Sanity-check row counts
  log('verifying')
  for (const t of ['leads', 'closed_sales', 'transactions']) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
    if (error) throw new Error(`count ${t}: ${error.message}`)
    log(`  ${t}: ${count} rows`)
  }

  log('DONE')
}

main().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1) })
