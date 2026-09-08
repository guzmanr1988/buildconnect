-- 130_revoke_anon_execute_on_129_secdef_functions.sql
-- task_1788906096118_265 (hephaestus, kratos b3j3u ruling).
--
-- Explicitly REVOKE EXECUTE from anon on the two SECURITY DEFINER functions
-- 129 added: reap_expired_holds(uuid) and vendor_availability_slots(uuid, date, date).
--
-- Why this is needed even though 129 has `revoke all on function ... from public`
-- + `grant execute ... to authenticated`:
--
--   Supabase project defaults grant EXECUTE on any new public function to
--   anon, authenticated, and service_role as EXPLICIT ROLE GRANTS at CREATE
--   time. Those sit alongside the PUBLIC pseudo-role grant, not on top of it.
--   A `revoke all ... from public` clears the PUBLIC slot only; the three
--   explicit role grants remain. So the migration's stated intent (execute
--   for authenticated only) is not what the ACL actually holds after apply.
--
--   Post-129 census on BC prod (pg_proc.proacl) confirmed both functions
--   held `anon=X/postgres`. This migration closes that gap for exactly the
--   two 129 fns, with a three-valued pre-state block so replay against a
--   NEWER schema does not silently install a wrong invariant.
--
-- Severity read (kratos b3j3u):
--
--   reap_expired_holds is volatility=v + SECURITY DEFINER + anon EXECUTE, so
--   it is an UNAUTHENTICATED WRITE PATH under definer privileges — bypasses
--   RLS by construction. "Only already-expired homeowner_hold rows on the
--   named vendor_id" bounds damage per call, it does not make it
--   authenticated.
--
--   vendor_availability_slots is an ENUMERATION ORACLE: my own curl-green
--   during 129 apply proved it — anon POST with 00000000-0000-0000-0000-
--   000000000000 returned HTTP 400 body {"code":"P0001","message":
--   "vendor_availability_slots: vendor 00000000-... not found"}. A
--   distinguishable response for existing vs non-existing vendor uuid,
--   reachable without auth, is vendor enumeration. Minor on its own; the
--   grant fix closes it for free, and if the grant fix ever reverts the
--   oracle silently comes back — the coupling is worth naming.
--
-- Scope carved out — DO NOT INCLUDE:
--
--   auth_role() is also anon-EXECUTE on BC prod (3rd anon-executable
--   SECURITY DEFINER fn found in the census), but 45 policies across 18
--   distinct tables call auth_role() in their qual/with_check clauses
--   (regex-boundary match: `auth_role\(` — excludes postgres built-in
--   `auth.role()`). Revoking anon EXECUTE on auth_role() changes anon
--   behaviour on those 18 tables from filtered-result to hard error at
--   policy-evaluation time. So it MUST NOT be revoked until someone
--   establishes which anon flows on those tables are legitimate. That is a
--   scoping statement, not an impossibility — the 45 policies may be
--   protecting tables anon has no business reading at all, and the correct
--   fix in that case is on the table's policy set, not on the helper's
--   grant. This migration explicitly asserts auth_role() delta-equality
--   post-apply, so a shotgun revoke inside THIS migration does not silently
--   sneak in (but does not gate on the absolute value, so a legitimate
--   future revoke does not turn 130 into a replay landmine).
--
--   FUTURE AUTH_ROLE-AUDIT PR: auth_role's proacl carries an EXPLICIT
--   PUBLIC EXECUTE grant (leading `=X/postgres` in proacl, observed on BC
--   prod 2026-09-08 during 130 dry-run). anon is doubly-inherited — direct
--   anon= grant AND public= inheritance. A future PR that only does
--   `revoke execute from anon` would appear to succeed while anon keeps
--   executing via PUBLIC — a silent no-op wearing a green checkmark. That
--   PR must `revoke execute from public` AND `revoke execute from anon` to
--   actually close. Naming it here because this observation surfaced only
--   because 130 printed proacl rather than reasoning about it; the future
--   PR is unlikely to re-do that observation from scratch.
--
--   handle_new_user and other SECURITY DEFINER trigger fns are also OUT OF
--   SCOPE. Their EXECUTE grant is checked at CREATE TRIGGER time, not at
--   trigger-fire time (kratos b3j3u, high confidence — behavioural probe
--   filed as task_1788906517914_044 to verify).
--
-- ─── VERIFY PROTOCOL — PGRST202 IS ROLE-KEYED, DO NOT REUSE THE 129 READ ─
--
-- After apply, curl-green MUST hit both endpoints as BOTH roles, and the
-- accept-set is DIFFERENT per role on the SAME endpoint (kratos e17b1
-- warning — PostgREST builds its per-role schema view from what that role
-- can execute, so an anon call to a function anon-can-no-longer-execute
-- may return PGRST202 rather than a permission error; the same code that
-- meant "function missing from schema cache" during the 129 apply now
-- means "revoke worked" under anon):
--
--   ANON call to reap_expired_holds(uuid) / vendor_availability_slots(uuid,date,date):
--     CORRECTLY-REFUSED accept-set: { PGRST202, HTTP 401, HTTP 403, PostgreSQL 42501 permission denied for function }
--     FAILED-TO-REVOKE          set: { HTTP 200, P0001 body-guard fire }
--
--   AUTHENTICATED call to same endpoints:
--     STILL-WORKS accept-set: { P0001 "vendor % not found" body-guard fire, HTTP 200 with rows/[] }
--     REVOKE-OVERSHOT     set: { PGRST202, HTTP 401, HTTP 403, 42501 }
--
-- Anon-refusal is the load-bearing positive control on the revoke itself.
-- Authenticated-still-answers is the negative control on overshoot. Both
-- are needed — without the anon leg you have only shown you did not break
-- the authenticated path, not that you actually revoked anything.
--
-- ─── PREDICATE RAIL SWITCH — has_function_privilege() vs pg_proc.proacl ─
--
-- The census that scoped this PR read `pg_proc.proacl` (explicit role
-- grants). The assertions below use `has_function_privilege(role, sig,
-- 'EXECUTE')` which returns EFFECTIVE privilege — true if the role can
-- execute via ANY path, including a surviving PUBLIC grant inherited by
-- the role. For the security question ("can anon execute this") the
-- effective predicate is the right one and it is what we keep.
--
-- What this means at read-time: pre-state MAY print anon EXECUTE=true
-- while proacl shows no anon entry, if PUBLIC still holds EXECUTE and
-- anon inherits it. That is not a rail disagreement; it means 129's
-- `revoke all from public` was already outrun by the anon grant AND the
-- PUBLIC slot was somehow re-populated. In that case this migration's
-- `revoke execute from anon` will not achieve the goal (PUBLIC still
-- carries the grant), the post-state effective read stays true, and
-- post-state correctly FAILS. That is the right behaviour and it is
-- intentional — do not "fix" the check by dropping to proacl.
--
-- ─── CARVE-OUT ASSERTED AS A DELTA, NOT AN ABSOLUTE (kratos 1womc) ────
--
-- 130 does not touch auth_role(). Its state is not an input to the work
-- this migration performs. If a later PR legitimately revokes anon
-- EXECUTE on auth_role() after auditing the 18 tables — which is
-- exactly the scoping outcome the carve-out comment above anticipates —
-- an ABSOLUTE assertion here (raise-if-anon-denied) would abort forever
-- on every replay, every fresh-environment rebuild, every db push. That
-- is mode (2) from the Orion README worked example, inverted: instead of
-- a replay quietly installing wrong state, a replay loudly refuses to
-- install correct state. Same root cause — a migration reasoning about
-- a schema NEWER than the one it was written against.
--
-- Correct shape: assert that 130 did not CHANGE auth_role. Capture the
-- pre-value, RAISE NOTICE it (record, do not gate), then in post-state
-- assert the value is unchanged. If auth_role() is absent, pre and post
-- are both false and the equality holds trivially — correct, because
-- 130 is not responsible for its existence. The check still catches its
-- real target: a shotgun revoke inside THIS migration that also hit
-- auth_role would flip the value and the delta assertion fires.

