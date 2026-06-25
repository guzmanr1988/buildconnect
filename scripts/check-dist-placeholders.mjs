#!/usr/bin/env node
// Build-time postbuild guard for shell-placeholder leakage into the bundle.
//
// Fails the build if any file under `dist/` contains a literal shell-style
// placeholder string of the form `"$NAME"` or `'$NAME'` — the residue of a
// `VITE_*="$VAR"` indirection in a dotenv-loaded secrets file that survived
// preflight (e.g. the var was non-empty in process.env but resolved to the
// literal `$VAR` string).
//
// Sister to `scripts/check-vite-env.mjs` (prebuild env-surface preflight).
// Where prebuild catches the placeholder at env-time, this catches it at
// bundle-time — defense-in-depth for the case where the prebuild env source
// differs from the vite-build env source (CI mismatch, ad-hoc wrangler
// invocation, branch-divergent build harness).
//
// Anchor: banked discipline `feedback_vite_env_dotenv_indirection_trap` (N=2,
// 2026-05-30 + 2026-06-22 M2 banking-real-stripe preview catch by apollo).
//
// Runs as `postbuild` (npm runs postbuild → build automatically).
// Local invocation: `node scripts/check-dist-placeholders.mjs`.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST_DIR = 'dist'
const SCAN_EXTS = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.json'])

// Matches quoted shell-style placeholder strings inside text content:
//   "$SUPABASE_URL"   '$VITE_FOO_BAR'   "$ABC_123"
// Constraints (tuned to minimize false positives in minified bundles):
//   - Outer single OR double quote.
//   - Leading `$`.
//   - First char after `$` is uppercase letter or underscore.
//   - Trailing chars are uppercase letters, digits, or underscores.
//   - Total identifier length >= 3 (so we never flag `$A` / `$AB` /
//     short single-letter $ usages like jQuery / shell aliases).
//   - No interior whitespace, no nested quotes.
const PLACEHOLDER_PATTERN =
  /(["'])\$([A-Z_][A-Z0-9_]{2,})\1/g

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (e) {
    if (e.code === 'ENOENT') return out
    throw e
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    const st = statSync(path)
    if (st.isDirectory()) {
      walk(path, out)
    } else if (SCAN_EXTS.has(path.slice(path.lastIndexOf('.')))) {
      out.push(path)
    }
  }
  return out
}

function check() {
  const files = walk(DIST_DIR)

  if (files.length === 0) {
    console.error('[check-dist-placeholders] ✗ no scannable files found under dist/')
    console.error('[check-dist-placeholders]   (did `vite build` actually run? expected dist/assets/*.js)')
    return 1
  }

  const hits = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    PLACEHOLDER_PATTERN.lastIndex = 0
    const seen = new Set()
    let m
    while ((m = PLACEHOLDER_PATTERN.exec(text)) !== null) {
      const name = m[2]
      const literal = m[0]
      const key = `${name}::${literal}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({ file, name, literal })
    }
  }

  if (hits.length === 0) {
    console.log(`[check-dist-placeholders] ✓ ${files.length} bundle files scanned, no shell-placeholder leakage`)
    return 0
  }

  console.error('[check-dist-placeholders] ✗ shell-placeholder strings baked into dist/ bundle')
  console.error('[check-dist-placeholders]')
  console.error(`[check-dist-placeholders] ${hits.length} occurrence(s) across ${new Set(hits.map(h => h.file)).size} file(s):`)
  for (const { file, literal } of hits.slice(0, 20)) {
    console.error(`  - ${literal}  in  ${file}`)
  }
  if (hits.length > 20) console.error(`  ...and ${hits.length - 20} more`)
  console.error('[check-dist-placeholders]')
  console.error('[check-dist-placeholders] A literal `"$VAR"` in the built bundle means a VITE_* var')
  console.error('[check-dist-placeholders] resolved to a shell-indirection placeholder at build time')
  console.error('[check-dist-placeholders] (dotenv does not expand `KEY="$OTHER"`). The deployed site')
  console.error('[check-dist-placeholders] will use the literal `$VAR` string and crash on first use')
  console.error('[check-dist-placeholders] (e.g. "Invalid supabaseUrl").')
  console.error('[check-dist-placeholders]')
  console.error('[check-dist-placeholders] Fix: in orgs/buildconnect/secrets.env, replace any')
  console.error('[check-dist-placeholders] `VITE_FOO="$BAR"` indirection with the literal value, OR')
  console.error('[check-dist-placeholders] explicit-export the source var into the build env before')
  console.error('[check-dist-placeholders] `npm run build`. See feedback_vite_env_dotenv_indirection_trap.')
  return 1
}

process.exit(check())
