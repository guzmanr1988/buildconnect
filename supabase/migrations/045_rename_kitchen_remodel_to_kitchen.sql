-- BuildConnect 2026 — paired DB sweep for Kitchen service display-name.
--
-- Per Rod direct 2026-05-13: the Kitchen service (formerly 'Kitchen Remodel')
-- is being narrowed pre-launch to just 'Kitchen', matching the prior
-- Garage→Remodel rename (migration 043). PR #236 renames the constants.ts
-- entry name field 'Kitchen Remodel' → 'Kitchen'; this file is the paired
-- Supabase UPDATE so catalog-store.ts unionBundledFillingGaps (server-wins
-- on services.name) does not mask the rename on the live row.
--
-- Sibling-class to migration 043 (Garage→Remodel) and to feedback memory
-- feedback_catalog_supabase_union_bundle_masks_bundle_ship — widened from
-- "optionGroups/options removal" to "ANY constants.ts string with a paired
-- services-table mirror, including name/description/badge fields".
--
-- This migration is the RETROACTIVE audit-trail file for the UPDATE that
-- hermes will apply via PAT during the cascade. Idempotent on env-replay:
-- re-running on an already-renamed row is a no-op UPDATE.
--
-- Bathroom service (id='bathroom', name='Bathroom Remodel') intentionally
-- preserved — Rod directive scope was Kitchen only.

update services
set name = 'Kitchen'
where id = 'kitchen' and name = 'Kitchen Remodel';
