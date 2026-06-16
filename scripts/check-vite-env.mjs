#!/usr/bin/env node
// Build-time preflight guard for VITE_ env surface.
//
// Three failure classes (two-rail bake-defense + FU-1 literal-placeholder rail):
//   1. MISSING — `import.meta.env.VITE_*` referenced in src/ but unset in process.env
//   2. EMPTY   — set to ""
//   3. POISONED — set to a value that is clearly a placeholder that escaped expansion
//                 (literal $VAR / ${VAR} / "undefined" / .env.example-style stubs).
//                 FU-1 rail; banked discipline `feedback_two_rail_defense` extended.
//                 Specific incident motivating this rail: pin-33 preview white-screen
//                 caused by VITE_SUPABASE_URL set to the literal string "$SUPABASE_URL"
//                 (shell substitution did not fire; non-empty so EMPTY check did not catch).
//
// Anchors:
//   - `feedback_vite_env_full_surface_audit_before_local_wrangler_deploy`
//     (2026-05-30 N=2 BC demo-login arc — round-1 PWs missing + round-2 SUPABASE_URL/key missing)
//   - `feedback_two_rail_defense` (FU-1: fold third rail for literal-placeholder)
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

// FU-1 literal-placeholder rail. A value matching ANY of these patterns is
// rejected even when non-empty. Patterns chosen from observed real failures
// + .env.example template values that should never reach a real build.
//
// Anti-overmatch: each pattern is anchored or specific enough that a real
// secret cannot accidentally match (e.g. an anon key starting with "your-"
// would still pass MISSING and EMPTY but be flagged here — and indeed
// "your-anon-key-here" IS the .env.example stub we want to catch).
const POISON_PATTERNS = [
  // 1. Literal shell-variable token that did not expand (the pin-33 trigger).
  //    Matches "$NAME" or "${NAME}" anywhere; common when single-quoted in a
  //    shell heredoc, when set -a was missed, or when daemon-shell sourcing
  //    failed silently.
  { re: /^\$\{?[A-Z_][A-Z0-9_]*\}?$/, label: 'literal shell variable ($VAR / ${VAR})' },
  // 2. Literal "undefined" string — happens when a JS layer coerced an
  //    undefined value with `String(x)` before passing to env.
  { re: /^undefined$/, label: 'literal string "undefined"' },
  // 3. .env.example placeholders.
  { re: /^your-[a-z0-9-]+-here$/, label: '.env.example placeholder ("your-..-here")' },
  { re: /^[a-z]{2,5}_test_xxx+$/i, label: '.env.example placeholder ("xxx" stub)' },
  { re: /^AIza[A-Z]{3,}$/, label: 'Google API key placeholder' },
  // 4. Generic placeholder words that should never be a real value.
  { re: /^(your[-_]?[a-z]+|placeholder|todo|tbd|fixme|changeme)$/i, label: 'generic placeholder word' },
]

function findPoisonMatch(value) {
  for (const p of POISON_PATTERNS) {
    if (p.re.test(value)) return p.label
  }
  return null
}

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
  const poisoned = []
  const present = []

  for (const [name, files] of referenced) {
    if (OPTIONAL.has(name)) continue
    const val = process.env[name]
    if (val === undefined) {
      missing.push({ name, files: [...files] })
    } else if (val === '') {
      empty.push({ name, files: [...files] })
    } else {
      const poisonLabel = findPoisonMatch(val)
      if (poisonLabel) {
        poisoned.push({ name, files: [...files], value: val, label: poisonLabel })
      } else {
        present.push(name)
      }
    }
  }

  const total = referenced.size
  const failed = missing.length + empty.length + poisoned.length

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
  if (poisoned.length) {
    console.error(`[check-vite-env] POISONED (${poisoned.length}) — value looks like an unexpanded placeholder:`)
    for (const { name, value, label, files } of poisoned) {
      console.error(`  - ${name} = ${JSON.stringify(value)}  [${label}]`)
      for (const f of files.slice(0, 3)) console.error(`      ${f}`)
      if (files.length > 3) console.error(`      ...and ${files.length - 3} more`)
    }
    console.error('[check-vite-env]')
    console.error('[check-vite-env] Most common cause: shell variable substitution did not')
    console.error('[check-vite-env] fire (single-quoted heredoc, missing `set -a`, daemon-shell')
    console.error('[check-vite-env] sourced secrets.env in a subshell whose env did not propagate).')
    console.error('[check-vite-env] Fix: `set -a && source orgs/buildconnect/secrets.env && set +a`')
    console.error('[check-vite-env] in the SAME shell as `npm run build`.')
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
