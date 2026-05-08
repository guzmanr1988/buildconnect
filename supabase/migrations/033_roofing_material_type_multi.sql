-- Migration 033 — flip roofing.material option_group type from 'single' to 'multi'.
--
-- Background: Ship #255 made roofing material a multi-select per Rodolfo
-- directive — many South Florida homes have a primary sloped material with
-- a secondary flat-roof section (shingle + flat, tile + flat, metal + flat),
-- and the cart shape (pack_items.material is string[]) already supports
-- multiple values. The bundled SERVICE_CATALOG entry was updated to
-- type:'multi' in code at that time.
--
-- The server-side option_groups row for (service_id='roofing',
-- group_id='material') was never carried into a migration and remained
-- type='single' (pre-#255 shape). catalog-store unionOptionGroups merges
-- bundled + server with server-wins on scalar fields, so the bundled
-- type:'multi' was clobbered by the server's type:'single' on every
-- catalog hydrate. Result: roofing chip-tap material section behaved
-- single-select for every authed user, surfaced by Apollo's prod-walk on
-- PR #162.
--
-- This is the n=5 anchor in the bundle-edit-needs-server-data-update
-- class (data-source-update-not-applied subvariant — siblings: PR #119,
-- #140, #153 AC-permit, #154 house_painting revealsOn). The code-side
-- fix to flip union-spread order to bundled-second is helios's territory
-- and tracked separately; this migration is the data-side fix.
--
-- Already-applied: the same UPDATE was applied to prod via the Supabase
-- Management API PAT path before this migration was filed. This
-- migration captures the change for audit-trail + non-prod replay +
-- defense against re-files.
--
-- Idempotent: WHERE clause filters on type='single' so re-running on an
-- already-fixed environment is a 0-row UPDATE (no-op).

UPDATE option_groups
SET type = 'multi'
WHERE service_id = 'roofing'
  AND group_id = 'material'
  AND type = 'single';
