#!/usr/bin/env node
/*
 * backfill-additional-addresses-folio.mjs — task_1788368314603_757 Phase 2.
 *
 * Pairs with the same-PR wire-up of lookupAdditionalAddressFolio in
 * src/features/homeowner/pages/profile.tsx (write-path lookup on save) and
 * the SecondaryAddress schema fields folio / folio_checked_at / folio_source
 * in src/types/index.ts. Existing profile rows with pre-populated
 * additional_addresses entries have all-null folio fields; without this
 * backfill the render side (Folio {addr.folio}) reads null on every
 * pre-existing entry — same shape as PR 595's blank-render defect (banked:
 * CODE-PRESENT ≠ VALUE-PRESENT; DATA + RENDER SHIP TOGETHER).
 *
 * Discipline mirrored from folio.ts:
 *   - Three-value discriminator per entry: never-attempted (no keys),
 *     attempted-no-match (folio null + checked_at set), resolved (folio set).
 *   - Only entries whose folio_checked_at is null are processed. A prior
 *     no-match is NOT retried — matches the write-path contract.
 *   - Silent-degrade: parser reject / ArcGIS non-1 result → folio null +
 *     checked_at set. No retries.
 *   - Rate limit: 250ms between ArcGIS calls, courteous county-server pace.
 *
 * Usage:
 *   set -a; source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env; set +a
 *   export VITE_SUPABASE_URL="$SUPABASE_URL"
 *   node scripts/backfill-additional-addresses-folio.mjs --dry-run
 *   node scripts/backfill-additional-addresses-folio.mjs
 *
 * Parser + query logic is duplicated (not imported) from src/lib/api/folio.ts
 * because that module imports the vite-aliased supabase client which does
 * not resolve in a plain Node ESM script. The fixture table
 * tests/mdc-address-normalizer/runner.mts pins the parser contract; if
 * this script's parseHouseAndStreet drifts from folio.ts the test suite
 * will not catch it — keep the two in sync manually when either changes.
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}
const DRY_RUN = process.argv.includes('--dry-run')
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const MDC_ARCGIS_QUERY_URL =
  'https://gisweb.miamidade.gov/arcgis/rest/services/AddressSearchMap_PropertiesWithZip/MapServer/0/query'
const ARCGIS_TIMEOUT_MS = 5000
const RATE_LIMIT_MS = 250

const STREET_TYPE_ABBREV = {
  TERRACE: 'TER', DRIVE: 'DR', STREET: 'ST', AVENUE: 'AVE', ROAD: 'RD',
  BOULEVARD: 'BLVD', COURT: 'CT', PLACE: 'PL', LANE: 'LN', CIRCLE: 'CIR',
  PARKWAY: 'PKWY', HIGHWAY: 'HWY', PLAZA: 'PLZ', SQUARE: 'SQ', TRAIL: 'TRL',
  WAY: 'WAY',
}
const KNOWN_ABBREVS = new Set(Object.values(STREET_TYPE_ABBREV))

function ordinalSuffix(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return 'TH'
  const mod10 = n % 10
  if (mod10 === 1) return 'ST'
  if (mod10 === 2) return 'ND'
  if (mod10 === 3) return 'RD'
  return 'TH'
}

function parseHouseAndStreet(streetLine) {
  if (!streetLine || typeof streetLine !== 'string') return null
  const trimmed = streetLine.trim()
  if (!trimmed) return null
  const hseMatch = trimmed.match(/^(\d+)\s+(.+)$/)
  if (!hseMatch) return null
  const hseNum = hseMatch[1]
  const streetBody = hseMatch[2].trim().toUpperCase()
  const streetNoUnit = streetBody.replace(/\s+(APT|UNIT|SUITE|STE|#)\s*\S+.*$/i, '').trim()
  const tokens = streetNoUnit.split(/\s+/)
  if (tokens.length < 2) return null
  const lastToken = tokens[tokens.length - 1]
  const abbrevSuffix = STREET_TYPE_ABBREV[lastToken] ?? lastToken
  if (!KNOWN_ABBREVS.has(abbrevSuffix)) return null
  const middle = tokens.slice(0, -1).map((tok) => {
    if (/^\d+$/.test(tok)) {
      const n = parseInt(tok, 10)
      return `${n}${ordinalSuffix(n)}`
    }
    return tok
  })
  const sname = [...middle, abbrevSuffix].join(' ')
  if (!sname) return null
  return { hseNum, sname }
}

function parseStructuredAddress(addr) {
  if (!addr?.street || !addr?.zip) return null
  const zipMatch = String(addr.zip).trim().match(/^(\d{5})(?:-\d{4})?$/)
  if (!zipMatch) return null
  const parsed = parseHouseAndStreet(addr.street)
  if (!parsed) return null
  return { ...parsed, zip: zipMatch[1] }
}

async function queryMiamiDadeFolio(parsed) {
  const where = `HSE_NUM=${parsed.hseNum} AND SNAME='${parsed.sname.replace(/'/g, "''")}' AND ZIP=${parsed.zip}`
  const url = `${MDC_ARCGIS_QUERY_URL}?where=${encodeURIComponent(where)}&outFields=FOLIO&f=pjson`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ARCGIS_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const data = await res.json()
    if (data.error) return null
    const features = data.features ?? []
    if (features.length !== 1) return null
    const folio = features[0].attributes?.FOLIO
    if (typeof folio !== 'string' && typeof folio !== 'number') return null
    const asString = String(folio).trim()
    return asString || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const { data: rows, error } = await sb
    .from('profiles')
    .select('id, additional_addresses')
    .not('additional_addresses', 'is', null)

  if (error) {
    console.error('FATAL: select profiles failed:', error)
    process.exit(1)
  }

  const candidates = (rows ?? []).filter(
    (r) => Array.isArray(r.additional_addresses) && r.additional_addresses.length > 0,
  )
  console.log(`Scanned ${rows?.length ?? 0} profiles with additional_addresses; ${candidates.length} have >=1 entry.`)

  let entriesScanned = 0
  let entriesAlreadyChecked = 0
  let entriesResolved = 0
  let entriesNoMatch = 0
  let entriesParserRejected = 0
  let rowsUpdated = 0

  for (const row of candidates) {
    const before = row.additional_addresses
    const after = []
    let rowChanged = false

    for (const entry of before) {
      entriesScanned += 1
      if (entry?.folio_checked_at) {
        entriesAlreadyChecked += 1
        after.push(entry)
        continue
      }
      const parsed = parseStructuredAddress({ street: entry?.street ?? '', zip: entry?.zip ?? '' })
      let folio = null
      if (parsed) {
        folio = await queryMiamiDadeFolio(parsed)
        await sleep(RATE_LIMIT_MS)
      } else {
        entriesParserRejected += 1
      }
      if (folio) entriesResolved += 1
      else if (parsed) entriesNoMatch += 1

      after.push({
        ...entry,
        folio,
        folio_checked_at: new Date().toISOString(),
        folio_source: 'mdc_arcgis',
      })
      rowChanged = true
    }

    if (!rowChanged) continue

    if (DRY_RUN) {
      console.log(`[DRY] profile ${row.id}: ${after.length} entries; ${after.filter((e) => e.folio).length} resolved.`)
      rowsUpdated += 1
      continue
    }

    const { error: updErr } = await sb
      .from('profiles')
      .update({ additional_addresses: after })
      .eq('id', row.id)
    if (updErr) {
      console.error(`FAIL update profile ${row.id}:`, updErr)
      continue
    }
    rowsUpdated += 1
    console.log(`  profile ${row.id}: ${after.filter((e) => e.folio).length}/${after.length} resolved.`)
  }

  console.log('')
  console.log('Summary:')
  console.log(`  entries scanned:        ${entriesScanned}`)
  console.log(`  already-checked (skip): ${entriesAlreadyChecked}`)
  console.log(`  parser rejected:        ${entriesParserRejected}`)
  console.log(`  arcgis resolved:        ${entriesResolved}`)
  console.log(`  arcgis no-match:        ${entriesNoMatch}`)
  console.log(`  rows updated:           ${rowsUpdated}${DRY_RUN ? ' (DRY)' : ''}`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
