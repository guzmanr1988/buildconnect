#!/usr/bin/env node
// Build-time preflight guard for VITE_ env surface.
//
// Fails the build if any `import.meta.env.VITE_*` referenced in `src/`
// is missing from `process.env` or is the empty string.
//
// Anchor: banked discipline `feedback_vite_env_full_surface_audit_before_local_wrangler_deploy`
// (2026-05-30 N=2 BC demo-login arc — round-1 PWs missing + round-2 SUPABASE_URL/key missing).
//
// Runs as `prebuild` (npm runs prebuild → build automatically).
// Local invocation: `node scripts/check-vite-env.mjs` (after sourcing secrets.env).
//
// To exempt a var that is intentionally optional, add it to OPTIONAL with a
// one-line justification. Default policy: every VITE_ referenced in src/ MUST
// be declared in build env, even if the call site has a `??` fallback — code
// fallbacks like `|| 'http://localhost:54321'` are precisely the trap this
// guard exists to close (silent dev-default bake into a prod bundle).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = 'src'
const VITE_PATTERN = /import\.meta\.env\.(VITE_[A-Z0-9_]+)/g
const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'])

// Vars referenced in src/ that are intentionally optional. Empty by default.
// To add: include the var name and a one-line justification comment.
const OPTIONAL = new Set([
  // src/lib/parcel.ts:22 — defaults to a documented-working FL DOR cadastral
  // endpoint. Override only if the upstream endpoint moves. Prod-safe fallback.
  'VITE_PARCEL_FL_URL',
])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const st = statSync(path)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      walk(path, out)
    } else if (SCAN_EXTS.has(path.slice(path.lastIndexOf('.')))) {
      out.push(path)
    }
  }
  return out
}

function collectVars() {
  const found = new Map() // name -> Set<file>
  for (const file of walk(SRC_DIR)) {
    const text = readFileSync(file, 'utf8')
    let m
    VITE_PATTERN.lastIndex = 0
    while ((m = VITE_PATTERN.exec(text)) !== null) {
      const name = m[1]
      if (!found.has(name)) found.set(name, new Set())
      found.get(name).add(file)
    }
  }
  return found
}

function check() {
  const referenced = collectVars()
  const missing = []
  const empty = []
  const present = []

  for (const [name, files] of referenced) {
    if (OPTIONAL.has(name)) continue
    const val = process.env[name]
    if (val === undefined) missing.push({ name, files: [...files] })
    else if (val === '') empty.push({ name, files: [...files] })
    else present.push(name)
  }

  const total = referenced.size
  const failed = missing.length + empty.length

  if (failed === 0) {
    console.log(`[check-vite-env] ✓ ${present.length}/${total} VITE_ vars present in build env`)
    if (OPTIONAL.size > 0) {
      console.log(`[check-vite-env]   ${OPTIONAL.size} optional skipped: ${[...OPTIONAL].join(', ')}`)
    }
    return 0
  }

  console.error('[check-vite-env] ✗ VITE_ env-surface preflight FAILED')
  console.error('[check-vite-env]')
  if (missing.length) {
    console.error(`[check-vite-env] MISSING (${missing.length}):`)
    for (const { name, files } of missing) {
      console.error(`  - ${name}`)
      for (const f of files.slice(0, 3)) console.error(`      ${f}`)
      if (files.length > 3) console.error(`      ...and ${files.length - 3} more`)
    }
    console.error('[check-vite-env]')
  }
  if (empty.length) {
    console.error(`[check-vite-env] EMPTY (${empty.length}):`)
    for (const { name, files } of empty) {
      console.error(`  - ${name}`)
      for (const f of files.slice(0, 3)) console.error(`      ${f}`)
      if (files.length > 3) console.error(`      ...and ${files.length - 3} more`)
    }
    console.error('[check-vite-env]')
  }
  console.error('[check-vite-env] Fix: source orgs/buildconnect/secrets.env (or the')
  console.error('[check-vite-env] CI env equivalent) before `npm run build`. A missing')
  console.error('[check-vite-env] VITE_ at build time bakes either `undefined` or a')
  console.error('[check-vite-env] code-side fallback (e.g. `http://localhost:54321`)')
  console.error('[check-vite-env] into the production bundle.')
  console.error('[check-vite-env]')
  console.error('[check-vite-env] If a var is truly optional, add it to OPTIONAL in')
  console.error('[check-vite-env] scripts/check-vite-env.mjs with a one-line justification.')
  return 1
}

process.exit(check())
