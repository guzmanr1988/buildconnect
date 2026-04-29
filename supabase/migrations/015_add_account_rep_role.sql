-- Ship #333 Phase A — add account_rep role + parent-vendor FK on profiles.
--
-- Per Rodolfo directive 2026-04-28 "Create vendor login for account reps
-- with only limited info ... dashboard is only going to show the sales
-- rep numbers ... only numbers dedicated to this rep only ... exclude
-- products only from calendar up and create also in vendor menu to
-- create access for logins on reps."
--
-- Phase A extends auth schema:
--   1. Adds 'account_rep' to user_role enum (per 001_create_profiles.sql
--      schema: profiles.role is user_role ENUM type with values
--      homeowner / vendor / admin)
--   2. Adds account_rep_for_vendor_id FK on profiles → references the
--      parent vendor profile so rep-scoped dashboards can resolve their
--      vendor parent for chain access (per banked CHAIN IS GOD: rep
--      filtering happens at consumer-render-layer, NOT chain-layer)
--
-- Ship #344 schema-correction — original 015 attempted text+check-
-- constraint extension which doesn't apply to enum columns. profiles.role
-- is enum user_role per 001_create_profiles.sql:4 → use ALTER TYPE ADD
-- VALUE IF NOT EXISTS for the enum extension. Studio-apply error 22P02
-- "invalid input value for enum user_role: account_rep" surfaced the
-- schema-cite-divergence between original 015's assumption and runtime
-- reality. Sibling-cite of feedback_silent_undefined_field_mismatch at
-- schema-vs-migration-assumption layer.
--
-- Idempotent (IF NOT EXISTS guards on enum value + column + index).
-- Reversible considerations:
--   - Postgres has no DROP VALUE for enums; extension is one-way at the
--     enum-type level. Feature-flag at consumer-layer (UserRole TS union
--     + Phase A gate-patches) covers rollback semantics: revert TS code
--     to remove account_rep from union → no profile rows can carry the
--     role → enum value is dormant. Safe.
--   - account_rep_for_vendor_id column + idx are reversible via DROP COLUMN.
--
-- Postgres 12+ allows ALTER TYPE ADD VALUE outside transactions (Supabase
-- runs 14+). The IF NOT EXISTS clause makes re-application safe. If the
-- Studio-apply runs everything in one implicit transaction, ADD VALUE
-- still works in PG 14+ but the new value cannot be used until the
-- transaction commits — that's why we don't reference 'account_rep' as
-- a value within this same migration (no INSERT statements use it).

-- 1) Add 'account_rep' to user_role enum
alter type user_role add value if not exists 'account_rep';

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
