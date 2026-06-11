-- 068_vendor_service_rates.sql
-- Per-vendor unit-rate table for measurement-driven configurators.
--
-- task_1780668287986_922 (helios) — promotes remodel + bathroom from in-code
-- placeholder rates to per-vendor seeded rates so vendor-compare surfaces
-- believable DIFFERENT prices across vendors (consistent with the roofing
-- $28,780 path, which already reads per-vendor from vendor_option_prices).
--
-- Scope (kratos picked option B 2026-06-07 msg 1780811129174-kratos-kd88r):
-- remodel + bathroom only. Pool / driveways / fencing / pergolas / AC /
-- kitchen / paneling / garage / painting / blinds stay on flat presets and
-- are filed post-launch.
--
-- Per-vendor variation strategy: 3 real vendors seeded with tiered rates
-- (DEMO_VENDOR_UUID_BY_MOCK_ID file is stale; queried auth.users for actual
-- vendor profiles, then mapped):
--   3e0821aa-89e7-4140-bff8-c4f7f985f561 (Apex Roofing & Solar, vendor@buildc.net)  → MEDIAN baseline (anchor — primary demo vendor)
--   fc0d8ff3-cc1c-4101-a4b3-068594753bbf (Apex Roofing & Solar, apex-demo@buildc.net) → PREMIUM (+10%)
--   2361dc61-036c-4097-b5f0-5d69324214d5 (ApolloE2E Roofing LLC, apollo-e2e-vendor-b@buildc.net) → BUDGET (-8%)
-- MH HOME SOLUTIONS (Rod's own — 7db2dc32 + bbcea996) intentionally NOT seeded so
-- Rod sets his own rates via vendor self-edit (Tranche-2 admin endpoint).
-- New vendors that don't have rate rows fall back to the in-code
-- ratePlaceholder so the engine never returns null/$0 for missing rates.

BEGIN;

CREATE TABLE IF NOT EXISTS vendor_service_rates (
  vendor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_category text NOT NULL,
  line_id text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('sqft', 'linear_ft', 'flat')),
  rate_cents integer NOT NULL CHECK (rate_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, service_category, line_id)
);

CREATE INDEX IF NOT EXISTS vendor_service_rates_vendor_category_idx
  ON vendor_service_rates (vendor_id, service_category)
  WHERE active = true;

ALTER TABLE vendor_service_rates ENABLE ROW LEVEL SECURITY;

-- Public read: vendor-compare renders prices for anon homeowners during
-- the demo flow; authenticated homeowners also read on booking-confirmation
-- snapshot. Same shape as vendor_option_prices public-read.
CREATE POLICY vsr_public_read ON vendor_service_rates
  FOR SELECT TO anon, authenticated
  USING (active = true);

-- Vendor write own rows only.
CREATE POLICY vsr_vendor_insert ON vendor_service_rates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = vendor_id);

CREATE POLICY vsr_vendor_update ON vendor_service_rates
  FOR UPDATE TO authenticated
  USING (auth.uid() = vendor_id)
  WITH CHECK (auth.uid() = vendor_id);

