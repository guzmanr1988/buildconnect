-- 100_admin_employee_profiles_select.sql
-- task_1781121913819_140 (atlas) — pin-21b: admin_employee profiles
-- SELECT additive RLS. kratos shape APPROVED msg 1782359527288.
--
-- apollo R3 (2026-06-10) found admin_employee /admin/support shows
-- 'Unknown homeowner' instead of the real name. RCA: mig 010 grants
-- profiles SELECT to (own / admin-all / homeowner→vendor) but has NO
-- admin_employee→homeowner SELECT policy. The support-thread homeowner
-- join in /admin/support resolves only when admin_employee can SELECT the
-- homeowner profile row. mig 089 already grants admin_employee SELECT +
-- UPDATE on support_threads/support_messages — this migration completes
-- the RLS chain for the homeowner-name join.
--
-- Additive only: drops nothing, narrows nothing, OR-unions onto existing
-- profiles SELECT permissions. role-narrow (homeowner only) keeps
-- admin_employee from reading vendor/admin/account_rep profiles — the
-- admin_employee role is scoped to homeowner-support work (mig 089 widen-
-- scope context).
--
-- Migration-gate per kratos: SQL commits here; APPROVAL-GATE before
-- Mgmt API apply on apex llybxugitrbgybplgpsi.
--
-- Rollback (additive, low-risk):
--   DROP POLICY "Admin employees view homeowner profiles" ON profiles;

BEGIN;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin employees view homeowner profiles" ON profiles;
END $$;

CREATE POLICY "Admin employees view homeowner profiles"
  ON profiles FOR SELECT
  USING (
    auth_role() = 'admin_employee'
    AND role = 'homeowner'
  );

COMMIT;
