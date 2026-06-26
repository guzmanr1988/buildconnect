-- 109_handle_new_user_tighten_block_admin_signup.sql
-- Privilege-escalation trigger guard — block admin/admin_employee role mint via supabase.auth.signUp.
--
-- LIVE-CAPTURE: this migration is SOURCE-OF-TRUTH CAPTURE — the function
-- body was applied to llybxug prod via inline Mgmt-API SQL on 2026-06-25
-- and the canonical .sql file was filed on an unmerged audit-trail branch
-- with a colliding file number (audit-mig-100 collided with the canonical
-- 100_concierge_rep_role). Body re-scraped from live via
-- pg_get_functiondef('public.handle_new_user()'::regprocedure) on
-- 2026-06-26 and reconstructed here so that re-applying this file to a
-- clean DB produces byte-identical catalog state to llybxug now.
--
-- Renumbered to 109 (filling the gap above 108_concierge_rep_requests_calendar)
-- to avoid the file-number collision; companion 109b_admin_employee_full_parity
-- carries the RLS expansion that shipped paired with this trigger.
--
-- ───────────────────────────────────────────────────────────────────
-- LIVE-SHA RAIL (decisive):
--   sha256 of pg_get_functiondef output on llybxugitrbgybplgpsi 2026-06-26:
--     10b2f85bec3ae0b06384d356700c4997480dc61798a867937062fe1722b64bfe
--   The audit-branch body carried an earlier SHA (1b51dc18...) — that SHA
--   represented a pretty-print-normalized form (whitespace formatting). The
--   semantic SQL is equivalent; the canonical bytes are the live form, so
--   this file uses the live pg_get_functiondef output verbatim.
--
-- ───────────────────────────────────────────────────────────────────
-- Hole closed (PRE-LAUNCH CRITICAL):
--   Pre-mig, public.handle_new_user blindly trusted
--   `new.raw_user_meta_data->>'role'::user_role` and minted the requested
--   role on the public.profiles row created from auth.users INSERT. Any
--   client holding the public anon key could call
--     supabase.auth.signUp({ email, password, options: { data: { role: 'admin' } } })
--   to mint an admin profile under their own auth.users row, with no
--   operator gate.
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
-- Companion mig: 109b_admin_employee_full_parity (RLS-level admin_employee
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

-- ROLLBACK (reversible to pre-mig body — admin signup re-opens, DO NOT USE in prod):
--   See git history of public.handle_new_user pre-2026-06-25 for the pre-mig
--   body. Rolling back this mig re-opens the privesc hole; rollback is a
--   privileged operation and should be paired with auth.users + profiles
--   cleanup if any admin/admin_employee profiles were minted via signUp
--   between rollback and re-apply.
