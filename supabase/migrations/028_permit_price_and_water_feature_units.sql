-- PR #117 — per-product permit-price + water-feature-units priceable products.
--
-- Two paired schema changes:
--
-- 1. ALTER TABLE vendor_option_prices ADD permit_price_cents.
--    Each (vendor, option) row gains a sibling permit-price field. Vendor
--    pricing form gets a "Permit Price" input next to the existing base
--    price. sendProject() snapshots the sum of per-product permit prices
--    instead of the per-category PRICE_LINE_ITEM_PRESETS permit-line.
--
-- 2. New option_group `pool / water_feature_units` with two options
--    `laminar_jet` + `waterfall_unit`. Surfaces in vendor catalog under the
--    Water Feature option so vendors can price laminar/waterfall as per-
--    unit products. The homeowner pool wizard renders specific groups by
--    id (pool_size, pool_floor, addons, ...) and does NOT iterate this
--    new group, so it stays vendor-only without a revealsOn gate.
--
-- All inserts/alters are idempotent (NOT EXISTS / IF NOT EXISTS) so this
-- migration is safe to re-run across environments where hermes already
-- filed the rows live.

-- (1) Per-product permit price
ALTER TABLE vendor_option_prices
  ADD COLUMN IF NOT EXISTS permit_price_cents integer NOT NULL DEFAULT 0;

-- (2a) New option_group: pool / water_feature_units
INSERT INTO option_groups (service_id, group_id, label, required, type, sort_order)
SELECT 'pool', 'water_feature_units', 'Water Feature Units', false, 'multi', 10
WHERE NOT EXISTS (
  SELECT 1 FROM option_groups
  WHERE service_id = 'pool' AND group_id = 'water_feature_units'
);

-- (2b) Options: laminar_jet, waterfall_unit
INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'laminar_jet', 'Laminar Jet', 1
FROM option_groups
WHERE service_id = 'pool'
  AND group_id = 'water_feature_units'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'laminar_jet'
  );

INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'waterfall_unit', 'Waterfall', 2
FROM option_groups
WHERE service_id = 'pool'
  AND group_id = 'water_feature_units'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'waterfall_unit'
  );
