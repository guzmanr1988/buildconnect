-- PR #145 unblock — additive `price_unit` column on options + sub_options.
--
-- Rodolfo directive 2026-05-08T04:55Z: admin product edit dialog needs a
-- Pricing Unit Select so vendors can mark an option as 'flat' / 'square' /
-- 'sqft' / 'linear_ft'. To make admin edits drive pricing.ts +
-- booking-confirmation, the priceUnit must live on the catalog row instead
-- of the static OPTION_METADATA map.
--
-- Two paired schema changes (additive, NULL default = widen-reads-narrow-
-- writes safe; existing rows unaffected):
--
-- 1. ALTER TABLE options ADD COLUMN price_unit text NULL.
-- 2. ALTER TABLE sub_options ADD COLUMN price_unit text NULL.
--
-- No CHECK constraint on values; FE constrains to 'flat' | 'square' |
-- 'sqft' | 'linear_ft' for now (server-side enum can be tightened later).
--
-- After columns exist on prod, helios runs a Path C UPDATE backfill from
-- current OPTION_METADATA values (metal/shingle/etc → square,
-- gutters/soffit/fascia → linear_ft, insulation/repair_* → sqft, pool
-- floor surfaces → sqft) so first ship is zero behavior change.
--
-- Idempotent (IF NOT EXISTS) so re-running across environments is safe.

ALTER TABLE options
  ADD COLUMN IF NOT EXISTS price_unit text NULL;

ALTER TABLE sub_options
  ADD COLUMN IF NOT EXISTS price_unit text NULL;
