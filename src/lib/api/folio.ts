import { supabase } from '@/lib/supabase'

// Miami-Dade Property Appraiser folio lookup — client-direct against the
// county's open ArcGIS layer. Endpoint is keyless, CORS-permits buildc.net
// (verified 2026-09-02: Access-Control-Allow-Origin: https://buildc.net on
// GET with Origin header).
//
// Task_1788364687325_793. Rod voice-asked 09-02: display folio next to
// phone on homeowner main. Layer + fields + positive/negative controls
// supplied by kratos (msg 1788364712293-kratos-10q90); schema shape
// (folio, folio_checked_at, folio_source) agreed msg 1788365051839.
//
// SILENT-DEGRADE, HARD: no toast, no error banner, no partial UI. Every
// failure path writes folio_checked_at (so we do NOT retry on every
// address save for a homeowner outside Miami-Dade or with an unparseable
// address) but leaves folio NULL. The render side (home.tsx) hides the
// entire row when folio is NULL — no 'Folio: —', no 'not found'.
//
// UNIQUENESS: HSE_NUM + ZIP alone returned 8 rows in kratos's measurement.
// This module ALWAYS queries with the three-field composite HSE_NUM +
// SNAME + ZIP and hides on features.length !== 1 (0 = Broward/no-match,
// >1 = ambiguity — never take features[0] blindly).

const MDC_ARCGIS_QUERY_URL =
  'https://gisweb.miamidade.gov/arcgis/rest/services/AddressSearchMap_PropertiesWithZip/MapServer/0/query'

const ARCGIS_TIMEOUT_MS = 5000

// Street-type long-form → Miami-Dade canonical abbreviation. The county's
// SNAME column stores abbreviated forms (e.g. 'SW 225TH TER', not
// 'SW 225TH TERRACE'), so the query must abbreviate before comparing.
// Order matters where a long form is a prefix of another (STREET/ST).
const STREET_TYPE_ABBREV: Record<string, string> = {
  TERRACE: 'TER',
  DRIVE: 'DR',
  STREET: 'ST',
  AVENUE: 'AVE',
  ROAD: 'RD',
  BOULEVARD: 'BLVD',
  COURT: 'CT',
  PLACE: 'PL',
  LANE: 'LN',
  CIRCLE: 'CIR',
  PARKWAY: 'PKWY',
  HIGHWAY: 'HWY',
  PLAZA: 'PLZ',
  SQUARE: 'SQ',
  TRAIL: 'TRL',
  WAY: 'WAY',
}

// Ordinal suffix for a bare integer street name (Miami-Dade stores '225TH TER'
// not '225 TER'). Handles 11/12/13 special case (all 'TH').
function ordinalSuffix(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return 'TH'
  const mod10 = n % 10
  if (mod10 === 1) return 'ST'
  if (mod10 === 2) return 'ND'
  if (mod10 === 3) return 'RD'
  return 'TH'
}

interface ParsedAddress {
  hseNum: string
  sname: string
  zip: string
}

// Strict parser for the unstructured profiles.address text field. Rejects
// (returns null) on any ambiguity — the fail path is silent-degrade, not
// best-effort. Sample that must parse: "10990 SW 225 Terrace, Miami, FL 33170"
// → { hseNum: "10990", sname: "SW 225TH TER", zip: "33170" }.
export function parseAddressForFolio(raw: string): ParsedAddress | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // ZIP: 5 digits at end (allow -4 extension, keep only 5).
  const zipMatch = trimmed.match(/\b(\d{5})(?:-\d{4})?\s*$/)
  if (!zipMatch) return null
  const zip = zipMatch[1]

  // First comma-segment holds house number + street name.
  const firstSegment = trimmed.split(',')[0]?.trim()
  if (!firstSegment) return null

  // House number: leading integer.
  const hseMatch = firstSegment.match(/^(\d+)\s+(.+)$/)
  if (!hseMatch) return null
  const hseNum = hseMatch[1]
  const streetBody = hseMatch[2].trim().toUpperCase()

  // Normalise: strip trailing unit designators (APT, UNIT, #123) — these
  // are not part of SNAME in MDC's schema.
  const streetNoUnit = streetBody
    .replace(/\s+(APT|UNIT|SUITE|STE|#)\s*\S+.*$/i, '')
    .trim()

  // Tokenise; the last token is expected to be a street type (TER/DR/...).
  const tokens = streetNoUnit.split(/\s+/)
  if (tokens.length < 2) return null

  const lastToken = tokens[tokens.length - 1]
  const abbrevSuffix = STREET_TYPE_ABBREV[lastToken] ?? lastToken
  // If lastToken is not a known long form AND not already a known abbrev,
  // we conservatively reject rather than guess.
  const knownAbbrevs = new Set(Object.values(STREET_TYPE_ABBREV))
  if (!knownAbbrevs.has(abbrevSuffix)) return null

  // Middle tokens (between directional/prefix and suffix) — add ordinal to
  // any bare integer that has no ordinal already (225 → 225TH). Do not touch
  // tokens that already carry an ordinal, letters, or other punctuation.
  const middle = tokens.slice(0, -1).map((tok) => {
    if (/^\d+$/.test(tok)) {
      const n = parseInt(tok, 10)
      return `${n}${ordinalSuffix(n)}`
    }
    return tok
  })

  const sname = [...middle, abbrevSuffix].join(' ')
  if (!sname) return null

  return { hseNum, sname, zip }
}

interface ArcGisFeature {
  attributes?: { FOLIO?: string | number | null }
}

interface ArcGisResponse {
  features?: ArcGisFeature[]
  error?: unknown
}

// Query Miami-Dade ArcGIS for exactly-1 match on the three-field composite.
// Returns the folio string (13 chars) or null on any non-1 outcome.
export async function queryMiamiDadeFolio(
  parsed: ParsedAddress,
): Promise<string | null> {
  const where = `HSE_NUM=${parsed.hseNum} AND SNAME='${parsed.sname.replace(/'/g, "''")}' AND ZIP=${parsed.zip}`
  const url = `${MDC_ARCGIS_QUERY_URL}?where=${encodeURIComponent(where)}&outFields=FOLIO&f=pjson`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ARCGIS_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const data = (await res.json()) as ArcGisResponse
    if (data.error) return null
    const features = data.features ?? []
    if (features.length !== 1) return null
    const folio = features[0].attributes?.FOLIO
    if (typeof folio !== 'string' && typeof folio !== 'number') return null
    const asString = String(folio).trim()
    if (!asString) return null
    return asString
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Fire-and-forget entry point called by auth-store on homeowner address save.
// Writes folio_checked_at unconditionally so a permanent no-match (Broward /
// unparseable) does not re-query on every subsequent save. Writes folio only
// on a successful resolve.
export async function resolveHomeownerFolio(
  profileId: string,
  addressText: string,
): Promise<void> {
  if (!profileId || !addressText?.trim()) return
  const parsed = parseAddressForFolio(addressText)
  const folio = parsed ? await queryMiamiDadeFolio(parsed) : null
  try {
    await supabase
      .from('profiles')
      .update({
        folio,
        folio_checked_at: new Date().toISOString(),
      })
      .eq('id', profileId)
  } catch (err) {
    // Swallow — silent-degrade. Next save re-attempts the write.
    console.error('[folio] update failed:', err)
  }
}
