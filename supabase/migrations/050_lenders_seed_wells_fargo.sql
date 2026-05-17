-- 050_lenders_seed_wells_fargo.sql
-- Add Wells Fargo as 32nd lender (Rod-direct tier, personal_loans category).
-- Per kratos call: WF HI loan = consumer-direct unsecured (not contractor POS), NOT HELOC.
-- Rod can flip category via admin edit later.
-- Idempotent on lower(name) per unique index.

insert into public.lenders (name, category, sort_order, notes) values
  ('Wells Fargo', 'personal_loans', 5, 'Rod-direct. Wells Fargo HOME IMPROVEMENT loan product only — NOT HELOC (Rod scope-locked HELOC out 2026-05-16). Consumer-direct unsecured; category placement editable by admin.')
on conflict do nothing;
