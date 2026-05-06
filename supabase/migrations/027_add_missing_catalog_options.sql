-- PR #111 added pool_fence + square_concrete to SERVICE_CATALOG (the bundled
-- fallback consumed by useCatalogStore). The server-side options table is the
-- system of record once a user is authenticated, so the bundled additions
-- never surfaced for users whose catalog had already hydrated from the
-- pre-#111 server snapshot.
--
-- This migration backfills the three missing option rows so the server-side
-- catalog matches the bundled SERVICE_CATALOG. Paired with PR #114
-- catalog-store hydration fix (option-level union-fill-gaps), so future
-- bundled-addition gaps surface client-side even before the SQL lands.
--
-- option_groups.service_id holds the service slug directly (it is not a FK to
-- services.id), so the INSERTs query option_groups by (service_id, group_id)
-- without joining services. All INSERTs are guarded by NOT EXISTS so the
-- migration is idempotent across environments where hermes already filed the
-- rows live. UPDATEs at the bottom normalize pool_floor sort_order.

INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'pool_fence', 'Pool Fence', 6
FROM option_groups
WHERE service_id = 'pool'
  AND group_id = 'addons'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'pool_fence'
  );

INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'square_concrete', 'Square Concrete', 4
FROM option_groups
WHERE service_id = 'pool'
  AND group_id = 'pool_floor'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'square_concrete'
  );

INSERT INTO options (option_group_id, option_id, label, sort_order)
SELECT id, 'square_concrete', 'Square Concrete', 4
FROM option_groups
WHERE service_id = 'driveways'
  AND group_id = 'surface'
  AND NOT EXISTS (
    SELECT 1 FROM options o
    WHERE o.option_group_id = option_groups.id AND o.option_id = 'square_concrete'
  );

-- Normalize pool_floor sort_order so square_concrete slots in cleanly:
--   square_concrete = 4, artificial_turf = 5, existing = 6.
UPDATE options
SET sort_order = 4
WHERE option_id = 'square_concrete'
  AND option_group_id IN (
    SELECT id FROM option_groups WHERE service_id = 'pool' AND group_id = 'pool_floor'
  );

UPDATE options
SET sort_order = 5
WHERE option_id = 'artificial_turf'
  AND option_group_id IN (
    SELECT id FROM option_groups WHERE service_id = 'pool' AND group_id = 'pool_floor'
  );

UPDATE options
SET sort_order = 6
WHERE option_id = 'existing'
  AND option_group_id IN (
    SELECT id FROM option_groups WHERE service_id = 'pool' AND group_id = 'pool_floor'
  );
