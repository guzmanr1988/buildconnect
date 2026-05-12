#!/usr/bin/env node
/**
 * Pricing-protection snapshot runner.
 *
 * Replays recorded Solar API responses through the pricing pipeline and
 * asserts cart shape + step-2 totals match the fixture baseline. Pure-fn
 * v1: no jsdom, no React render, no live network. See README.md for the
 * escape-valve to jsdom-driven mode (b) if a future regression class
 * requires DOM event semantics.
 *
 * Usage:
 *   node --import tsx tests/snapshots/quote-protection/runner.mts [options]
 *   (or via package.json script: npm run quote-protection)
 *
 * Options:
 *   --scenario <slug>           Run a single scenario directory.
 *                               Default: all scenarios under quote-protection/
 *   --mode <gate-logic|canonical-truth>
 *                               Which expected leaf to assert against.
 *                               Default: gate-logic (v1 ship mode).
 *   --solar-accuracy-aligned    Required to run --mode=canonical-truth.
 *                               Becomes the gate for the Solar accuracy fix arc.
 *
 * Exit codes:
 *   0  all asserted scenarios passed
 *   1  one or more scenarios failed an assertion
 *   2  runner setup error (missing fixture, malformed JSON, etc.)
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { classifyRoofSegments, type RoofSegmentStat } from '../../../src/lib/roof-segment-classify.ts'
import { computeRoofTotal } from '../../../src/lib/roof-area-math.ts'
import {
  buildSelections,
  resolveIncludeMaterialOrder,
  resolveIncludePerimeter,
  type UserAction,
} from '../../../src/lib/wizard-action-replay.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUITE_ROOT = __dirname

type RunnerMode = 'gate-logic' | 'canonical-truth'
type FixtureModeKey = 'gateLogic' | 'canonicalTruth'

type RunnerOptions = {
  scenarioDir: string | null
  mode: RunnerMode
  solarAccuracyAligned: boolean
}

type Step2Expected = {
  pitchedSqft: number
  flatSqft: number
  totalSqft: number
  squares?: number
  includeMaterialOrderDefault?: boolean
  includePerimeterDefault?: boolean
}

type CartItemExpected = {
  serviceId: string
  subtotal: number
  total: number
}

type CartExpected = {
  roofMeasurement: { pitchedSqft: number; flatSqft: number; totalSqft: number }
  items: CartItemExpected[]
}

type OutputExpected = {
  step2: Partial<Record<FixtureModeKey, Step2Expected>>
  cart: Partial<Record<FixtureModeKey, CartExpected>>
}

type ScenarioOutput = {
  userActions: UserAction[]
  expected: OutputExpected
}

type Fixture = {
  __meta: {
    snapshotSHA: string
    reason: string
    recordedAt: string
    recordedBundle: string
    recordedBy: string
  }
  address: string
  roofShape: string
  sharedSolarFile: string
  sharedWizardInputs: { address: string; mode: string }
  outputs: Record<string, ScenarioOutput>
}

type SolarRecording = {
  __meta?: unknown
  response?: {
    solarPotential: { roofSegmentStats: RoofSegmentStat[] }
  }
  solarPotential?: { roofSegmentStats: RoofSegmentStat[] }
}

type AssertionFailure = {
  scenario: string
  outputKey: string
  mode: RunnerMode
  field: string
  expected: unknown
  actual: unknown
}

type ScenarioResult = {
  scenarioDir: string
  mode: RunnerMode
  passed: number
  failed: AssertionFailure[]
}

function parseArgs(argv: string[]): RunnerOptions {
  const opts: RunnerOptions = {
    scenarioDir: null,
    mode: 'gate-logic',
    solarAccuracyAligned: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--scenario') opts.scenarioDir = argv[++i] ?? null
    else if (a === '--mode') opts.mode = (argv[++i] ?? '') as RunnerMode
    else if (a === '--solar-accuracy-aligned') opts.solarAccuracyAligned = true
    else if (a === '--help' || a === '-h') printHelpAndExit(0)
    else {
      console.error(`unknown arg: ${a}`)
      printHelpAndExit(2)
    }
  }
  if (opts.mode !== 'gate-logic' && opts.mode !== 'canonical-truth') {
    console.error(`invalid --mode: ${opts.mode} (allowed: gate-logic, canonical-truth)`)
    process.exit(2)
  }
  if (opts.mode === 'canonical-truth' && !opts.solarAccuracyAligned) {
    console.error('--mode=canonical-truth requires --solar-accuracy-aligned')
    console.error('  (gate-logic mode runs without the flag and is the v1 default.)')
    process.exit(2)
  }
  return opts
}

function printHelpAndExit(code: number): never {
  console.log('Usage: node --import tsx runner.mts [--scenario <slug>] [--mode gate-logic|canonical-truth] [--solar-accuracy-aligned]')
  process.exit(code)
}

function listScenarios(rootDir: string): string[] {
  return readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(join(rootDir, name, 'fixture.json')))
}

function loadFixture(scenarioDir: string): { fixture: Fixture; solar: SolarRecording } {
  const fixturePath = join(scenarioDir, 'fixture.json')
  if (!existsSync(fixturePath)) throw new Error(`fixture.json missing in ${scenarioDir}`)
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8')) as Fixture
  assertMetaPresent(fixture, fixturePath)
  const solarPath = join(scenarioDir, fixture.sharedSolarFile)
  if (!existsSync(solarPath)) {
    throw new Error(`recorded Solar file ${fixture.sharedSolarFile} missing in ${scenarioDir}`)
  }
  const solar = JSON.parse(readFileSync(solarPath, 'utf-8')) as SolarRecording
  return { fixture, solar }
}

function assertMetaPresent(fixture: Fixture, fixturePath: string): void {
  const m = fixture.__meta
  if (!m) throw new Error(`fixture missing __meta block: ${fixturePath}`)
  for (const k of ['snapshotSHA', 'reason', 'recordedAt', 'recordedBundle', 'recordedBy'] as const) {
    if (!m[k]) throw new Error(`fixture __meta.${k} missing: ${fixturePath}`)
  }
}

function getRoofSegments(solar: SolarRecording): RoofSegmentStat[] {
  // Apollo wraps captured Solar JSON as { __meta, response: <raw solar> }.
  // Older fixtures may store raw solar at top level. Support both.
  const sp = solar.response?.solarPotential ?? solar.solarPotential
  if (!sp) throw new Error('solar fixture has no solarPotential block (expected response.solarPotential or top-level)')
  return sp.roofSegmentStats
}

/**
 * Drive the pricing pipeline end-to-end for one scenario output and emit
 * the same shape the fixture asserts against.
 *
 * Mirrors roof-measurement-wizard.tsx surfaces:
 *  - step2: what the user sees on the Step-2 panel inside the modal
 *           (Total label uses computeRoofTotal post-waste; pitched/flat
 *            labels gated by chip-tap — pitched shows raw pre-waste when
 *            any non-flat material chip is tapped; flat label renders
 *            round(rawFlat*1.02) only when flat_roof chip is tapped).
 *  - cart : what handleComplete writes to cart-store.roofMeasurement
 *           (raw pre-waste values gated by chip-tap AND the section-level
 *            includeMaterialOrder toggle; flatAreaSqft zeroed when chip
 *            unselected or when section toggle off).
 */
