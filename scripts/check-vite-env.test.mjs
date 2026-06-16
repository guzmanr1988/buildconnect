#!/usr/bin/env node
// Smoke test for the FU-1 POISONED rail in check-vite-env.mjs.
//
// Invokes the guard script as a subprocess with a poisoned env and asserts
// non-zero exit + a POISONED line in stderr. Then re-invokes with a clean
// env and asserts exit 0.
//
// Run manually: `node scripts/check-vite-env.test.mjs`
//
// Intentionally not wired into CI yet (lower-prio) — kratos PR-prep only.

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPT = 'scripts/check-vite-env.mjs'

function collectViteVars() {
  const VITE = /import\.meta\.env\.(VITE_[A-Z0-9_]+)/g
  const SCAN = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'])
  const out = new Set()
  function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      const s = statSync(p)
      if (s.isDirectory()) {
        if (e === 'node_modules' || e.startsWith('.')) continue
        walk(p)
      } else if (SCAN.has(p.slice(p.lastIndexOf('.')))) {
        const text = readFileSync(p, 'utf8')
        let m
        VITE.lastIndex = 0
        while ((m = VITE.exec(text)) !== null) out.add(m[1])
      }
    }
  }
  walk('src')
  return [...out]
}

function withEnv(envOverride) {
  const env = { ...process.env, ...envOverride }
  return spawnSync('node', [SCRIPT], { env, encoding: 'utf8' })
}

function buildBaselineEnv() {
  // Give every referenced VITE_ a benign realistic value so the test can
  // toggle one at a time into a poisoned state without tripping MISSING.
  const env = {}
  for (const name of collectViteVars()) {
    env[name] = `realistic-${name.toLowerCase()}-value-001`
  }
  return env
}

const cases = [
  { name: 'literal $VAR', poison: '$SUPABASE_URL' },
  { name: 'literal ${VAR}', poison: '${SUPABASE_URL}' },
  { name: 'literal "undefined"', poison: 'undefined' },
  { name: 'your-..-here stub', poison: 'your-anon-key-here' },
  { name: 'pk_test_xxx stub', poison: 'pk_test_xxx' },
  { name: 'generic placeholder', poison: 'changeme' },
]

const baseline = buildBaselineEnv()
const referenced = Object.keys(baseline)
if (referenced.length === 0) {
  console.error('No VITE_ vars found in src/ — cannot run smoke test.')
  process.exit(2)
}
const target = referenced[0]
let failed = 0

for (const c of cases) {
  const result = withEnv({ ...baseline, [target]: c.poison })
  const ok = result.status !== 0 && /POISONED/.test(result.stderr)
  if (ok) {
    console.log(`PASS  ${c.name.padEnd(28)} → exit ${result.status}, POISONED line emitted`)
  } else {
    console.error(`FAIL  ${c.name.padEnd(28)} → exit ${result.status}`)
    console.error('---stderr---')
    console.error(result.stderr)
    console.error('---end---')
    failed += 1
  }
}

// Negative case: clean baseline should pass.
const clean = withEnv(baseline)
if (clean.status === 0) {
  console.log('PASS  clean baseline             → exit 0')
} else {
  console.error(`FAIL  clean baseline             → exit ${clean.status} (expected 0)`)
  console.error(clean.stderr)
  failed += 1
}

if (failed > 0) {
  console.error(`\n${failed} test case(s) failed.`)
  process.exit(1)
}
console.log(`\nAll ${cases.length + 1} cases passed.`)
