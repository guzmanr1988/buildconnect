#!/usr/bin/env node
/**
 * FACE-1 data-truth-trifecta runner.
 *
 * Pins the invariant that three vendor stores (permits, membership,
 * bank_enabled in employees) derive from Supabase DB truth — never from
 * localStorage. Mirrors the active-toggle-protection pattern:
 *
 *   Leg 1 — persist-strip / load-bearing gate. Read each store source.
 *     Assert the store either has NO `persist(...)` wrapper, OR if it
 *     does, the partialize() strips the DB-canonical field. Without this
 *     gate, localStorage would silently override DB truth on next mount.
 *
 *   Leg 2 — supabase wire-through. Assert each store source contains the
 *     specific `from('<table>')` calls for the expected DB table. Without
 *     these calls, the mutator can't actually persist server-side.
 *
 *   Leg 3 — Arc-43 auth-bootstrap guard. Assert each store's hydrate()
 *     short-circuits when no session is on the client (prevents anon
 *     hydrate clobbering with empty rows mid-session-resolve).
 *
 * Usage:
 *   npm run face1-data-truth-trifecta
 *
 * Exit codes:
 *   0  all 9 legs green
 *   1  one or more legs failed
 *   2  runner setup error
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')

interface TargetSpec {
  name: string
  storePath: string
  dbTable: string
  // The state field that MUST NOT be persisted to localStorage (DB-canonical).
  dbCanonicalField: string
}

const TARGETS: TargetSpec[] = [
  {
    name: 'vendor-permits',
    storePath: 'src/stores/vendor-permits-store.ts',
    dbTable: 'vendor_permits',
    dbCanonicalField: 'permits',
  },
  {
    name: 'vendor-membership',
    storePath: 'src/stores/vendor-membership-store.ts',
    dbTable: 'vendor_memberships',
    dbCanonicalField: 'membershipByVendor',
  },
  {
    name: 'vendor-bank-enabled',
    storePath: 'src/stores/vendor-employees-store.ts',
    dbTable: 'vendor_settings',
    dbCanonicalField: 'bankEnabledByVendor',
  },
]

type LegResult = { name: string; ok: boolean; detail?: string }

function leg_persist_strip(t: TargetSpec): LegResult {
  const full = join(REPO_ROOT, t.storePath)
  if (!existsSync(full)) {
    return { name: `${t.name}.persist_strip`, ok: false, detail: `store not found at ${full}` }
  }
  const src = readFileSync(full, 'utf8')
  const failures: string[] = []

  // Two acceptable shapes:
  // (a) Store has NO persist(...) wrapper at all → localStorage can't hold
  //     the DB-canonical field, gate satisfied trivially.
  // (b) Store has persist(...) but partialize() strips the DB-canonical
  //     field (does not include it in the persisted shape).
  const hasPersistImport = /from\s+['"]zustand\/middleware['"]/.test(src)
  const hasPersistCall = /\bpersist\s*\(/.test(src)

  if (!hasPersistImport && !hasPersistCall) {
    return { name: `${t.name}.persist_strip`, ok: true, detail: 'no persist wrapper (DB-only path)' }
  }

  // If persist exists, partialize MUST strip the field.
  const partializeMatch = src.match(/partialize\s*:\s*\(state\)\s*=>\s*\(\{([\s\S]*?)\}\)/)
  if (!partializeMatch) {
    failures.push('persist() present but no partialize block found — DB-canonical field would round-trip through localStorage')
  } else {
    const body = partializeMatch[1]
    const fieldRe = new RegExp(`\\b${t.dbCanonicalField}\\s*:`)
    if (fieldRe.test(body)) {
      failures.push(`partialize() persists "${t.dbCanonicalField}" — DB-canonical field MUST be stripped`)
    }
  }

  return { name: `${t.name}.persist_strip`, ok: failures.length === 0, detail: failures.join(' | ') }
}

function leg_supabase_wire(t: TargetSpec): LegResult {
  const full = join(REPO_ROOT, t.storePath)
  const src = readFileSync(full, 'utf8')
  const failures: string[] = []

  // Must import supabase client.
  if (!/from\s+['"]@\/lib\/supabase['"]/.test(src)) {
    failures.push('store does not import @/lib/supabase — no DB path possible')
  }
  // Must reference the expected table via .from('<table>').
  const tableRe = new RegExp(`\\.from\\(\\s*['"]${t.dbTable}['"]\\s*\\)`)
  if (!tableRe.test(src)) {
    failures.push(`store does not call .from('${t.dbTable}') — DB writes route nowhere`)
  }

  return { name: `${t.name}.supabase_wire`, ok: failures.length === 0, detail: failures.join(' | ') }
}

function leg_auth_guard(t: TargetSpec): LegResult {
  const full = join(REPO_ROOT, t.storePath)
  const src = readFileSync(full, 'utf8')
  const failures: string[] = []

  // Arc-43 pattern: hydrate path must consult supabase.auth.getSession()
  // and short-circuit when access_token absent. Without this, anon hydrate
  // can clobber state with empty rows before the JWT arrives.
  if (!/supabase\.auth\.getSession\(\)/.test(src)) {
    failures.push('hydrate path missing supabase.auth.getSession() — anon hydrate race possible')
  }
  if (!/session\?\.access_token/.test(src)) {
    failures.push('hydrate path does not check session?.access_token — Arc-43 guard absent')
  }

  return { name: `${t.name}.auth_guard`, ok: failures.length === 0, detail: failures.join(' | ') }
}

function main() {
  const results: LegResult[] = []
  try {
    for (const t of TARGETS) {
      results.push(leg_persist_strip(t))
      results.push(leg_supabase_wire(t))
      results.push(leg_auth_guard(t))
    }
  } catch (err) {
    console.error('[runner] setup error:', err)
    process.exit(2)
  }

  let allGreen = true
  for (const r of results) {
    const icon = r.ok ? 'PASS' : 'FAIL'
    console.log(`[${icon}] ${r.name}${r.detail ? '  -- ' + r.detail : ''}`)
    if (!r.ok) allGreen = false
  }
  console.log(`\nface1-data-truth-trifecta: ${allGreen ? 'ALL GREEN' : 'FAILED'} (${results.filter((r) => r.ok).length}/${results.length})`)
  process.exit(allGreen ? 0 : 1)
}

main()
