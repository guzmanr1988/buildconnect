-- 107_admin_employee_profiles_select_parity.sql
-- Grants admin_employee SELECT parity on public.profiles, mirroring the
-- admin policy. Surfaced 2026-06-25 during helios's both-role admin-manage
-- walk: admin completed 10/10 GREEN, admin_employee completed 9/10 with
-- ONE divergence — the assign-rep picker (useReps SELECT on profiles
-- WHERE role='rep') returned 0 rows for admin_employee but worked for
-- admin. Root cause: the "Admins can view all profiles" SELECT policy
-- pinned qual to `auth_role() = 'admin'::user_role` (single role, no IN
-- array), so admin_employee was filtered to self-row + homeowner-can-see-
-- vendor only — Test Rep was invisible under admin_employee JWT.
--
-- Idempotent — drops and recreates the policy. ALTER POLICY's USING clause
-- replacement is the canonical Postgres path for this; we re-create instead
-- of mutate so the migration is fully declarative.
--
-- Scope: NARROW per kratos discipline (msg 1782372904190) — this migration
-- fixes ONLY the SELECT-on-profiles gap helios surfaced. A fleet-wide scan
-- found ~27 other admin-only policies across the schema that ALSO lack
-- admin_employee parity (app_settings, audit_log, bugs, closed_sales, etc.)
-- — those are tracked separately and out of scope here. This migration
-- closes the assign-rep walker divergence and only that.

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth_role() IN ('admin'::user_role, 'admin_employee'::user_role));
