-- 052_feature_flags_admin_insert_and_category_seed.sql
-- Unblock PR #259 admin-financing FE scaffold.
--
-- Two paired fixes for the same root cause (feature_flags row insert path):
--
-- (1) feature_flags RLS in 048 only declares `ff_write_admin FOR UPDATE`.
--     The FE admin surface uses supabase-js .upsert({key,enabled},
--     {onConflict:'key'}) for both master + per-category toggles.
--     Postgres semantics: `INSERT ... ON CONFLICT DO UPDATE` requires the
--     INSERT WITH CHECK policy to pass even when the UPDATE path ends up
--     taken (the planner needs INSERT permission for the row-level lock).
--     With no INSERT policy present, every category-flag UPSERT 403s with
--     42501 from an admin-JWT client. Adds an INSERT-only policy mirroring
--     the same admin profile gate as ff_write_admin.
--
-- (2) financing_enabled (master) was seeded in 048. The 3 per-category
--     flags referenced by financing.tsx:134-138 (CATEGORY_KEYS) are NOT
--     seeded — first toggle for any category hits UPSERT-INSERT-reject
--     even AFTER fix (1) lands, because the row does not exist yet AND
--     the FE default-ON semantic (`flags[key] !== false`) means a missing
--     row reads as ON without ever writing the row. Pre-seeding all 3
--     enabled=true makes master the only initial gate (matches Phase 1
--     scope: 15 contractor_pos / 11 personal_loans / 5 solar_hi_specialty
--     lenders all surface by default).
--
-- Idempotent on both halves: policy uses CREATE POLICY IF NOT EXISTS via
-- DROP+CREATE pattern (matches 048 convention); seed uses ON CONFLICT DO
-- NOTHING on key PK.

-- (1) INSERT policy for admin on feature_flags
drop policy if exists ff_insert_admin on public.feature_flags;
create policy ff_insert_admin on public.feature_flags
  for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- (2) Seed 3 financing_category_<slug> rows enabled=true
insert into public.feature_flags (key, enabled, description) values
  ('financing_category_contractor_pos',     true, 'Category gate for Contractor POS lenders (15 partners). OFF hides this bucket from homeowner financing applications.'),
  ('financing_category_personal_loans',     true, 'Category gate for Personal Loans lenders (11 partners). OFF hides this bucket from homeowner financing applications.'),
  ('financing_category_solar_hi_specialty', true, 'Category gate for Solar & HI Specialty lenders (5 partners). OFF hides this bucket from homeowner financing applications.')
on conflict (key) do nothing;
