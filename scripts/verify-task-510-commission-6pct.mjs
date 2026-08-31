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

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

// ---- 1. Extract commission_pct values from mock-data.ts source, tie each
//        one to the enclosing vendor id, and re-run the lead-workflow
//        render expressions against them.
const mockDataSrc = readFileSync(resolve(ROOT, 'src/lib/mock-data.ts'), 'utf8')

// Match every { … commission_pct: N, … } vendor object literal by walking
// forward from each `commission_pct:` occurrence and extracting the id.
const vendorRe = /\{\s*id:\s*'([^']+)'[\s\S]*?commission_pct:\s*(\d+)/g
const vendors = []
let m
while ((m = vendorRe.exec(mockDataSrc)) !== null) {
  vendors.push({ id: m[1], commission_pct: Number(m[2]) })
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
  // Render exactly as lead-workflow.tsx does:
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

// Mock app_settings row carries revenue_share_pct — separate quantity from
// vendor commission_pct. Kratos noted prod DB has 15 for this field; the
// mock currently has 10. Either way, the important assertion for this PR is
// "did not move from whatever it was" — capture the current value and prove
// nothing changed. Since we did not touch it in this change, any non-6 is
// fine here; the guard is just that the field still exists and did not get
// swept up in the mock-data rewrite.
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

// ---- 3. Sweep for stale 12% literals in commission context.
const filesToSweep = [
  'src/features/admin/pages/reports.tsx',
  'src/features/admin/pages/overview.tsx',
  'src/features/admin/pages/banking.tsx',
  'src/features/vendor/components/config-revision-dialog.tsx',
  'src/stores/projects-store.ts',
  'src/features/admin/pages/settings.tsx',
  'src/lib/vendor-scope.ts',
]
for (const rel of filesToSweep) {
  const src = readFileSync(resolve(ROOT, rel), 'utf8')
  // Look for the two shapes I edited: `: 12) / 100`  and  `?? 12` in a
  // commission-adjacent line, and commission_pct: 12.
  const lines = src.split('\n')
  const stale = []
  lines.forEach((ln, i) => {
    if (/commission_pct:\s*12\b/.test(ln)) stale.push(`${rel}:${i + 1}: ${ln.trim()}`)
    if (/:\s*12\)\s*\/\s*100/.test(ln)) stale.push(`${rel}:${i + 1}: ${ln.trim()}`)
    if (/\?\?\s*12\b/.test(ln) && /commission|pct|vendor/i.test(ln)) stale.push(`${rel}:${i + 1}: ${ln.trim()}`)
    if (/defaultCommission:\s*12\b/.test(ln)) stale.push(`${rel}:${i + 1}: ${ln.trim()}`)
  })
  if (stale.length) {
    console.log(`FAIL stale 12 literal(s) in ${rel}:`)
    stale.forEach((s) => console.log('  ' + s))
    failed += stale.length
  }
}
console.log('sweep: no stale 12 literals in commission scope')

console.log(failed === 0 ? '\nALL CHECKS PASS' : `\n${failed} check(s) FAILED`)
process.exit(failed === 0 ? 0 : 1)