-- Session-scoped pre-state capture (transaction-scoped via `is_local=true`
-- on set_config). We use custom GUCs rather than a temp table so REVOKE
-- statements remain at the top level of this SQL file for scan-readability.
-- These names have no meaning to postgres beyond string storage; the
-- migration owns them.
do $$
declare
  v_reap_present   boolean;
  v_slots_present  boolean;
  v_reap_anon      boolean;
  v_slots_anon     boolean;
  v_auth_anon      boolean;
begin
  -- Presence: 130's TARGET functions are inputs to the work — genuine precondition, abort on absent.
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='reap_expired_holds'
                    and pg_get_function_identity_arguments(p.oid)='p_vendor_id uuid')
    into v_reap_present;
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='vendor_availability_slots'
                    and pg_get_function_identity_arguments(p.oid)='p_vendor_id uuid, p_from_date date, p_to_date date')
    into v_slots_present;

  if not v_reap_present then
    raise exception '130 pre-state: reap_expired_holds(uuid) absent — 129 must apply first';
  end if;
  if not v_slots_present then
    raise exception '130 pre-state: vendor_availability_slots(uuid,date,date) absent — 129 must apply first';
  end if;

  -- Effective anon EXECUTE on the two targets (three-valued observation, not gated).
  v_reap_anon  := has_function_privilege('anon', 'public.reap_expired_holds(uuid)', 'EXECUTE');
  v_slots_anon := has_function_privilege('anon', 'public.vendor_availability_slots(uuid,date,date)', 'EXECUTE');

  -- auth_role() DELTA CAPTURE — record only, do not gate on presence or value.
  -- has_function_privilege on a missing function raises undefined_function;
  -- guard with a presence check so the carve-out invariant is trivially
  -- satisfied if the helper does not exist.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='auth_role'
                and pg_get_function_identity_arguments(p.oid)='') then
    v_auth_anon := has_function_privilege('anon', 'public.auth_role()', 'EXECUTE');
  else
    v_auth_anon := false;
  end if;

  perform set_config('hephaestus.mig130.auth_role_anon_pre', v_auth_anon::text, true);

  raise notice '130 pre-state: reap_expired_holds anon EXECUTE=%, vendor_availability_slots anon EXECUTE=%, auth_role anon EXECUTE=% (auth_role captured as delta baseline, not gated)',
    v_reap_anon, v_slots_anon, v_auth_anon;

  if v_reap_anon = false and v_slots_anon = false then
    raise notice '130 pre-state: both targets already anon-denied — this apply is a no-op (idempotent replay)';
  end if;
