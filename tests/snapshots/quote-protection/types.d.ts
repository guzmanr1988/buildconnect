/**
 * Pricing-protection layer — fixture types for the snapshot runner.
 *
 * Format locked between hephaestus + apollo 2026-05-08 (option C hybrid):
 * one directory per address-or-roof-shape, chip-tap permutations keyed
 * inside as `outputs[K]`. Solar recording is sidecar (fixture.solar.json)
 * to keep scenario diffs readable.
 *
 * Two-mode philosophy locked same day (option Z):
 * - gateLogic        — asserts the gate fires correctly against the
 *                      RECORDED Solar input. v1 ships against this.
 * - canonicalTruth   — asserts cart matches Rodolfo's tape (or synthetic
 *                      ground truth). Optional. Runner asserts only
 *                      when the `solarAccuracyAligned` flag is set.
 *                      Becomes the gate for the Solar accuracy fix arc.
 */

export type FixtureMeta = {
  snapshotSHA: string;
  reason: string;
  recordedAt: string;
  recordedBundle: string;
  recordedBy: string;
};

export type WizardMode = 'full' | 'repair';

export type WizardInputs = {
  address: string;
  mode: WizardMode;
};

export type UserActionType = 'chip-tap' | 'addon-toggle' | 'include-flat-toggle';

export type UserAction = {
  step: 1 | 2 | 3;
  type: UserActionType;
  value: string | boolean;
};

export type Step2Totals = {
  pitchedSqft: number;
  flatSqft: number;
  totalSqft: number;
  squares?: number;
  includeFlatDefault?: boolean;
};

export type CartRoofMeasurement = {
  pitchedSqft: number;
  flatSqft?: number;
  totalSqft: number;
};

export type CartItem = {
  serviceId: string;
  subtotal: number;
  total: number;
  addons?: string[];
};

export type ExpectedCart = {
  roofMeasurement: CartRoofMeasurement;
  items: CartItem[];
};

export type ExpectedStep2Totals = {
  gateLogic: Step2Totals;
  canonicalTruth?: Step2Totals;
};

export type ExpectedCartTotals = {
  gateLogic: ExpectedCart;
  canonicalTruth?: ExpectedCart;
};

export type ScenarioOutput = {
  userActions: UserAction[];
  expectedStep2Totals: ExpectedStep2Totals;
  expectedCart: ExpectedCartTotals;
};

export type Fixture = {
  __meta: FixtureMeta;
  address: string;
  roofShape: string;
  sharedSolarFile: string;
  sharedWizardInputs: WizardInputs;
  outputs: Record<string, ScenarioOutput>;
};

export type RunnerMode = 'gate-logic' | 'canonical-truth';

export type RunnerOptions = {
  mode: RunnerMode;
  scenarioDir?: string;
  solarAccuracyAligned: boolean;
};

export type AssertionFailure = {
  scenario: string;
  outputKey: string;
  mode: RunnerMode;
  field: string;
  expected: unknown;
  actual: unknown;
};

export type RunnerResult = {
  scenarioDir: string;
  mode: RunnerMode;
  passed: number;
  failed: AssertionFailure[];
};
