-- 097_vendor_sub_option_prices_percent_bp.sql
-- Phase A-Completion (twin of 096) — additive nullable percent column on
-- vendor_sub_option_prices.
--
-- task_1782223541287_122 (helios). Phase A's mig 096 added price_percent_bp
-- to vendor_option_prices, but the 4 markup-eligible items
-- (casement / windows_low_e / doors_low_e / storm_front_low_e) are sub_options
-- and their prices live in vendor_sub_option_prices via the sub_options table
-- (hephaestus why-check msg 1782230264718 with REST-probed UUIDs + sub_group_id
-- parentage; cross-table 0-row probe on options side confirmed the disambiguation;
-- bare low_e classified intentionally-off-table per constants.ts L122/141/169
-- offline-bundled SERVICE_CATALOG fallback, no action). Without this twin column,
-- setPricePercent's mirror branch (about to land in vendor-catalog-store.ts)
-- cannot persist a markup on the real items.
--
-- Same shape + discipline as 096: additive nullable, no default, no backfill,
-- CHECK >= 0 OR NULL, idempotent IF NOT EXISTS, atomic BEGIN/COMMIT.
-- Pre-existing rows keep price_percent_bp = NULL → computeVendorTotal unchanged
-- (Phase B math-wiring still HELD on Rod-spec markup-rule).
--
-- Apollo's deferred-not-waived axis-4 closure becomes reachable post-ship
-- (BLOCKED-STRUCTURAL → PASS) since the walker enable-target can now hit a
-- real sub_option card (casement, UUID 5c88e183-01d0-4a1b-96e7-5cce500eb463)
-- with a persisting write path. Datapoint #3 localstorage_wipe_reload_db_hydration
-- also promotes from pending=true sentinel → measured-real per athena schema.
--
-- Rollback: ALTER TABLE vendor_sub_option_prices DROP COLUMN price_percent_bp;
-- (safe because no code depends on the column until Phase B ships).

BEGIN;

ALTER TABLE vendor_sub_option_prices
  ADD COLUMN IF NOT EXISTS price_percent_bp integer
    CHECK (price_percent_bp IS NULL OR price_percent_bp >= 0);

COMMENT ON COLUMN vendor_sub_option_prices.price_percent_bp IS
  'Vendor markup percent in basis points (5000 = 50.00%). NULL = no markup. '
  'Phase A-Completion (twin of vendor_option_prices.price_percent_bp). '
  'Phase B (Rod-spec gated) consumes via computeVendorTotal.';

COMMIT;
