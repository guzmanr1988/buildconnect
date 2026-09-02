#!/usr/bin/env node
/**
 * task_1788368314603_757 — Miami-Dade address normalizer runner.
 *
 * Pins the SNAME normalization contracts folio Phase 2 ships:
 *
 *   1. Raw user input basically never matches the county's SNAME column
 *      as-is. Uppercase + ordinal suffix on numeric streets + street-type
 *      abbrev is mandatory. Kratos measured this on live ArcGIS (msg
 *      1788368314680): '18226 nw 35 ct' returns 0, '18226 NW 35TH CT'
 *      returns folio 3421090152410. The normalizer is the whole game.
 *
 *   2. Unmapped street types (unknown suffix like PIKE / TURNPIKE / LOOP)
 *      REJECT rather than guess. Silent-degrade contract: null return
 *      means "we did not attempt / cannot attempt"; caller handles.
 *
 *   3. Normalized-and-still-unresolved is NOT bad-address. That branch
 *      is measured by queryMiamiDadeFolio returning null AFTER the
 *      parser succeeded — this runner does not hit the network, only
 *      pins the parser boundary.
 *
 *   4. The structured entry point (parseStructuredAddressForFolio) and
 *      the unstructured entry point (parseAddressForFolio) both delegate
 *      to the shared parseHouseAndStreet inner — so a fixture case passes
 *      or fails identically on both, which pins the "one code path" claim.
 *
 * Legs:
 *
 *   a. Structured: '18226 NW 35 CT' ZIP 33056 → { hseNum:'18226',
 *      sname:'18226'-not-prefixed, sname='NW 35TH CT', zip:'33056' }.
 *      (Kratos live: pre-normalize 0 matches; post-normalize FOLIO
 *      3421090152410.)
 *   b. Structured: '10990 SW 225 Terrace' ZIP 33170 → sname='SW 225TH TER'.
 *      (Kratos live: needed 'SW 225TH TER'. Rod's own primary.)
 *   c. Structured: '100 NW 7TH ST' ZIP 33136 → sname='NW 7TH ST'.
 *      (Kratos live: parses cleanly, ArcGIS still returns 0 → banked as
 *      folio=null + checked_at=set, NOT as bad-address. This runner
 *      confirms the PARSER accepts the input; the ArcGIS branch is
 *      exercised at the caller.)
 *   d. Negative control: 'NW 999TH CT' with no house number → parser
 *      rejects (returns null) before the network call is even attempted.
 *   e. Unmapped street type: '123 MAIN PIKE' → parser rejects (PIKE
 *      absent from STREET_TYPE_ABBREV, not in known-abbrevs set).
 *   f. Ordinal 11/12/13 special case: '100 NW 11 ST' → '11TH', not
 *      '11ST'. And '100 NW 21 ST' → '21ST'.
 *   g. Unit-designator strip: '100 NW 7 ST APT 5' → 'NW 7TH ST' (unit
 *      dropped, not part of MDC SNAME).
 *   h. Shared inner: same street body, unstructured vs structured entry
 *      points, return identical sname (proves the one-code-path claim).
 *   i. Zip guard on structured: bad zip ('1234' too short, '123456' too
 *      long, 'abcde' non-digit) → parser rejects.
 *   j. Zip w/ +4 extension: '33170-1234' → accepted, stripped to '33170'.
 *
 * Usage:
 *   npm run mdc-address-normalizer
 *
 * Exit codes:
 *   0  all legs green
 *   1  one or more legs failed
 */

import {
  parseAddressForFolio,
  parseStructuredAddressForFolio,
} from '../../src/lib/api/folio.ts'

type LegResult = { name: string; ok: boolean; detail?: string }
const results: LegResult[] = []
function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail })
  const prefix = ok ? 'PASS' : 'FAIL'
  console.log(`[${prefix}] ${name}${detail ? `  — ${detail}` : ''}`)
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// --- Leg a: kratos fixture 18226 NW 35 CT --------------------------------
{
  const r = parseStructuredAddressForFolio({ street: '18226 NW 35 CT', zip: '33056' })
  const expected = { hseNum: '18226', sname: 'NW 35TH CT', zip: '33056' }
  record(
    'a. structured 18226 NW 35 CT / 33056 → NW 35TH CT',
    eq(r, expected),
    r ? `got ${JSON.stringify(r)}` : 'got null',
  )
}

// --- Leg a2: lowercase input still normalizes ----------------------------
{
  const r = parseStructuredAddressForFolio({ street: '18226 nw 35 ct', zip: '33056' })
  const expected = { hseNum: '18226', sname: 'NW 35TH CT', zip: '33056' }
  record(
    'a2. structured lowercase 18226 nw 35 ct → uppercased NW 35TH CT',
    eq(r, expected),
    r ? `got ${JSON.stringify(r)}` : 'got null',
  )
}

