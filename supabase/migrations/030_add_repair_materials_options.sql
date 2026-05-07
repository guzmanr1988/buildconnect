-- Per-material repair pricing rates (option iii per Rodolfo verdict 2026-05-07).
-- Adds the 'repair_materials' option_group + 6 repair_<material> options under
-- service_id='roofing' so vendors can price each material's repair rate
-- independently in $/sqft. Mirrors the addons subgroup pattern.
--
-- Rate is billed at booking against the homeowner's measured roof area:
--   repair_flat_roof  → roofMeasurement.flatAreaSqft
--   repair_metal      → metalRoofSelection.roofSize×100 fallback areaSqft
--   repair_aluminum   → metalRoofSelection.roofSize×100 fallback areaSqft
--   repair_shingle    → roofMeasurement.pitchedAreaSqft fallback areaSqft
--   repair_barrel_tile → same as shingle
--   repair_terracotta → same as shingle
--
-- All INSERTs are guarded by NOT EXISTS so the migration is idempotent.

INSERT INTO option_groups (service_id, group_id, label, required, type, sort_order)
SELECT 'roofing', 'repair_materials', 'Repair Materials', false, 'multi', 4
WHERE NOT EXISTS (
  SELECT 1 FROM option_groups
  WHERE service_id = 'roofing' AND group_id = 'repair_materials'
);

INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'repair_shingle', 'Shingle', 1
FROM option_groups
WHERE service_id = 'roofing'
  AND group_id = 'repair_materials'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'repair_shingle'
  );

INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'repair_barrel_tile', 'Barrel Tile', 2
FROM option_groups
WHERE service_id = 'roofing'
  AND group_id = 'repair_materials'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'repair_barrel_tile'
  );

INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'repair_metal', 'Standing Seam Metal', 3
FROM option_groups
WHERE service_id = 'roofing'
  AND group_id = 'repair_materials'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'repair_metal'
  );

INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'repair_aluminum', 'Aluminum', 4
FROM option_groups
WHERE service_id = 'roofing'
  AND group_id = 'repair_materials'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'repair_aluminum'
  );

INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'repair_terracotta', 'Terracotta Clay', 5
FROM option_groups
WHERE service_id = 'roofing'
  AND group_id = 'repair_materials'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'repair_terracotta'
  );

INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'repair_flat_roof', 'Flat Roof', 6
FROM option_groups
WHERE service_id = 'roofing'
  AND group_id = 'repair_materials'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'repair_flat_roof'
  );
