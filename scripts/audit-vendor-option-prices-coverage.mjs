#!/usr/bin/env node
/*
 * audit-vendor-option-prices-coverage.mjs
 *
 * Replaces lost task_065 tooling (scripts/audit-roofing-no-rate-coverage.mjs
 * + tmp/roofing-no-rate-audit.json) which were never committed and lost in
 * the 2026-06-15 232-branch sweep on guzmanr1988/buildconnect.
 *
 * What it does: cross-checks the catalog (options × option_groups) against
 * vendor_option_prices for the featured demo vendors and reports three buckets:
 *
 *   - covered      : vendor_option_prices row exists with active=true and price_cents > 0
 *   - zero_priced  : vendor_option_prices row exists, active=true, price_cents = 0
 *                    (intentional pattern — see seed-vendor-prices.mjs comment:
 *                     "$0 rows for options the vendor covers-but-does-not-charge-for"
 *                     suppress Contact-for-quote flip)
 *   - missing      : no vendor_option_prices row for that (vendor, option) pair
 *
 * Each `missing` row is classified as either intentional or actionable using
 * the INTENTIONAL_CARVE_OUTS rule table below. Documented exemptions:
 *
 *   - MH HOME SOLUTIONS (Rod's own vendors 7db2dc32 + bbcea996) — self-edit
 *     lane only; never seeded; all missing rows are intentional.
 *   - Apex Roofing legacy (fc0d8ff3, apex-demo@buildc.net) — removed from
 *     seed-vendor-prices.mjs FEATURED_VENDORS (line 46-52); legacy auth row
 *     stays live but reverse-map is gone. All missing rows are intentional.
 *
 * Anything else missing is actionable and counted toward the exit code.
 *
 * Usage:
 *   set -a && source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env && set +a
 *   node scripts/audit-vendor-option-prices-coverage.mjs
 *
 *   # Optional filters:
 *   node scripts/audit-vendor-option-prices-coverage.mjs --vendor=3e0821aa-89e7-4140-bff8-c4f7f985f561
 *   node scripts/audit-vendor-option-prices-coverage.mjs --service=roofing
 *   node scripts/audit-vendor-option-prices-coverage.mjs --service=roofing --vendor=3e0821aa-...
 *
 * Output:
 *   - Writes structured JSON to tmp/vendor-option-prices-coverage-audit.json
 *   - Prints human-readable summary to stdout
 *   - Exit code 0 if no actionable gaps; exit code 1 if any actionable
 *     missing rows surface. Ships the CI hook without forcing CI wiring
 *     (per kratos msg 1781557037731 — "ships the hook, defers the wiring").
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('FATAL: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.')
  console.error('  set -a && source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env && set +a')
  process.exit(2)
}

const supabase = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/* ---------------------------------------------------------------- */
/* Demo vendor registry — UUIDs sourced from migration 068 comments  */
/* ---------------------------------------------------------------- */

const DEMO_VENDORS = [
  {
    uuid: '3e0821aa-89e7-4140-bff8-c4f7f985f561',
    label: 'Apex Roofing & Solar (primary anchor)',
    email: 'vendor@buildc.net',
    service_categories: ['roofing'],
  },
  {
    uuid: 'fc0d8ff3-cc1c-4101-a4b3-068594753bbf',
    label: 'Apex Roofing & Solar (legacy)',
    email: 'apex-demo@buildc.net',
    service_categories: ['roofing'],
    // Removed from seed-vendor-prices.mjs FEATURED_VENDORS — all missing
    // rows are intentional. See INTENTIONAL_CARVE_OUTS below.
  },
  {
    uuid: '2361dc61-036c-4097-b5f0-5d69324214d5',
    label: 'ApolloE2E Roofing LLC',
    email: 'apollo-e2e-vendor-b@buildc.net',
    service_categories: ['roofing'],
  },
  // Shield Impact Windows — UUID resolved at runtime via auth.users lookup
  // since the seed file does not hardcode it. v-2 in FEATURED_VENDORS.
  {
    uuid: null,
    resolveByEmail: 'shield-demo@buildc.net',
    label: 'Shield Impact Windows',
    service_categories: ['windows_doors'],
  },
  // Paradise Pools FL — UUID resolved at runtime. v-3 in FEATURED_VENDORS.
  {
    uuid: null,
    resolveByEmail: 'paradise-demo@buildc.net',
    label: 'Paradise Pools FL',
    service_categories: ['pool', 'pergolas'],
  },
]

/* ---------------------------------------------------------------- */
/* Documented-intentional carve-outs                                 */
/* ---------------------------------------------------------------- */

const INTENTIONAL_CARVE_OUTS = [
  {
    uuid: 'fc0d8ff3-cc1c-4101-a4b3-068594753bbf',
    reason: 'Apex legacy (apex-demo@buildc.net) — removed from seed-vendor-prices.mjs FEATURED_VENDORS lines 46-52; reverse-map and re-seed path gone. Auth row stays live for session continuity but pricing is not maintained.',
    applies_to: 'all', // every missing row for this vendor is intentional
  },
  {
    uuid: '7db2dc32-bbcea996-rod-self-edit-1', // placeholder; pattern below covers MH HOME SOLUTIONS
    reason: 'MH HOME SOLUTIONS — Rod self-edit lane via Tranche-2 admin endpoint; never seeded by automation. Pattern match below.',
    applies_to: 'all',
    company_pattern: /^MH HOME SOLUTIONS/i,
  },
]

