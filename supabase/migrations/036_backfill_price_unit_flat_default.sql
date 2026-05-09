-- Backfill NULL price_unit to 'flat' on options + sub_options.
--
-- Background: migration 031 added the additive price_unit column with
-- NULL default. PR #145 followed up with explicit values for the ~27
-- option_ids the static OPTION_METADATA map already covered (roofing
-- materials -> 'square', gutters/soffit/fascia -> 'linear_ft',
-- insulation + repair_* -> 'sqft', pool floor surfaces -> 'sqft', etc).
--
-- Audit 2026-05-08 against src/lib/option-metadata.ts confirms the
-- residual 121 NULL options + 105 NULL sub_options are config-only
-- selectors (yes/no toggles, color/style picks, AC stages, plumbing
-- choices, etc) that have NEVER carried a per-unit pricing intent in
-- the static map. Their on-screen pricing has always rendered as a
-- single dollar amount via pricing.ts's undefined-priceUnit-treated-
-- as-flat code path.
--
-- This migration replaces that implicit default with an explicit
-- 'flat' value at write time. Three reasons:
--
-- 1. Self-describing schema. Rodolfo's "wire everything absolutely"
--    directive favors DB rows that name their own pricing unit over
--    rows that depend on a downstream consumer to pick a default.
-- 2. Zero FE regression. pricing.ts already treats undefined and
--    'flat' identically; switching NULLs to 'flat' is behavior-
--    invariant for every option_id touched here.
-- 3. Removes admin-override ambiguity. Once the catalog edit dialog
--    surfaces price_unit, NULL becomes "I don't know" while 'flat'
--    becomes "the admin knows it's flat". The audit ruled them all
--    flat, so committing that intent forward beats leaving it
--    implicit.
--
-- Sibling of feedback_immutable_ledger_freeze_at_write: explicit-at-
-- write beats implicit-at-read when downstream consumers derive from
-- the column.
--
-- Expected row counts (pre-apply, verified 2026-05-08 against
-- llybxugitrbgybplgpsi):
--   options:     121 NULL -> 0 NULL (+ 27 already set, untouched)
--   sub_options: 105 NULL -> 0 NULL (+ 0 already set)
--
-- Idempotent: WHERE price_unit IS NULL guards re-runs.

UPDATE options
  SET price_unit = 'flat'
  WHERE price_unit IS NULL;

UPDATE sub_options
  SET price_unit = 'flat'
  WHERE price_unit IS NULL;
