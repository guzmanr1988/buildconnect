-- Ship #333 Phase A — add account_rep role + parent-vendor FK on profiles.
--
-- Per Rodolfo directive 2026-04-28 "Create vendor login for account reps
-- with only limited info ... dashboard is only going to show the sales
-- rep numbers ... only numbers dedicated to this rep only ... exclude
-- products only from calendar up and create also in vendor menu to
-- create access for logins on reps."
--
-- Phase A extends auth schema:
--   1. Widens user_role check-constraint to include 'account_rep'
--   2. Adds account_rep_for_vendor_id FK on profiles → references the
--      parent vendor profile so rep-scoped dashboards can resolve their
--      vendor parent for chain access (per banked CHAIN IS GOD: rep
--      filtering happens at consumer-render-layer, NOT chain-layer)
--
-- Idempotent (DO blocks + IF NOT EXISTS guards). Reversible via
-- DROP COLUMN + REVOKE constraint if needed.
--
-- profiles.role is currently a text column with a check-constraint
-- enumeration (not a Postgres enum type) per existing schema in
-- 001_create_profiles.sql. Widening the check-constraint is the safe
-- in-place extension; if profiles.role were a true ENUM type the
-- ALTER TYPE ADD VALUE 'account_rep' shape would apply instead.

-- 1) Widen role check-constraint to include 'account_rep'
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_role_check'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('homeowner', 'vendor', 'admin', 'account_rep'));

-- 2) Add parent-vendor FK column (nullable; only set on account_rep
--    profiles). Self-referencing FK so the rep's profile points at the
--    vendor profile they belong to. ON DELETE SET NULL so vendor
--    deletion doesn't orphan the rep auth record (admin can re-link or
--    archive the rep separately).
alter table public.profiles
  add column if not exists account_rep_for_vendor_id uuid null
    references public.profiles(id) on delete set null;

-- 3) Index for rep-by-vendor lookup (Phase B will query this on
--    rep-dashboard mount + vendor-admin Phase C will query for
--    "list reps under this vendor"). Partial index only on rows
--    where the FK is set (skip vendor / homeowner / admin rows).
create index if not exists idx_profiles_account_rep_for_vendor_id
  on public.profiles (account_rep_for_vendor_id)
  where account_rep_for_vendor_id is not null;
