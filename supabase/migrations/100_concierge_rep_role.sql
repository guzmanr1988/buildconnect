-- 100_concierge_rep_role.sql
-- BuildConnect Concierge "Request a BuildConnect Rep" — assisted-build path.
-- Rod GREENLIT 2026-06-25 (kratos msg 1782349857598).
--
-- This migration adds the 'rep' role to the user_role enum and the support
-- fields on profiles for rep-by-org / rep-active-status lookups. RLS for
-- rep-scoped reads on the rep_requests table lives in migration 101.
--
-- Pattern mirrors migration 015_add_account_rep_role.sql (Ship #333 Phase A):
-- ALTER TYPE ADD VALUE IF NOT EXISTS is idempotent and Postgres 14-safe.
--
-- Reversibility: Postgres has no DROP VALUE for enums; the enum extension is
-- one-way at the type level. Feature-flag at the consumer layer (UserRole TS
-- union + Concierge feature gate) covers rollback semantics: revert TS to
-- remove 'rep' from the union → no profile rows can carry the role → enum
-- value is dormant. Safe.

BEGIN;

-- 1) Add 'rep' to user_role enum. Idempotent.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'rep';

COMMIT;
