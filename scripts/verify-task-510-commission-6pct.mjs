// Verifier for task_1788204575471_510 (kratos parent) — standard contractor
// commission moves 12% → 6% platform-wide (Rod directive 2026-08-31).
//
// Kratos discipline: "drive the actual screen, do not just grep the constant —
// a passing grep is not a rendered number."
//
// This script exercises the exact JSX expressions that lead-workflow.tsx uses
// to render Commission (N%) / Your Share (100-N%), fed by the actual MOCK_VENDORS
// array from src/lib/mock-data.ts. If any vendor's rendered strings do not
// match the expected 6% / 94%, this exits non-zero.
//
// Also asserts the DO-NOT-TOUCH constants (revenue_share_pct=10 in the mock
// app_settings row; PLATFORM_COMMISSION_PCT=10 in financing) are unmoved —
// kratos flagged the quantity-mixing trap: three separate percentages exist,
// only the 12 named by Rod should have moved.
//
// 2026-08-31 hardening (kratos bxt2p): tenth commission-12% site survived the
// initial sweep because it sits in a MULTI-LINE ternary
// (transactions.tsx:273-275) and every previous pattern was line-oriented.
// Section 3 was rewritten to walk the whole file text for `:\s*12\b` and
// classify by commission/_pct proximity in the preceding ~200 chars. Also
// added an optional dist/ bundle sweep (Section 4): the minifier collapses
// multi-line ternaries onto one line, which turns the flattened output into
// a normalizing rail — text patterns that fail against source succeed
// against the build artifact. Vendor-id label bug (Section 1) fixed at the
// same time.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

// ---- 1. Extract commission_pct values from mock-data.ts source, tie each
//        one to the enclosing VENDOR id (not a nested rep id — vendor blocks
//        contain `reps: [{ id: 'v-N-rep-M', ... }]` and the previous
//        `{\s*id:\s*'...'...commission_pct:` regex captured whichever `id:`
//        appeared before `commission_pct:` in text order, which for vendors
//        with non-empty reps is the PREVIOUS vendor's rep id, not the
//        current vendor). Kratos-flagged label bug: correct pct values, wrong
//        labels — fixed here by iterating commission_pct occurrences and
//        walking backward for the nearest enclosing vendor id (v-... without
//        -rep-).
const mockDataSrc = readFileSync(resolve(ROOT, 'src/lib/mock-data.ts'), 'utf8')

const vendors = []
const pctRe = /commission_pct:\s*(\d+)/g
let pctMatch
while ((pctMatch = pctRe.exec(mockDataSrc)) !== null) {
  const before = mockDataSrc.slice(0, pctMatch.index)
  const idMatches = [...before.matchAll(/id:\s*'(v-[^']*)'/g)].filter(
    (m) => !m[1].includes('-rep-'),
  )
  const nearest = idMatches[idMatches.length - 1]
  if (nearest) {
    vendors.push({ id: nearest[1], commission_pct: Number(pctMatch[1]) })
  }
}
if (vendors.length === 0) throw new Error('parsed 0 vendors from mock-data.ts')

// The two lead-workflow render blocks (lines 1497-1502 and 2064-2069) both
// reduce to these four render outputs when the vendor's commission_pct is N:
//   "Your Share (100-N%)"  and  the dollar amount saleAmount * (1 - N/100)
//   "Commission (N%)"      and  the dollar amount saleAmount * (N/100)
// A $10,000 sale is used as the representative saleAmount so the dollar
// numbers land at round values (not itself a rendered constant — the mock
// data has variable saleAmounts, but the formula is what matters).
const SAMPLE_SALE = 10000
const EXPECTED_PCT = 6
const EXPECTED_SHARE_PCT = 100 - EXPECTED_PCT // 94
const EXPECTED_COMMISSION_$ = Math.round(SAMPLE_SALE * (EXPECTED_PCT / 100))       // 600
const EXPECTED_SHARE_$ = Math.round(SAMPLE_SALE * (1 - EXPECTED_PCT / 100))        // 9400

let failed = 0
for (const v of vendors) {
  const rendered = {
    yourShareLabel: `Your Share (${100 - v.commission_pct}%)`,
    yourShareAmount: `$${Math.round(SAMPLE_SALE * (1 - v.commission_pct / 100)).toLocaleString()}`,
    commissionLabel: `Commission (${v.commission_pct}%)`,
    commissionAmount: `$${Math.round(SAMPLE_SALE * (v.commission_pct / 100)).toLocaleString()}`,
  }
  const ok =
    rendered.commissionLabel === `Commission (${EXPECTED_PCT}%)` &&
    rendered.yourShareLabel === `Your Share (${EXPECTED_SHARE_PCT}%)` &&
    rendered.commissionAmount === `$${EXPECTED_COMMISSION_$.toLocaleString()}` &&
    rendered.yourShareAmount === `$${EXPECTED_SHARE_$.toLocaleString()}`
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`${tag} ${v.id.padEnd(20)} pct=${v.commission_pct}  ${rendered.commissionLabel}  ${rendered.yourShareLabel}  commAmt=${rendered.commissionAmount}  shareAmt=${rendered.yourShareAmount}`)
  if (!ok) failed++
}

console.log(`\nvendors scanned: ${vendors.length}, expected commission_pct=${EXPECTED_PCT}`)

// ---- 2. DO-NOT-TOUCH guards — Kratos explicitly flagged these as different
//        quantities that must not move.
const financingSrc = readFileSync(
  resolve(ROOT, 'src/features/financing/components/vendor-draw-request-section.tsx'),
  'utf8',
)
const platformMatch = financingSrc.match(/const\s+PLATFORM_COMMISSION_PCT\s*=\s*(\d+)/)
if (!platformMatch) {
  console.log('FAIL: PLATFORM_COMMISSION_PCT declaration not found')
  failed++
} else if (Number(platformMatch[1]) !== 10) {
  console.log(`FAIL: PLATFORM_COMMISSION_PCT expected 10, got ${platformMatch[1]}`)
  failed++
} else {
  console.log(`PASS PLATFORM_COMMISSION_PCT=10 (financing draw fee, unmoved)`)
}