end $$;

-- ┌─ REVOKE ─────────────────────────────────────────────────────────────
-- Explicit REVOKE FROM anon. `REVOKE ALL FROM PUBLIC` was already done in
-- 129 and does not touch the anon role slot (see task_490 mechanism note in
-- supabase/migrations/README.md on the Orion repo). Explicit revoke is the
-- only shape that clears the project-default anon grant.
--
-- PREMISE VERIFIED PRE-APPLY: neither target carries a PUBLIC EXECUTE grant
-- (proacl inspected on BC prod 2026-09-08 during 130 dry-run — no leading
-- `=X/postgres` on either function). A direct REVOKE FROM anon is
-- sufficient to close anon's effective EXECUTE because there is no PUBLIC
-- path for anon to inherit through. Contrast auth_role() above, which DOES
-- carry PUBLIC — a future replay of 130 against a schema where the
-- targets have drifted to also hold PUBLIC would leave anon EXECUTE true
-- via that inheritance, and the post-state has_function_privilege check
-- would correctly fail (see PREDICATE RAIL SWITCH in header).
revoke execute on function public.reap_expired_holds(uuid) from anon;
revoke execute on function public.vendor_availability_slots(uuid, date, date) from anon;

-- ┌─ POST-STATE ASSERTIONS ──────────────────────────────────────────────
-- Targets: anon EXECUTE must be gone; authenticated AND service_role must
-- be preserved (shotgun-revoke catch — 129 proacl showed service_role
-- holding EXECUTE alongside anon and authenticated, and nothing currently
-- notices if a wildcard revoke takes it too).
-- auth_role(): delta assertion, not absolute (see PREDICATE RAIL SWITCH
-- and CARVE-OUT ASSERTED AS A DELTA sections in header).
do $$
declare
  v_reap_anon        boolean := has_function_privilege('anon',          'public.reap_expired_holds(uuid)', 'EXECUTE');
  v_slots_anon       boolean := has_function_privilege('anon',          'public.vendor_availability_slots(uuid,date,date)', 'EXECUTE');
  v_reap_authn       boolean := has_function_privilege('authenticated', 'public.reap_expired_holds(uuid)', 'EXECUTE');
  v_slots_authn      boolean := has_function_privilege('authenticated', 'public.vendor_availability_slots(uuid,date,date)', 'EXECUTE');
  v_reap_svc         boolean := has_function_privilege('service_role',  'public.reap_expired_holds(uuid)', 'EXECUTE');
  v_slots_svc        boolean := has_function_privilege('service_role',  'public.vendor_availability_slots(uuid,date,date)', 'EXECUTE');
  -- Delta baseline is read as TEXT with missing_ok=true, then branched three-way.
  -- Coercing NULL/'' directly to boolean would land as false and silently pass the
  -- delta assertion in exactly the scenario it exists to catch: pre-state ran and
  -- recorded true, migration accidentally revoked, but the GUC did not survive to
  -- post (runner split into separate transactions; is_local=true GUCs do not
  -- outlive their transaction). NULL-FALLS-BETWEEN-GATES landing on the remedy
  -- for the previous defect — the success path writes the value so the blind state
  -- is produced by everything working right up until it doesn't. Raise loud
  -- instead. Bonus: catches a stale session-scope GUC from a prior debug set
  -- (which the strict form of current_setting would treat as "recognized" and
  -- happily return a value nobody set this transaction).
  v_auth_anon_pre_t  text    := current_setting('hephaestus.mig130.auth_role_anon_pre', true);
  v_auth_anon_pre    boolean;
  v_auth_anon_post   boolean;
