#!/usr/bin/env node
/*
 * seed-vendor-prices.mjs — Phase 3+4 commerce layer.
 *
 * For each of the 3 featured mock vendors (Apex Roofing & Solar, Shield
 * Impact Windows, Paradise Pools FL) we:
 *   1. Create (or reuse) a real Supabase auth user with role=vendor
 *   2. Update their profile.name + profile.company to match MOCK_VENDORS
 *   3. Generate realistic per-option prices for every option in the
 *      services that match their service_categories
 *   4. Upsert vendor_option_prices rows
 *
 * The resulting UUID mapping is written to src/lib/demo-vendor-ids.ts so
 * the FE can JOIN mock-vendor-display-data (name, rating, avatar) with
 * real-DB pricing via the UUID.
 *
 * Usage (from /Users/rodolfoguzman/buildconnect):
 *   set -a && source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env && set +a
 *   npx tsx scripts/seed-vendor-prices.mjs
 *
 * Idempotent: re-running updates prices to match current generator output.
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('FATAL: need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

/* ---------------------------------------------------------------- */
/* Featured vendors to bridge into real Supabase auth + pricing     */
/* ---------------------------------------------------------------- */

const FEATURED_VENDORS = [
  {
    mockId: 'v-1',
    email: 'apex-demo@buildc.net',
    password: process.env.SUPABASE_DEMO_VENDOR_PW || 'demoVendor!2026',
    name: 'Carlos Mendez',
    company: 'Apex Roofing & Solar',
    phone: '(305) 555-1001',
    address: '100 NW 7th St, Miami, FL 33136',
    avatar_color: '#f59e0b',
    service_categories: ['roofing', 'air_conditioning'],
    /* Price generator per category — realistic SoFla construction ranges in CENTS. */
    priceFor: ({ serviceId, groupId, optionId }) => {
      if (serviceId === 'roofing') {
        // Apex is the higher-quality roofer.
        const baseByGroup = { roof_type: 1200_000, roofing_material: 800_000, scope: 150_000, addons: 80_000, payment: 0 }
        const multByOption = { barrel_tile: 1.25, metal: 1.45, architectural: 0.9, flat_tile: 1.05, shingles: 0.8 }
        const base = baseByGroup[groupId] ?? 60_000
        const mult = multByOption[optionId] ?? 1.0
        return Math.round(base * mult)
      }
      if (serviceId === 'air_conditioning') {
        const baseByGroup = { system_type: 650_000, scope: 100_000, addons: 50_000, payment: 0 }
        const multByOption = { central_3: 1.0, central_4: 1.25, central_5: 1.5, mini_split: 0.85, thermostat: 0.35 }
        const base = baseByGroup[groupId] ?? 40_000
        const mult = multByOption[optionId] ?? 1.0
        return Math.round(base * mult)
      }
      return 0
    },
  },
  {
    mockId: 'v-2',
    email: 'shield-demo@buildc.net',
    password: process.env.SUPABASE_DEMO_VENDOR_PW || 'demoVendor!2026',
    name: 'Tony Rivera',
    company: 'Shield Impact Windows',
    phone: '(786) 555-1002',
    address: '200 SW 8th St, Miami, FL 33130',
    avatar_color: '#3b82f6',
    service_categories: ['windows_doors'],
    priceFor: ({ serviceId, groupId, optionId }) => {
      if (serviceId !== 'windows_doors') return 0
      // Top-level groups.
      if (groupId === 'products') {
        const m = { windows: 0, doors: 0, garage_doors: 350_000 } // windows/doors priced via sub-options below; garage_doors flat
        return m[optionId] ?? 0
      }
      if (groupId === 'installation') return optionId === 'install' ? 150_000 : 0
      if (groupId === 'install_products') {
        return optionId === 'install_windows' ? 80_000 : optionId === 'install_doors' ? 100_000 : 0
      }
      if (groupId === 'scope') return 25_000 // permit-line
      if (groupId === 'payment') return 0
      // Garage door spec groups.
      if (groupId === 'garage_door_type') return optionId === 'double_garage' ? 180_000 : 120_000
      if (groupId === 'garage_door_size' || groupId === 'garage_door_color' || groupId === 'garage_door_glass') return 20_000
      // Sub-groups under windows/doors options — rough per-selection unit price.
      if (groupId === 'window_sizes' || groupId === 'door_sizes') return 75_000
      if (groupId === 'window_types' || groupId === 'door_types') return 45_000
      if (groupId === 'frame_colors' || groupId === 'door_frame_colors') return 15_000
      if (groupId === 'glass_colors' || groupId === 'door_glass_colors') return 15_000
      if (groupId === 'glass_types' || groupId === 'door_glass_types') {
        return optionId === 'impact_glass' ? 90_000 : 55_000
      }
      return 30_000
    },
  },
  {
    mockId: 'v-3',
    email: 'paradise-demo@buildc.net',
    password: process.env.SUPABASE_DEMO_VENDOR_PW || 'demoVendor!2026',
    name: 'Ana Martinez',
    company: 'Paradise Pools FL',
    phone: '(305) 555-1003',
    address: '300 Brickell Ave, Miami, FL 33131',
    avatar_color: '#06b6d4',
    service_categories: ['pool', 'pergolas'],
    priceFor: ({ serviceId, groupId, optionId }) => {
      if (serviceId === 'pool') {
        if (groupId === 'model') {
          const m = { '12x24': 3_500_000, '14x28': 4_200_000, '16x32': 5_800_000, '18x36': 7_200_000, '20x40': 9_000_000 }
          return m[optionId] ?? 4_500_000
        }
        if (groupId === 'paver') {
          const m = { travertine: 450_000, marble: 600_000, concrete: 250_000, pavers: 380_000 }
          return m[optionId] ?? 350_000
        }
        if (groupId === 'addons') {
          const m = { spa: 900_000, beach: 650_000, waterfall: 400_000, led: 150_000, bubbler: 80_000, deck_jets: 120_000, heater: 450_000 }
          return m[optionId] ?? 100_000
        }
        if (groupId === 'scope') return 80_000
        if (groupId === 'payment') return 0
        return 30_000
      }
      if (serviceId === 'pergolas') {
        if (groupId === 'structure') {
          const m = { louvered: 1_800_000, solid_roof: 1_200_000, open_lattice: 850_000, cantilever: 1_500_000 }
          return m[optionId] ?? 1_100_000
        }
        if (groupId === 'size') {
          const m = { '10x12': 1_000_000, '12x16': 1_400_000, '14x20': 1_850_000, '16x24': 2_400_000 }
          return m[optionId] ?? 1_200_000
        }
        if (groupId === 'addons') {
          const m = { fans: 75_000, lighting: 60_000, heaters: 85_000, screens: 220_000 }
          return m[optionId] ?? 50_000
        }
        if (groupId === 'payment') return 0
        return 30_000
      }
      return 0
    },
  },
]

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