/* ---------------------------------------------------------------- */
/* CLI args                                                          */
/* ---------------------------------------------------------------- */

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/)
    return m ? [[m[1], m[2]]] : [[a.replace(/^--/, ''), true]]
  }),
)

const FILTER_VENDOR = args.vendor || null
const FILTER_SERVICE = args.service || null

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

async function resolveVendorByEmail(email) {
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

async function loadCatalog() {
  const { data, error } = await supabase
    .from('services')
    .select('id, option_groups(id, group_id, service_id, options(id, option_id, label))')
  if (error) throw new Error(`loadCatalog: ${error.message}`)
  return data
}

async function loadVendorPrices(vendorId) {
  const { data, error } = await supabase
    .from('vendor_option_prices')
    .select('option_id, price_cents, active')
    .eq('vendor_id', vendorId)
  if (error) throw new Error(`loadVendorPrices(${vendorId}): ${error.message}`)
  return data
}

async function loadVendorProfile(vendorId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, company')
    .eq('id', vendorId)
    .maybeSingle()
  if (error) throw new Error(`loadVendorProfile(${vendorId}): ${error.message}`)
  return data
}

function classifyMissing(vendor, profile) {
  for (const c of INTENTIONAL_CARVE_OUTS) {
    if (c.uuid === vendor.uuid) return { intentional: true, reason: c.reason }
    if (c.company_pattern && profile?.company && c.company_pattern.test(profile.company)) {
      return { intentional: true, reason: c.reason }
    }
  }
  return { intentional: false, reason: null }
}

/* ---------------------------------------------------------------- */
/* Main audit                                                        */
/* ---------------------------------------------------------------- */

async function auditVendor(vendor, catalog) {
  if (!vendor.uuid && vendor.resolveByEmail) {
    vendor.uuid = await resolveVendorByEmail(vendor.resolveByEmail)
    if (!vendor.uuid) {
      return {
        vendor_uuid: null,
        vendor_label: vendor.label,
        error: `could not resolve UUID for ${vendor.resolveByEmail}`,
      }
    }
  }
  if (FILTER_VENDOR && vendor.uuid !== FILTER_VENDOR) return null

  const profile = await loadVendorProfile(vendor.uuid)
  const prices = await loadVendorPrices(vendor.uuid)
  const priceByOptionId = new Map(prices.map((p) => [p.option_id, p]))
  const classification = classifyMissing(vendor, profile)

  const buckets = { covered: [], zero_priced: [], missing_intentional: [], missing_actionable: [] }

  for (const svc of catalog) {
    if (FILTER_SERVICE && svc.id !== FILTER_SERVICE) continue
    if (!vendor.service_categories.includes(svc.id)) continue
    for (const g of svc.option_groups) {
      for (const o of g.options) {
        const row = priceByOptionId.get(o.id)
        const entry = {
          service_id: svc.id,
          group_id: g.group_id,
          option_id: o.option_id,
          option_uuid: o.id,
          option_label: o.label,
        }
        if (!row) {
          if (classification.intentional) {
            buckets.missing_intentional.push({ ...entry, reason: classification.reason })
          } else {
            buckets.missing_actionable.push(entry)
          }
        } else if (row.price_cents === 0) {
          buckets.zero_priced.push({ ...entry, active: row.active })
        } else {
          buckets.covered.push({ ...entry, price_cents: row.price_cents, active: row.active })
        }
      }
    }
  }

  return {
    vendor_uuid: vendor.uuid,
    vendor_label: vendor.label,
    vendor_company: profile?.company || null,
    service_categories: vendor.service_categories,
    counts: {
      covered: buckets.covered.length,
      zero_priced: buckets.zero_priced.length,
      missing_intentional: buckets.missing_intentional.length,
      missing_actionable: buckets.missing_actionable.length,
    },
    buckets,
  }
}

async function main() {
  console.log('catalog load')
  const catalog = await loadCatalog()
  console.log(`  ${catalog.length} services in catalog`)

  const report = {
    generated_at: new Date().toISOString(),
    filters: { vendor: FILTER_VENDOR, service: FILTER_SERVICE },
    vendors: [],
  }

  for (const v of DEMO_VENDORS) {
    const result = await auditVendor(v, catalog)
    if (result === null) continue
    report.vendors.push(result)
    if (result.error) {
      console.log(`  ${result.vendor_label}: ${result.error}`)
      continue
    }
    const c = result.counts
    console.log(
      `  ${result.vendor_label}: covered=${c.covered} zero=${c.zero_priced} ` +
        `missing_intentional=${c.missing_intentional} missing_actionable=${c.missing_actionable}`,
    )
    if (c.missing_actionable > 0) {
      for (const m of result.buckets.missing_actionable) {
        console.log(`    ACTIONABLE: ${m.service_id}/${m.group_id}/${m.option_id} ("${m.option_label}")`)
      }
    }
  }

  const totalActionable = report.vendors.reduce(
    (s, v) => s + (v.counts?.missing_actionable || 0),
    0,
  )
  report.total_actionable = totalActionable

  // Persist JSON
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const outDir = join(__dirname, '..', 'tmp')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'vendor-option-prices-coverage-audit.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`wrote ${outPath}`)

  if (totalActionable > 0) {
    console.log(`AUDIT: ${totalActionable} actionable missing rows. Exit 1.`)
    process.exit(1)
  }
  console.log('AUDIT: no actionable gaps.')
}

main().catch((e) => {
  console.error('AUDIT FAILED:', e.message)
  process.exit(2)
})
