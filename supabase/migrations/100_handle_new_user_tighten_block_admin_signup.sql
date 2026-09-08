-- 100_handle_new_user_tighten_block_admin_signup.sql
-- Privilege-escalation trigger guard — block admin/admin_employee role mint via supabase.auth.signUp.
--
-- task_1782413613064_158 (hephaestus, mig 109b). Rod GO via kratos msg 1782414610379
-- (dev rehearsal) and msg 1782416131736 (prod apply). Applied to prod
-- llybxugitrbgybplgpsi via Supabase Mgmt API SQL POST at apply_ts
-- 2026-06-25T19:36:14Z (HTTP 201). Body re-fetched post-apply via
-- pg_get_functiondef and re-verified at SHA 1b51dc1867662084b48424951709f0cc68d39895df9cd94780be13c56a6d9d72.
--
-- ───────────────────────────────────────────────────────────────────
-- Hole closed (PRE-LAUNCH CRITICAL):
--   Pre-mig, public.handle_new_user blindly trusted
--   `new.raw_user_meta_data->>'role'::user_role` and minted the requested
--   role on the public.profiles row created from auth.users INSERT. Any
--   client holding the public anon key could call
--     supabase.auth.signUp({ email, password, options: { data: { role: 'admin' } } })
--   to mint an admin profile under their own auth.users row, with no
--   operator gate. Paired-rail probe (file: handle_new_user body had no
--   role check; serving: signUp with role=admin / role=admin_employee
--   landed both rows in prod auth.users + profiles in dev rehearsal).
--
-- Architectural rule (sister to admin-reset-password pattern):
--   Privileged role creation is server-side only — via an admin edge-fn
--   that uses service_role + its own profiles.role='admin' gate.
--   Client-facing signUp is for self-service homeowner / vendor only.
--   account_rep self-signup ALLOWED (Rod onboards account_reps via
--   separate vendor-invite path; left intact intentionally).
--
-- ───────────────────────────────────────────────────────────────────
-- Effect after apply:
--   homeowner / vendor self-signup     → ALLOWED (unchanged)
--   account_rep mint via signUp        → ALLOWED (unchanged)
--   admin or admin_employee via signUp → BLOCKED with sqlstate 42501
--                                        (auth.users INSERT rolls back)
--
-- Two-step server-side path (for legit admin / admin_employee creation):
--   1. service-role admin.createUser({ email, password, email_confirm: true })
--      WITHOUT role in user_metadata → trigger creates a homeowner profile.
--   2. service-role UPDATE public.profiles SET role = 'admin_employee'
--      WHERE id = <new.id>.
--   This path bypasses the IF guard because service-role + no requested
--   role → falls through to homeowner default → UPDATE re-assigns. The
--   guard catches anon/authenticated-JWT attempts only.
--
-- ───────────────────────────────────────────────────────────────────
-- Verified post-apply (prod):
--   Live-fire probe against buildc.net auth/v1/signup with anon key
--   + body { email, password, data: { role: 'admin' } }:
--     HTTP 500 + 0 rows landed in auth.users + 0 rows in public.profiles.
--   Same for role: 'admin_employee'.
--   The live escalation hole is closed.
--
-- ───────────────────────────────────────────────────────────────────
-- Idempotency: CREATE OR REPLACE FUNCTION is idempotent — re-applying
-- against already-applied state replaces the body identically.
-- Companion mig: 101_admin_employee_full_parity (RLS-level admin_employee
-- expansion). Both shipped together as the privesc + parity bundle.
-- ───────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested_role user_role;
BEGIN
  requested_role := coalesce(
    (new.raw_user_meta_data->>'role')::user_role,
    'homeowner'::user_role
  );

  -- Privileged roles cannot be self-minted via the signUp client path under any
  -- JWT (anonymous or authenticated). They must be created server-side via an
  -- admin edge-fn that uses service-role + its own profiles.role='admin' gate.
  IF requested_role IN ('admin'::user_role, 'admin_employee'::user_role) THEN
    RAISE EXCEPTION
      'privilege escalation blocked: role % cannot be requested via signUp; use admin server-side path',
      requested_role
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  INSERT INTO public.profiles (id, email, name, role, initials, phone, address, company)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    requested_role,
    generate_initials(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'address', ''),
    nullif(trim(new.raw_user_meta_data->>'company'), '')
  );

  RETURN new;
END;
$function$;

COMMIT;
