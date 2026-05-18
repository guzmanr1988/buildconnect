-- 056_pace_financing_category_and_lenders_seed.sql
-- DML companion to 055_lender_category_pace_enum.sql.
--
-- ROD-DIRECT 2026-05-18 00:50Z (via kratos msg 1779070524128) — add PACE as
-- 4th admin financing category with 4 named lenders. Rod's reversal of prior
-- PACE exclusion is scope-locked to these 4 only (Ygrene, Homerun Financial,
-- Renew Financial, Fortifi). Other PACE players (per project memory excluded
-- list) remain out.
--
-- Two paired seeds:
--
-- (1) feature_flags row 'financing_category_pace' enabled=true.
--     Mirrors 052 per-category seed pattern (master + 3 existing category
--     gates). Default-ON so admin surface immediately reflects PACE bucket
--     once master + category both ON. Idempotent on key PK.
--
-- (2) 4 lender rows in 'pace' category. Per kratos coord: all 4 use
--     manual-referral adapter path (no public REST API for any PACE player
--     in scope). Notes carry that fact + tax-assessment-repayment context.
--     sort_order 10-13 = category-scoped per 049 convention (each category
--     restarts at 10 for non-Rod-direct; Rod-direct uses global 0-4 tier;
--     PACE has zero Rod-direct so all 10+). Idempotent on lower(name) per
--     lenders_name_unique index.
--
-- Sequencing: 055 enum-widen MUST land first (separate transaction) so this
-- migration's INSERT statements can reference the new enum value 'pace'.

-- (1) Category feature flag seed
insert into public.feature_flags (key, enabled, description) values
  ('financing_category_pace', true, 'Category gate for PACE financing (Property Assessed Clean Energy — repaid via property tax assessment, not direct customer payment). 4 partners. OFF hides this bucket from homeowner financing applications.')
on conflict (key) do nothing;

-- (2) 4 PACE lender rows
insert into public.lenders (name, category, sort_order, notes) values
  ('Ygrene',            'pace', 10, 'PACE financing (Property Assessed Clean Energy). Tax-assessment-repayment. Manual-referral adapter (no public REST API).'),
  ('Homerun Financial', 'pace', 11, 'PACE financing. Tax-assessment-repayment. Manual-referral adapter.'),
  ('Renew Financial',   'pace', 12, 'PACE financing. Tax-assessment-repayment. Manual-referral adapter.'),
  ('Fortifi',           'pace', 13, 'PACE financing. Tax-assessment-repayment. Manual-referral adapter.')
on conflict do nothing;
