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
 *   node tests/snapshots/quote-protection/runner.mjs [options]
 *
 * Options:
 *   --scenario <slug>           Run a single scenario directory.
 *                               Default: all scenarios under quote-protection/
 *   --mode <gate-logic|canonical-truth>
 *                               Which expected_outputs leaf to assert against.
 *                               Default: gate-logic (v1 ship mode).
 *   --solar-accuracy-aligned    Required to run --mode=canonical-truth.
 *                               Becomes the gate for the Solar accuracy fix arc.
 *
 * Exit codes:
 *   0  all asserted scenarios passed
 *   1  one or more scenarios failed an assertion
 *   2  runner setup error (missing fixture, malformed JSON, etc.)
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUITE_ROOT = __dirname;

function parseArgs(argv) {
  const opts = {
    scenarioDir: null,
    mode: 'gate-logic',
    solarAccuracyAligned: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scenario') {
      opts.scenarioDir = argv[++i];
    } else if (a === '--mode') {
      opts.mode = argv[++i];
    } else if (a === '--solar-accuracy-aligned') {
      opts.solarAccuracyAligned = true;
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      printHelpAndExit(2);
    }
  }
  if (opts.mode !== 'gate-logic' && opts.mode !== 'canonical-truth') {
    console.error(`invalid --mode: ${opts.mode} (allowed: gate-logic, canonical-truth)`);
    process.exit(2);
  }
  if (opts.mode === 'canonical-truth' && !opts.solarAccuracyAligned) {
    console.error('--mode=canonical-truth requires --solar-accuracy-aligned');
    console.error('  (gate-logic mode runs without the flag and is the v1 default.)');
    process.exit(2);
  }
  return opts;
}

function printHelpAndExit(code) {
  console.log(`Usage: node runner.mjs [--scenario <slug>] [--mode gate-logic|canonical-truth] [--solar-accuracy-aligned]`);
  process.exit(code);
}

function listScenarios(rootDir) {
  return readdirSync(rootDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => existsSync(join(rootDir, name, 'fixture.json')));
}

function loadFixture(scenarioDir) {
  const fixturePath = join(scenarioDir, 'fixture.json');
  if (!existsSync(fixturePath)) {
    throw new Error(`fixture.json missing in ${scenarioDir}`);
  }
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  assertMetaPresent(fixture, fixturePath);
  const solarPath = join(scenarioDir, fixture.sharedSolarFile);
  if (!existsSync(solarPath)) {
    throw new Error(`recorded Solar file ${fixture.sharedSolarFile} missing in ${scenarioDir}`);
  }
  const solar = JSON.parse(readFileSync(solarPath, 'utf-8'));
  return { fixture, solar };
}

function assertMetaPresent(fixture, fixturePath) {
  const m = fixture.__meta;
  if (!m) {
    throw new Error(`fixture missing __meta block: ${fixturePath}`);
  }
  for (const k of ['snapshotSHA', 'reason', 'recordedAt', 'recordedBundle', 'recordedBy']) {
    if (!m[k]) {
      throw new Error(`fixture __meta.${k} missing: ${fixturePath}`);
    }
  }
}

/**
 * Drive the pricing pipeline end-to-end for one scenario output.
 *
 * STUB. The real implementation extracts and calls the pure-function
 * core of the wizard:
 *   1. classifyRoofSegments(solarResponse) → { pitchedAreaSqft, flatAreaSqft }
 *   2. resolveIncludeFlatDefault(userActions) → boolean
 *   3. computeRoofTotal({ pitchedAreaSqft, flatAreaSqft, includeFlat })
 *   4. buildSelections(userActions) → Record<groupId, optionId[]>
 *   5. computeVendorTotal(priceMap, [{ ...item, selections, roofMeasurement }])
 *
 * Steps 3+5 already exist as pure functions in src/lib/. Steps 1+2+4
 * need extraction from React component bodies — that's a small refactor
 * landing in this same PR.
 */
function runScenarioOutput(_fixture, _solar, _outputKey, _output) {
  throw new Error('runner pipeline not yet implemented (skeleton — apollo authors fixtures, hephaestus wires the pipeline)');
}

function compareTotals(_expected, _actual, _path, _failures) {
  // Stub. Walks expected vs actual recursively, pushes AssertionFailure
  // entries for any mismatch. Numeric tolerance defaulted to 0 (exact
  // match required for sqft + currency-cents totals).
}

function runScenario(scenarioName, opts) {
  const scenarioDir = join(SUITE_ROOT, scenarioName);
  const { fixture, solar } = loadFixture(scenarioDir);
  const failures = [];
  let passed = 0;
  for (const [outputKey, output] of Object.entries(fixture.outputs)) {
    const expectedStep2 = output.expectedStep2Totals[opts.mode === 'gate-logic' ? 'gateLogic' : 'canonicalTruth'];
    const expectedCart = output.expectedCart[opts.mode === 'gate-logic' ? 'gateLogic' : 'canonicalTruth'];
    if (!expectedStep2 || !expectedCart) {
      if (opts.mode === 'canonical-truth') {
        // canonicalTruth is optional — skip outputs that don't define it.
        continue;
      }
      throw new Error(`fixture ${scenarioName}/${outputKey} missing required gateLogic expected values`);
    }
    try {
      const actual = runScenarioOutput(fixture, solar, outputKey, output);
      compareTotals({ step2: expectedStep2, cart: expectedCart }, actual, `${scenarioName}/${outputKey}`, failures);
      if (failures.length === 0) passed++;
    } catch (err) {
      failures.push({
        scenario: scenarioName,
        outputKey,
        mode: opts.mode,
        field: '<runner>',
        expected: '<no error>',
        actual: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { scenarioDir: scenarioName, mode: opts.mode, passed, failed: failures };
}

function reportResults(results) {
  let totalPassed = 0;
  let totalFailed = 0;
  for (const r of results) {
    totalPassed += r.passed;
    totalFailed += r.failed.length;
    if (r.failed.length === 0) {
      console.log(`PASS  ${r.scenarioDir}  (${r.passed} outputs, mode=${r.mode})`);
    } else {
      console.log(`FAIL  ${r.scenarioDir}  (${r.failed.length} of ${r.failed.length + r.passed} outputs failed, mode=${r.mode})`);
      for (const f of r.failed) {
        console.log(`        ${f.outputKey} :: ${f.field}`);
        console.log(`            expected: ${JSON.stringify(f.expected)}`);
        console.log(`            actual:   ${JSON.stringify(f.actual)}`);
      }
    }
  }
  console.log(`\n${totalPassed} passed, ${totalFailed} failed`);
  return totalFailed === 0 ? 0 : 1;
}

function main(argv) {
  const opts = parseArgs(argv);
  const scenarios = opts.scenarioDir ? [opts.scenarioDir] : listScenarios(SUITE_ROOT);
  if (scenarios.length === 0) {
    console.error('no scenarios found under', SUITE_ROOT);
    process.exit(2);
  }
  const results = scenarios.map(s => runScenario(s, opts));
  process.exit(reportResults(results));
}

main(process.argv);