begin
  if v_auth_anon_pre_t is null or v_auth_anon_pre_t = '' then
    raise exception '130 post-state: pre-state GUC hephaestus.mig130.auth_role_anon_pre is absent — pre-state DO block did not run in this transaction. Under set_config(..., is_local=true) the captured value is transaction-local; pre and post MUST execute in the same transaction. If a runner is splitting statements (supabase db push, some CI harnesses), wrap 130 in an explicit BEGIN/COMMIT so both blocks share a transaction. Aborting rather than defaulting to false on a NULL delta baseline.';
  end if;
  v_auth_anon_pre := v_auth_anon_pre_t::boolean;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='auth_role'
                and pg_get_function_identity_arguments(p.oid)='') then
    v_auth_anon_post := has_function_privilege('anon', 'public.auth_role()', 'EXECUTE');
  else
    v_auth_anon_post := false;
  end if;

  if v_reap_anon or v_slots_anon then
    raise exception '130 post-state: revoke did not take — reap anon=% slots anon=%. If proacl shows no anon entry either, PUBLIC still holds EXECUTE and anon inherits it — investigate PUBLIC grant, do not paper over.',
      v_reap_anon, v_slots_anon;
  end if;
  if not v_reap_authn or not v_slots_authn then
    raise exception '130 post-state: authenticated EXECUTE gone — reap authn=% slots authn=% (revoke overshot to authenticated)',
      v_reap_authn, v_slots_authn;
  end if;
  if not v_reap_svc or not v_slots_svc then
    raise exception '130 post-state: service_role EXECUTE gone — reap svc=% slots svc=% (revoke overshot to service_role)',
      v_reap_svc, v_slots_svc;
  end if;
  if v_auth_anon_post <> v_auth_anon_pre then
    raise exception '130 post-state: auth_role() anon EXECUTE flipped from % to % — a shotgun revoke inside this migration hit the carve-out, aborting so the 18 auth_role-dependent tables are not left in an inconsistent state',
      v_auth_anon_pre, v_auth_anon_post;
  end if;

  raise notice '130 post-state OK: targets anon-denied, authenticated + service_role preserved, auth_role() carve-out delta held (pre=% post=%)',
    v_auth_anon_pre, v_auth_anon_post;
end $$;

-- Refresh PostgREST schema cache so behavioural probes see the new ACL immediately.
notify pgrst, 'reload schema';