// --- Leg b: Rod primary 10990 SW 225 Terrace -----------------------------
{
  const r = parseStructuredAddressForFolio({ street: '10990 SW 225 Terrace', zip: '33170' })
  const expected = { hseNum: '10990', sname: 'SW 225TH TER', zip: '33170' }
  record(
    'b. structured 10990 SW 225 Terrace / 33170 → SW 225TH TER',
    eq(r, expected),
    r ? `got ${JSON.stringify(r)}` : 'got null',
  )
}

// --- Leg c: parseable but ArcGIS-unresolved case -------------------------
{
  const r = parseStructuredAddressForFolio({ street: '100 NW 7TH ST', zip: '33136' })
  const expected = { hseNum: '100', sname: 'NW 7TH ST', zip: '33136' }
  record(
    'c. structured 100 NW 7TH ST / 33136 → parses cleanly (arcgis miss is caller branch)',
    eq(r, expected),
    r ? `got ${JSON.stringify(r)}` : 'got null',
  )
}

// --- Leg d: no house number → reject before network ----------------------
{
  const r = parseStructuredAddressForFolio({ street: 'NW 999TH CT', zip: '33056' })
  record(
    'd. no house number → reject (null before any network call)',
    r === null,
    r ? `expected null, got ${JSON.stringify(r)}` : 'null',
  )
}

// --- Leg e: unmapped street type → reject --------------------------------
{
  const r = parseStructuredAddressForFolio({ street: '123 MAIN PIKE', zip: '33056' })
  record(
    'e. unmapped street type PIKE → reject',
    r === null,
    r ? `expected null, got ${JSON.stringify(r)}` : 'null',
  )
}

// --- Leg f1: ordinal 11 special case -------------------------------------
{
  const r = parseStructuredAddressForFolio({ street: '100 NW 11 ST', zip: '33130' })
  const expected = { hseNum: '100', sname: 'NW 11TH ST', zip: '33130' }
  record(
    'f1. ordinal 11 → 11TH (not 11ST)',
    eq(r, expected),
    r ? `got ${JSON.stringify(r)}` : 'got null',
  )
}

// --- Leg f2: ordinal 21 standard case ------------------------------------
{
  const r = parseStructuredAddressForFolio({ street: '100 NW 21 ST', zip: '33130' })
  const expected = { hseNum: '100', sname: 'NW 21ST ST', zip: '33130' }
  record(
    'f2. ordinal 21 → 21ST',
    eq(r, expected),
    r ? `got ${JSON.stringify(r)}` : 'got null',
  )
}

// --- Leg g: unit designator strip ----------------------------------------
{
  const r = parseStructuredAddressForFolio({ street: '100 NW 7 ST APT 5', zip: '33130' })
  const expected = { hseNum: '100', sname: 'NW 7TH ST', zip: '33130' }
  record(
    'g. unit designator APT 5 stripped',
    eq(r, expected),
    r ? `got ${JSON.stringify(r)}` : 'got null',
  )
}

// --- Leg h: shared inner — unstructured vs structured parity -------------
{
  const u = parseAddressForFolio('10990 SW 225 Terrace, Miami, FL 33170')
  const s = parseStructuredAddressForFolio({ street: '10990 SW 225 Terrace', zip: '33170' })
  record(
    'h. unstructured and structured entry points return identical ParsedAddress',
    eq(u, s),
    `unstructured=${JSON.stringify(u)} structured=${JSON.stringify(s)}`,
  )
}

// --- Leg i: zip guards on structured -------------------------------------
{
  const short = parseStructuredAddressForFolio({ street: '100 NW 7TH ST', zip: '1234' })
  const long = parseStructuredAddressForFolio({ street: '100 NW 7TH ST', zip: '123456' })
  const alpha = parseStructuredAddressForFolio({ street: '100 NW 7TH ST', zip: 'abcde' })
  const empty = parseStructuredAddressForFolio({ street: '100 NW 7TH ST', zip: '' })
  const allNull = short === null && long === null && alpha === null && empty === null
  record(
    'i. zip guards: too-short, too-long, non-digit, empty → all reject',
    allNull,
    `short=${short} long=${long} alpha=${alpha} empty=${empty}`,
  )
}

// --- Leg j: zip +4 extension stripped ------------------------------------
{
  const r = parseStructuredAddressForFolio({ street: '10990 SW 225 Terrace', zip: '33170-1234' })
  const expected = { hseNum: '10990', sname: 'SW 225TH TER', zip: '33170' }
  record(
    'j. zip +4 extension → stripped to 5 digits',
    eq(r, expected),
    r ? `got ${JSON.stringify(r)}` : 'got null',
  )
}

// --- Summary -------------------------------------------------------------
const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`Summary: ${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) {
  console.log('Failed legs:')
  for (const r of failed) {
    console.log(`  - ${r.name}${r.detail ? `  — ${r.detail}` : ''}`)
  }
  process.exit(1)
}
process.exit(0)
