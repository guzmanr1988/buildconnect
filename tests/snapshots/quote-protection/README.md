# Pricing-protection snapshot runner

Pre-merge regression gate for the Solar API to cart pricing chain. Replays
recorded Solar API responses through the wizard + cart pipeline and asserts
cart shape + step-2 totals match a baseline fixture. Authored 2026-05-08
post-terrace-flat regression on Rodolfo's roof.

## Run

```bash
node tests/snapshots/quote-protection/runner.mjs                # all scenarios, gate-logic mode (v1 default)
node tests/snapshots/quote-protection/runner.mjs --scenario rodolfo-coral-gables
node tests/snapshots/quote-protection/runner.mjs --mode canonical-truth --solar-accuracy-aligned
```

Exit codes: `0` = all passed, `1` = assertion failure, `2` = setup error
(missing fixture, malformed JSON, missing `__meta` block).

## Layout

```
tests/snapshots/quote-protection/
  runner.mjs                              # CLI entry, fixture loader, pipeline driver
  types.d.ts                              # ambient TS types for fixture + runner
  README.md                               # this file
  rodolfo-coral-gables/                   # one directory per address-or-roof-shape
    fixture.json                          # __meta + wizardInputs + outputs (chip-tap-keyed)
    fixture.solar.json                    # recorded Solar API response (sidecar)
  tile-30x40-5_12/                        # synthetic baseline (kratos-provided geometry)
  shingle-40x60-4_12/                     # synthetic baseline
  ...
```

## Fixture shape (option C hybrid)

```jsonc
{
  "__meta": {
    "snapshotSHA": "<commit SHA at write time>",
    "reason": "<short why-changed string from PR description>",
    "recordedAt": "<ISO8601 of Solar capture>",
    "recordedBundle": "<BuildConnect bundle hash at capture time>",
    "recordedBy": "apollo"
  },
  "address": "1320 Granada Blvd, Coral Gables, FL 33134",
  "roofShape": "pitched-plus-flat-terrace",
  "sharedSolarFile": "fixture.solar.json",
  "sharedWizardInputs": { "mode": "full", "address": "..." },
  "outputs": {
    "chip=metal-only": {
      "userActions": [{ "step": 1, "type": "chip-tap", "value": "standing_seam_metal" }],
      "expectedStep2Totals": {
        "gateLogic":      { "pitchedSqft": 2053, "flatSqft": 0, "totalSqft": 2094, "includeMaterialOrderDefault": true, "includePerimeterDefault": true },
        "canonicalTruth": { "pitchedSqft": 2475, "flatSqft": 0, "totalSqft": 2525 }
      },
      "expectedCart": {
        "gateLogic":      { "roofMeasurement": { "pitchedSqft": 2053, "totalSqft": 2053 }, "items": [/* ... */] },
        "canonicalTruth": { "roofMeasurement": { "pitchedSqft": 2475, "totalSqft": 2475 }, "items": [/* ... */] }
      }
    }
  }
}
```

## Two modes (gateLogic + canonicalTruth)

**`gateLogic`** is the v1 ship mode. It asserts the wizard correctly filtered
the recorded Solar input — chip=metal-only fires the gate, flat sqft drops
out of the cart. Catches the regression class that motivated this layer
(PR #167 cart-gate, terrace-flat sneaking into chip=metal pricing).

**`canonicalTruth`** asserts the end-to-end cart matches the operator's
ground truth (Rodolfo's tape on his actual roof, or kratos-provided
synthetic geometry). Optional per fixture. Runner asserts it only when
invoked with `--solar-accuracy-aligned`. The `canonicalTruth` mode is
itself the gate for the downstream Solar accuracy fix arc — when Solar
starts reading the right square footage, this mode flips green.

The two modes don't block each other. Mode-i ships v1 today against the
current Solar undercount; mode-ii catches the day Solar drifts back.

## CODEOWNERS lock

Baseline mutations are gated by required review from `@argus` and
`@analyst` (see `/CODEOWNERS`). Both expected_outputs and the recorded
Solar JSON are in scope. Updating a fixture requires:

1. A reason in the PR description (lands in `__meta.reason`).
2. A bumped `__meta.snapshotSHA` to the new commit.
3. Updated `__meta.recordedAt` if the Solar response was re-captured.

The runner asserts `__meta` presence before running the scenario; a
fixture with a missing `__meta` field exits 2.

## Architecture

The v1 runner is a **pure-function** consumer of the pricing pipeline:
no jsdom, no React render, no live network. It calls extracted pure
functions from `src/lib/`:

- `classifyRoofSegments(solarResponse)` — Solar JSON to pitched/flat split
  (extracted from `roof-measurement-wizard.tsx` segment-classification
  loop into `src/lib/roof-segment-classify.ts`).
- `resolveIncludeMaterialOrder(userActions)` — section-header toggle
  resolution (defaults true; last explicit toggle wins).
- `resolveIncludePerimeter(userActions)` — perimeter section-header
  toggle resolution (defaults true; last explicit toggle wins).
- `buildSelections(userActions)` — userActions to selections record.
- `computeRoofTotal(...)` — already pure in `src/lib/roof-area-math.ts`.
- `computeVendorTotal(...)` — already pure in `src/lib/api/pricing.ts`.

### Escape valve to jsdom (mode b)

If a future regression slips that requires real DOM event ordering or
React effect-cleanup semantics to manifest, lift the runner to
jsdom-driven by:

1. Adding `jsdom` and `@testing-library/react` as dev deps.
2. Replacing `runScenarioOutput()` with a render-and-dispatch path that
   mounts `<RoofingWizard />` in jsdom, dispatches userActions as DOM
   events, and reads cart-store state.
3. Keeping the fixture format unchanged — userActions translates 1:1.

This is documented as an option, not a recommendation. The pure-function
path catches the regression classes seen so far (PR #167 cart-gate,
toggle-default-from-chip-tap, server-wins union-fill clobbering bundled
type). Lift to jsdom only if a real regression escapes both the pure-fn
path AND the apollo daily prod walk.

## CI integration

The runner is wired as a required status check on `personal/main` via
`.github/workflows/quote-protection.yml`. PRs that touch `src/lib/`,
`src/stores/`, `src/features/homeowner/`, or `tests/snapshots/quote-protection/`
trigger the workflow. A failing assertion blocks merge.

To intentionally update a baseline:

1. Open a PR with the fixture change AND the source change in the same
   commit.
2. Update `__meta.reason` with the why-changed string.
3. Bump `__meta.snapshotSHA` after rebase to the merge commit's SHA.
4. Get @argus + @analyst review.