function runScenarioOutput(
  fixture: Fixture,
  solar: SolarRecording,
  output: ScenarioOutput,
): { step2: Step2Expected; cart: CartExpected } {
  const segments = getRoofSegments(solar)
  const { pitchedAreaSqft, flatAreaSqft } = classifyRoofSegments(segments)
  const includeMaterialOrder = resolveIncludeMaterialOrder(output.userActions)
  const includePerimeter = resolveIncludePerimeter(output.userActions)
  const selections = buildSelections(output.userActions)
  const matSelections = selections.material ?? []
  const hasPitchedChip = matSelections.some((m) => m !== 'flat_roof')
  const hasFlatChip = matSelections.includes('flat_roof')

  const pitchedForOrder = hasPitchedChip ? pitchedAreaSqft : 0
  const flatForOrder = hasFlatChip ? flatAreaSqft : 0

  const totals = computeRoofTotal({
    pitchedAreaSqft: pitchedForOrder,
    flatAreaSqft: flatForOrder,
    includeMaterialOrder,
  })
  const step2FlatSqft = flatForOrder > 0 ? Math.round(flatForOrder * 1.02) : 0

  const step2: Step2Expected = {
    pitchedSqft: pitchedForOrder,
    flatSqft: step2FlatSqft,
    totalSqft: totals.totalSqft,
    squares: totals.totalSquares,
    includeMaterialOrderDefault: includeMaterialOrder,
    includePerimeterDefault: includePerimeter,
  }

  const cartPitched = includeMaterialOrder && hasPitchedChip ? pitchedAreaSqft : 0
  const cartFlat = includeMaterialOrder && hasFlatChip ? flatAreaSqft : 0
  const cartTotal = cartPitched + cartFlat
  const serviceIds = matSelections.length > 0 ? ['roofing'] : []
  const cart: CartExpected = {
    roofMeasurement: {
      pitchedSqft: cartPitched,
      flatSqft: cartFlat,
      totalSqft: cartTotal,
    },
    items: serviceIds.map((sid) => ({ serviceId: sid, subtotal: 0, total: 0 })),
  }

  return { step2, cart }
}

function pushFailure(
  failures: AssertionFailure[],
  scenario: string,
  outputKey: string,
  mode: RunnerMode,
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  failures.push({ scenario, outputKey, mode, field, expected, actual })
}

