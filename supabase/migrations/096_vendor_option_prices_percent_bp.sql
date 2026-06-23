-- 096_vendor_option_prices_percent_bp.sql
-- Additive nullable percent column for vendor option markup.
--
-- task_1776660023548_547 (helios) Tranche-2 vendor-pricing — Phase A of a
-- two-phase ship. Phase A: persist a per-vendor-per-option percent value so
-- vendors can enter markup percents through the vendor catalog UI and have
-- them survive across sessions / devices via Supabase instead of zustand
-- localStorage only. Phase B (separate ship, Rod-spec gated): wire the
-- percent into computeVendorTotal math so totals actually reflect it.
--
-- Phase A is SAFE: additive nullable, no default, no backfill. Pre-existing
-- rows keep price_percent_bp = NULL → computeVendorTotal is unchanged (it
-- has zero percent references today; Phase B will add the read path).
-- Apollo structural sign-off: msg 1782221488807-apollo-559wy.
-- Hephaestus zero-overlap with banking-flowb migration 095: msg
-- 1782220929013-hephaestus-c2pv0. Kratos PHASE A GREENLIT: msg
-- 1782221241813-kratos-32eia + 1782221448248-kratos-58cyc.
--
-- Unit: basis points (5000 = 50.00%). Matches banking-flowb Stripe-cents
-- integer pattern → pure int math in computeVendorTotal Phase B
-- (base_cents * (10000 + bp) / 10000). Avoids numeric(5,2) float-rounding
-- drift across catalog-recompute hot paths. Column name carries the unit
-- explicit (_bp suffix) so no future reader has to chase docs.
--
-- Rollback: ALTER TABLE vendor_option_prices DROP COLUMN price_percent_bp;
-- (safe because no code depends on the column until Phase B ships).

BEGIN;

ALTER TABLE vendor_option_prices
  ADD COLUMN IF NOT EXISTS price_percent_bp integer
    CHECK (price_percent_bp IS NULL OR price_percent_bp >= 0);

COMMENT ON COLUMN vendor_option_prices.price_percent_bp IS
  'Vendor markup percent in basis points (5000 = 50.00%). NULL = no markup. '
  'Phase A: stored only. Phase B (gated on Rod-spec): consumed by '
  'computeVendorTotal as base_cents * (10000 + bp) / 10000.';

COMMIT;