CREATE POLICY vsr_vendor_delete ON vendor_service_rates
  FOR DELETE TO authenticated
  USING (auth.uid() = vendor_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION vsr_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vsr_touch_updated_at_trg ON vendor_service_rates;
CREATE TRIGGER vsr_touch_updated_at_trg
  BEFORE UPDATE ON vendor_service_rates
  FOR EACH ROW EXECUTE FUNCTION vsr_touch_updated_at();

-- =====================================================================
-- SEED: 3 demo vendors × (remodel + bathroom) at South Florida 2026 market.
-- Tier multipliers: v-1 = 1.10, v-2 = 1.00, v-3 = 0.92 (premium/median/budget).
-- Numbers approved by kratos msg <PENDING>.
-- =====================================================================

-- ============== REMODEL (8 lines) ==============
INSERT INTO vendor_service_rates (vendor_id, service_category, line_id, unit, rate_cents) VALUES
  -- v-1 Apex (PREMIUM tier, +10%)
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'remodel', 'remodel-popcorn-removal',   'sqft',      275),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'remodel', 'remodel-ceiling-demo',      'sqft',      220),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'remodel', 'remodel-framing',           'linear_ft', 1540),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'remodel', 'remodel-drywall-walls',     'sqft',      440),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'remodel', 'remodel-drywall-ceiling',   'sqft',      495),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'remodel', 'remodel-paint-texture',     'sqft',      360),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'remodel', 'remodel-permit-haul-setup', 'flat',      99000),
  -- v-2 Shield (MEDIAN tier)
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'remodel', 'remodel-popcorn-removal',   'sqft',      250),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'remodel', 'remodel-ceiling-demo',      'sqft',      200),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'remodel', 'remodel-framing',           'linear_ft', 1400),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'remodel', 'remodel-drywall-walls',     'sqft',      400),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'remodel', 'remodel-drywall-ceiling',   'sqft',      450),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'remodel', 'remodel-paint-texture',     'sqft',      325),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'remodel', 'remodel-permit-haul-setup', 'flat',      90000),
  -- v-3 Paradise (BUDGET tier, -8%)
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'remodel', 'remodel-popcorn-removal',   'sqft',      230),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'remodel', 'remodel-ceiling-demo',      'sqft',      185),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'remodel', 'remodel-framing',           'linear_ft', 1290),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'remodel', 'remodel-drywall-walls',     'sqft',      370),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'remodel', 'remodel-drywall-ceiling',   'sqft',      415),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'remodel', 'remodel-paint-texture',     'sqft',      300),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'remodel', 'remodel-permit-haul-setup', 'flat',      83000)
ON CONFLICT (vendor_id, service_category, line_id) DO UPDATE
  SET unit = EXCLUDED.unit, rate_cents = EXCLUDED.rate_cents, active = true, updated_at = now();

-- ============== BATHROOM (15 priced lines; FIXTURES intentionally absent — $0 ledger client-provided) ==============
INSERT INTO vendor_service_rates (vendor_id, service_category, line_id, unit, rate_cents) VALUES
  -- v-1 Apex (PREMIUM tier, +10%)
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-demo',                  'flat', 143000),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-plumbing-roughin',      'flat', 209000),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-electrical-roughin',    'flat', 77000),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-cement-board',          'sqft', 660),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-subfloor-leveling',     'sqft', 275),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-floor-tile-install',    'sqft', 935),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-wall-tile-install',     'sqft', 1045),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-vanity-set',            'flat', 49500),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-double-vanity-extra',   'flat', 36000),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-toilet-set',            'flat', 30000),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-shower-trim',           'flat', 36000),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-tub-set',               'flat', 47000),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-mirror-accessories',    'flat', 22000),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-paint',                 'sqft', 385),
  ('fc0d8ff3-cc1c-4101-a4b3-068594753bbf', 'bathroom', 'bathroom-permit-haul-setup',     'flat', 110000),
  -- v-2 Shield (MEDIAN tier)
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-demo',                  'flat', 130000),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-plumbing-roughin',      'flat', 190000),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-electrical-roughin',    'flat', 70000),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-cement-board',          'sqft', 600),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-subfloor-leveling',     'sqft', 250),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-floor-tile-install',    'sqft', 850),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-wall-tile-install',     'sqft', 950),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-vanity-set',            'flat', 45000),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-double-vanity-extra',   'flat', 32500),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-toilet-set',            'flat', 27500),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-shower-trim',           'flat', 32500),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-tub-set',               'flat', 42500),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-mirror-accessories',    'flat', 20000),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-paint',                 'sqft', 350),
  ('3e0821aa-89e7-4140-bff8-c4f7f985f561', 'bathroom', 'bathroom-permit-haul-setup',     'flat', 100000),
  -- v-3 Paradise (BUDGET tier, -8%)
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-demo',                  'flat', 119500),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-plumbing-roughin',      'flat', 175000),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-electrical-roughin',    'flat', 64500),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-cement-board',          'sqft', 550),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-subfloor-leveling',     'sqft', 230),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-floor-tile-install',    'sqft', 780),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-wall-tile-install',     'sqft', 875),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-vanity-set',            'flat', 41500),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-double-vanity-extra',   'flat', 30000),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-toilet-set',            'flat', 25500),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-shower-trim',           'flat', 30000),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-tub-set',               'flat', 39000),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-mirror-accessories',    'flat', 18500),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-paint',                 'sqft', 320),
  ('2361dc61-036c-4097-b5f0-5d69324214d5', 'bathroom', 'bathroom-permit-haul-setup',     'flat', 92000)
ON CONFLICT (vendor_id, service_category, line_id) DO UPDATE
  SET unit = EXCLUDED.unit, rate_cents = EXCLUDED.rate_cents, active = true, updated_at = now();

COMMIT;