function compareStep2(
  expected: Step2Expected,
  actual: Step2Expected,
  scenario: string,
  outputKey: string,
  mode: RunnerMode,
  failures: AssertionFailure[],
): void {
  const fields: Array<keyof Step2Expected> = [
    'pitchedSqft', 'flatSqft', 'totalSqft', 'squares',
    'includeMaterialOrderDefault', 'includePerimeterDefault',
  ]
  for (const f of fields) {
    if (expected[f] === undefined) continue
    if (expected[f] !== actual[f]) {
      pushFailure(failures, scenario, outputKey, mode, `step2.${f}`, expected[f], actual[f])
    }
  }
}

function compareCart(
  expected: CartExpected,
  actual: CartExpected,
  scenario: string,
  outputKey: string,
  mode: RunnerMode,
  failures: AssertionFailure[],
): void {
  for (const f of ['pitchedSqft', 'flatSqft', 'totalSqft'] as const) {
    if (expected.roofMeasurement[f] !== actual.roofMeasurement[f]) {
      pushFailure(
        failures, scenario, outputKey, mode,
        `cart.roofMeasurement.${f}`,
        expected.roofMeasurement[f], actual.roofMeasurement[f],
      )
    }
  }
  if (expected.items.length !== actual.items.length) {
    pushFailure(
      failures, scenario, outputKey, mode,
      'cart.items.length',
      expected.items.length, actual.items.length,
    )
    return
  }
  for (let i = 0; i < expected.items.length; i++) {
    const e = expected.items[i]
    const a = actual.items[i]
    for (const f of ['serviceId', 'subtotal', 'total'] as const) {
      if (e[f] !== a[f]) {
        pushFailure(failures, scenario, outputKey, mode, `cart.items[${i}].${f}`, e[f], a[f])
      }
    }
  }
}

function runScenario(scenarioName: string, opts: RunnerOptions): ScenarioResult {
  const scenarioDir = join(SUITE_ROOT, scenarioName)
  const { fixture, solar } = loadFixture(scenarioDir)
  const failures: AssertionFailure[] = []
  let passed = 0
  const modeKey: FixtureModeKey = opts.mode === 'gate-logic' ? 'gateLogic' : 'canonicalTruth'

  for (const [outputKey, output] of Object.entries(fixture.outputs)) {
    const expectedStep2 = output.expected?.step2?.[modeKey]
    const expectedCart = output.expected?.cart?.[modeKey]
    if (!expectedStep2 || !expectedCart) {
      if (opts.mode === 'canonical-truth') continue
      throw new Error(`fixture ${scenarioName}/${outputKey} missing required gateLogic expected values`)
    }
    let outputFailedBefore = failures.length
    try {
      const actual = runScenarioOutput(fixture, solar, output)
      compareStep2(expectedStep2, actual.step2, scenarioName, outputKey, opts.mode, failures)
      compareCart(expectedCart, actual.cart, scenarioName, outputKey, opts.mode, failures)
      if (failures.length === outputFailedBefore) passed++
    } catch (err) {
      pushFailure(
        failures, scenarioName, outputKey, opts.mode, '<runner>',
        '<no error>',
        err instanceof Error ? err.message : String(err),
      )
    }
  }
  return { scenarioDir: scenarioName, mode: opts.mode, passed, failed: failures }
}

function reportResults(results: ScenarioResult[]): number {
  let totalPassed = 0
  let totalFailed = 0
  for (const r of results) {
    totalPassed += r.passed
    totalFailed += r.failed.length
    if (r.failed.length === 0) {
      console.log(`PASS  ${r.scenarioDir}  (${r.passed} outputs, mode=${r.mode})`)
      continue
    }
    const totalOutputs = r.passed + new Set(r.failed.map((f) => f.outputKey)).size
    console.log(`FAIL  ${r.scenarioDir}  (mode=${r.mode}, ${r.failed.length} field-mismatches across ${totalOutputs} outputs)`)
    for (const f of r.failed) {
      console.log(`        ${f.outputKey} :: ${f.field}`)
      console.log(`            expected: ${JSON.stringify(f.expected)}`)
      console.log(`            actual:   ${JSON.stringify(f.actual)}`)
      if (typeof f.expected === 'number' && typeof f.actual === 'number') {
        const gap = f.actual - f.expected
        console.log(`            gap:      ${gap > 0 ? '+' : ''}${gap}`)
      }
    }
  }
  console.log(`\n${totalPassed} passed, ${totalFailed} field-mismatches`)
  return totalFailed === 0 ? 0 : 1
}

function main(argv: string[]): never {
  const opts = parseArgs(argv)
  const scenarios = opts.scenarioDir ? [opts.scenarioDir] : listScenarios(SUITE_ROOT)
  if (scenarios.length === 0) {
    console.error('no scenarios found under', SUITE_ROOT)
    process.exit(2)
  }
  const results = scenarios.map((s) => runScenario(s, opts))
  process.exit(reportResults(results))
}

main(process.argv)