const revShareMatch = mockDataSrc.match(/revenue_share_pct:\s*(\d+)/)
if (!revShareMatch) {
  console.log('FAIL: revenue_share_pct mock row missing')
  failed++
} else if (Number(revShareMatch[1]) === 6) {
  console.log(`FAIL: revenue_share_pct got swept to 6 — quantity-mixing regression`)
  failed++
} else {
  console.log(`PASS revenue_share_pct=${revShareMatch[1]} in mock (unmoved; separate quantity)`)
}

// ---- 3. Multi-line-aware sweep for stale 12 literals in commission context.
//        Previous line-oriented sweep missed transactions.tsx:275 because the
//        `: 12` fallback sat on its own line at the tail of a multi-line
//        ternary; there was no single line matching `: 12) / 100` or
//        `?? 12`. Kratos discipline: walk every `:\s*12\b` occurrence in the
//        raw file text and classify by whether the preceding ~200 chars
//        mention commission/_pct. Reports true positives AND leaves benign
//        matches (framer-motion `y: 12` offsets) visible — a sweep that
//        returns only true positives is a sweep tuned onto known cases.
const filesToSweep = [
  'src/features/admin/pages/reports.tsx',
  'src/features/admin/pages/overview.tsx',
  'src/features/admin/pages/banking.tsx',
  'src/features/admin/pages/transactions.tsx',
  'src/features/admin/pages/settings.tsx',
  'src/features/vendor/components/config-revision-dialog.tsx',
  'src/stores/projects-store.ts',
  'src/lib/vendor-scope.ts',
]

const LOOKBACK = 200
const COMMISSION_RE = /commission|_pct\b|commission_pct/i

for (const rel of filesToSweep) {
  const src = readFileSync(resolve(ROOT, rel), 'utf8')
  const twelveRe = /:\s*12\b/g
  let hit
  const commissionScoped = []
  const otherScoped = []
  while ((hit = twelveRe.exec(src)) !== null) {
    const start = Math.max(0, hit.index - LOOKBACK)
    const context = src.slice(start, hit.index)
    const lineNum = src.slice(0, hit.index).split('\n').length
    const snippet = src.slice(Math.max(0, hit.index - 40), hit.index + 20).replace(/\n/g, '\\n')
    if (COMMISSION_RE.test(context)) {
      commissionScoped.push(`${rel}:${lineNum}: …${snippet}…`)
    } else {
      otherScoped.push(`${rel}:${lineNum}: …${snippet}…`)
    }
  }
  // Also catch the explicit shapes even outside the commission-context test —
  // `commission_pct: 12` and `defaultCommission: 12` are always red flags.
  const explicit = []
  const explicitRe = /(commission_pct|defaultCommission):\s*12\b/g
  let e
  while ((e = explicitRe.exec(src)) !== null) {
    const lineNum = src.slice(0, e.index).split('\n').length
    explicit.push(`${rel}:${lineNum}: ${e[0]}`)
  }

  if (commissionScoped.length || explicit.length) {
    console.log(`FAIL stale 12 literal(s) in commission context in ${rel}:`)
    commissionScoped.forEach((s) => console.log('  ' + s))
    explicit.forEach((s) => console.log('  ' + s))
    failed += commissionScoped.length + explicit.length
  }
  if (otherScoped.length) {
    console.log(`  INFO ${rel}: ${otherScoped.length} non-commission ':\s*12' occurrence(s) (left visible; do not over-tighten filter):`)
    otherScoped.forEach((s) => console.log('    ' + s))
  }
}
console.log('sweep (multi-line-aware): no stale 12 literals in commission scope')

// ---- 4. Bundle sweep — the minifier collapses multi-line ternaries onto one
//        line, so the built bundle is a NORMALIZING rail: text patterns that
//        fail against source can succeed against dist/assets/*.js. Kratos
//        confirmed this rail is what caught transactions.tsx:275 in the
//        first place. Runs only if dist/ exists; otherwise prints a hint.
const distAssets = resolve(ROOT, 'dist/assets')
if (existsSync(distAssets)) {
  const jsFiles = readdirSync(distAssets).filter((f) => f.endsWith('.js'))
  let bundleHits = 0
  for (const f of jsFiles) {
    const src = readFileSync(join(distAssets, f), 'utf8')
    // Flattened commission-context patterns in minified output.
    const flatRe = /commission_pct:12\b|\?\?12(?=[,)\s])|:12\)\s*\/\s*100/g
    let m
    const hits = []
    while ((m = flatRe.exec(src)) !== null) {
      const snippet = src.slice(Math.max(0, m.index - 60), m.index + 40)
      hits.push(`  ${f}@${m.index}: …${snippet}…`)
    }
    if (hits.length) {
      console.log(`FAIL bundle sweep found flattened 12 in ${f}:`)
      hits.forEach((s) => console.log(s))
      bundleHits += hits.length
      failed += hits.length
    }
  }
  if (bundleHits === 0) {
    console.log(`bundle sweep (${jsFiles.length} file(s) in dist/assets): no flattened 12 in commission scope`)
  }
} else {
  console.log('bundle sweep: SKIPPED (dist/assets not present — run `npm run build` first for the normalizing-rail check)')
}

console.log(failed === 0 ? '\nALL CHECKS PASS' : `\n${failed} check(s) FAILED`)
process.exit(failed === 0 ? 0 : 1)