async function findExistingUserId(email) {
  // auth.admin.listUsers paginates; for 3 vendors we page forward until match.
  let page = 1
  while (page <= 5) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers p${page}: ${error.message}`)
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (match) return match.id
    if (data.users.length < 200) return null
    page++
  }
  return null
}

async function ensureVendorUser(v) {
  const existing = await findExistingUserId(v.email)
  if (existing) {
    log(`  ${v.email} → existing UUID ${existing}`)
    // Update profile to match current mock display data.
    const { error } = await supabase
      .from('profiles')
      .update({
        name: v.name,
        role: 'vendor',
        phone: v.phone,
        address: v.address,
        company: v.company,
        avatar_color: v.avatar_color,
        status: 'active',
      })
      .eq('id', existing)
    if (error) throw new Error(`profile update ${v.email}: ${error.message}`)
    return existing
  }
  // Create new user with role=vendor via user_metadata.
  const { data, error } = await supabase.auth.admin.createUser({
    email: v.email,
    password: v.password,
    email_confirm: true,
    user_metadata: { name: v.name, role: 'vendor' },
  })
  if (error) throw new Error(`createUser ${v.email}: ${error.message}`)
  const uid = data.user.id
  log(`  ${v.email} → NEW UUID ${uid}`)
  // handle_new_user trigger already inserted the profile row; now enrich it.
  const { error: pErr } = await supabase
    .from('profiles')
    .update({
      phone: v.phone,
      address: v.address,
      company: v.company,
      avatar_color: v.avatar_color,
      status: 'active',
    })
    .eq('id', uid)
  if (pErr) throw new Error(`profile enrich ${v.email}: ${pErr.message}`)
  return uid
}

async function loadCatalogTree() {
  const { data, error } = await supabase
    .from('services')
    .select('id,option_groups(id,group_id,service_id,options(id,option_id))')
  if (error) throw new Error(`loadCatalogTree: ${error.message}`)
  return data
}

async function seedPricesFor(vendor, vendorUuid, catalog) {
  // Clear existing prices for this vendor (idempotent reset)
  await supabase.from('vendor_option_prices').delete().eq('vendor_id', vendorUuid)

  const rows = []
  for (const svc of catalog) {
    if (!vendor.service_categories.includes(svc.id)) continue
    for (const g of svc.option_groups) {
      for (const o of g.options) {
        const price = vendor.priceFor({ serviceId: svc.id, groupId: g.group_id, optionId: o.option_id })
        if (price > 0) {
          rows.push({
            vendor_id: vendorUuid,
            option_id: o.id,
            price_cents: price,
            currency: 'USD',
            active: true,
          })
        }
      }
    }
  }
  if (rows.length === 0) { log(`  ${vendor.company}: no prices generated (no matching services)`); return 0 }
  // Supabase inserts 500 rows max per call; our payload is well under that.
  const { error } = await supabase.from('vendor_option_prices').insert(rows)
  if (error) throw new Error(`insert vendor_option_prices for ${vendor.company}: ${error.message}`)
  log(`  ${vendor.company}: seeded ${rows.length} price rows`)
  return rows.length
}

/* ---------------------------------------------------------------- */
/* Write FE-facing UUID constants file                              */
/* ---------------------------------------------------------------- */

function writeDemoVendorIds(mapping) {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const target = join(__dirname, '..', 'src', 'lib', 'demo-vendor-ids.ts')
  const body = `// AUTO-GENERATED by scripts/seed-vendor-prices.mjs — do NOT edit by hand.
// Maps mock-vendor-id (from MOCK_VENDORS in mock-data.ts) to the real
// Supabase auth.users/profiles UUID so the FE can join mock display data
// (name, rating, avatar) to real-DB vendor_option_prices rows.

export const DEMO_VENDOR_UUID_BY_MOCK_ID: Record<string, string> = ${JSON.stringify(mapping, null, 2)}
`
  writeFileSync(target, body, 'utf8')
  log(`  wrote ${target}`)
}

/* ---------------------------------------------------------------- */
/* Main                                                              */
/* ---------------------------------------------------------------- */

async function main() {
  log('loading catalog tree (for option UUIDs)')
  const catalog = await loadCatalogTree()
  log(`catalog has ${catalog.length} services`)

  const mapping = {}
  let total = 0
  for (const v of FEATURED_VENDORS) {
    log(`ensuring ${v.company}`)
    const uid = await ensureVendorUser(v)
    mapping[v.mockId] = uid
    const n = await seedPricesFor(v, uid, catalog)
    total += n
  }

  log('writing FE UUID map')
  writeDemoVendorIds(mapping)

  log(`DONE. total price rows seeded: ${total}`)
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1) })
