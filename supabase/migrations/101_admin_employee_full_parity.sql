-- 101_admin_employee_full_parity.sql
-- admin_employee RLS FULL parity with admin across all public-schema tables,
-- except one Rod-locked carve-out (employee → admin self-promotion vector).
--
-- task_1782415852550_082 (hephaestus, mig 109 v3). Rod scope-reconciliation
-- locked 2026-06-25 18:18-18:27Z (relayed by kratos msg 1782415828992):
--   "Employees get full access to everything — leads, messages, transactions,
--    vendors, financing, all of it — SAME AS YOU — except they can't create or
--    promote other admins."
-- Applied to prod llybxugitrbgybplgpsi via Supabase Mgmt API SQL POST at
-- apply_ts 2026-06-25T19:36:43Z (HTTP 201). Post-apply DO-block RAISE NOTICE
-- 'mig 109 v3 verification ok: 1 admin-only policies remain (bucket B carve-out)'
-- fired in the same transaction = exactly 1 admin-only policy remains
-- (profiles UPDATE "Admins update any profile" — Rod's sole carve-out).
--
-- Source-of-truth snapshot: pg_policies dump of all 179 public-schema policies
-- pre-apply at 2026-06-25T19:31:04Z, content SHA
-- 269e3d60bff058bdf009487e3e4e7751031c07776c5e9843b018e5d217bb948d.
-- Body SHA pre-apply: db8fbfe5708775dc51c11c6c1b2da428097597e4cb606aca77bfe96c35a5dc84.
-- Generator: /tmp/gen_mig_109_v3.py.
--
-- ───────────────────────────────────────────────────────────────────
-- Expansion rules (uniform across both expression forms found in prod):
--   Enum-form (profiles.role EXISTS rail):
--     'admin'::user_role
--       → ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])
--   JWT-claim-form (auth.jwt() ->> 'role' rail):
--     = 'admin'::text
--       → = ANY (ARRAY['admin'::text, 'admin_employee'::text])
--
-- Coverage: 65 ALTER POLICY statements grouped by table.
-- Permanently excluded (bucket B): 1 policy
--   * profiles UPDATE "Admins update any profile"
--     (employee → admin self-promotion vector; covered by mig 109b trigger
--      guard for the auth.users mint path. A separate escalation-safe
--      non-admin-fields profiles UPDATE for admin_employee will land when
--      the FE real-write path needs it — companion mig 102 stub, not in
--      this PR.)
-- Already-parity no-op (skipped in source): 4 policies on support_messages
-- + support_threads (already had ANY(ARRAY['admin','admin_employee']) at
-- snapshot time).
--
-- ───────────────────────────────────────────────────────────────────
-- Idempotency: ALTER POLICY is name-addressed, so re-applying the same body
-- replaces the policy text with the same text — no-op. The embedded
-- DO-block assertion expects exactly 1 admin-only policy remaining after
-- apply; on a second run against already-parity state, the count is
-- unchanged at 1, so the assertion passes again. This file can be applied
-- against the same database multiple times without drift.
--
-- Companion: 100_handle_new_user_tighten_block_admin_signup.sql (mig 109b,
-- privesc trigger guard). Both shipped together as the privesc + parity
-- bundle on 2026-06-25 prod cut.
-- ───────────────────────────────────────────────────────────────────

BEGIN;


-- ===== admin_reset_audit_log =====
ALTER POLICY "admin_audit_admin_read" ON public.admin_reset_audit_log
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== app_settings =====
ALTER POLICY "Admins can update settings" ON public.app_settings
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== application_fee_overrides =====
ALTER POLICY "application_fee_overrides_admin_all" ON public.application_fee_overrides
  USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))))
  WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== audit_log =====
ALTER POLICY "audit_select_admin" ON public.audit_log
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== bank_accounts =====
ALTER POLICY "Admins see bank metadata" ON public.bank_accounts
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== bugs =====
ALTER POLICY "Admins full access to bugs" ON public.bugs
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== closed_sales =====
ALTER POLICY "Admins see all sales" ON public.closed_sales
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== commission_ledger =====
ALTER POLICY "cl_insert_admin" ON public.commission_ledger
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));

ALTER POLICY "cl_select_admin_all" ON public.commission_ledger
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== customer_financing_profile =====
ALTER POLICY "cfp_select_admin_all" ON public.customer_financing_profile
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));

ALTER POLICY "cfp_update_admin" ON public.customer_financing_profile
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== draft_projects =====
ALTER POLICY "Admins manage all drafts" ON public.draft_projects
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== escrow_accounts =====
ALTER POLICY "escrow_accounts_own_read" ON public.escrow_accounts
  USING (((party_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== escrow_holds =====
ALTER POLICY "escrow_holds_admin_read" ON public.escrow_holds
  USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== escrow_releases =====
ALTER POLICY "escrow_releases_admin_read" ON public.escrow_releases
  USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== feature_flags =====
ALTER POLICY "ff_insert_admin" ON public.feature_flags
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));

ALTER POLICY "ff_write_admin" ON public.feature_flags
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== financing_applications =====
ALTER POLICY "fa_select_admin_all" ON public.financing_applications
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));

ALTER POLICY "fa_update_admin" ON public.financing_applications
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== homeowner_documents =====
ALTER POLICY "Admins manage all homeowner documents" ON public.homeowner_documents
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== homeowner_payouts =====
ALTER POLICY "homeowner_payouts_own_read" ON public.homeowner_payouts
  USING (((homeowner_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== leads =====
ALTER POLICY "Admins can update any lead" ON public.leads
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins see all leads" ON public.leads
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== lenders =====
ALTER POLICY "lenders_write_admin" ON public.lenders
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== messages =====
ALTER POLICY "Admins read all messages" ON public.messages
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== option_groups =====
ALTER POLICY "Admins can delete option_groups" ON public.option_groups
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can insert option_groups" ON public.option_groups
  WITH CHECK ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can update option_groups" ON public.option_groups
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== options =====
ALTER POLICY "Admins can delete options" ON public.options
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can insert options" ON public.options
  WITH CHECK ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can update options" ON public.options
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== platform_settings =====
ALTER POLICY "platform_settings_write" ON public.platform_settings
  USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))))
  WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== profiles =====
ALTER POLICY "Admins can view all profiles" ON public.profiles
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== referral_attributions =====
ALTER POLICY "referral_attributions_party_read" ON public.referral_attributions
  USING (((referee_id = auth.uid()) OR (referrer_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== referral_bonus_overrides =====
ALTER POLICY "referral_bonus_overrides_admin_all" ON public.referral_bonus_overrides
  USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))))
  WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== referral_codes =====
ALTER POLICY "referral_codes_own_read" ON public.referral_codes
  USING (((referrer_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== referral_payouts =====
ALTER POLICY "referral_payouts_referrer_read" ON public.referral_payouts
  USING (((referrer_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== referral_qualifying_events =====
ALTER POLICY "referral_qualifying_events_party_read" ON public.referral_qualifying_events
  USING (((referee_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM referral_attributions a
  WHERE ((a.referee_id = referral_qualifying_events.referee_id) AND (a.referrer_id = auth.uid())))) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'admin_employee'::text]))));


-- ===== reschedule_requests =====
ALTER POLICY "Admins manage all reschedule requests" ON public.reschedule_requests
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== sent_projects =====
ALTER POLICY "Admins manage all sent projects" ON public.sent_projects
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== services =====
ALTER POLICY "Admins can delete services" ON public.services
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can insert services" ON public.services
  WITH CHECK ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can update services" ON public.services
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== sub_groups =====
ALTER POLICY "Admins can delete sub_groups" ON public.sub_groups
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can insert sub_groups" ON public.sub_groups
  WITH CHECK ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can update sub_groups" ON public.sub_groups
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== sub_options =====
ALTER POLICY "Admins can delete sub_options" ON public.sub_options
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can insert sub_options" ON public.sub_options
  WITH CHECK ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can update sub_options" ON public.sub_options
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== transactions =====
ALTER POLICY "Admins can create transactions" ON public.transactions
  WITH CHECK ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins see all transactions" ON public.transactions
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== vendor_catalog_items =====
ALTER POLICY "Admins see all catalog" ON public.vendor_catalog_items
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== vendor_change_requests =====
ALTER POLICY "Admins manage all change requests" ON public.vendor_change_requests
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== vendor_employees =====
ALTER POLICY "Admins manage all employees" ON public.vendor_employees
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== vendor_homeowner_documents_deprecated_pre_launch_2026_05_23 =====
ALTER POLICY "Admins manage all documents" ON public.vendor_homeowner_documents_deprecated_pre_launch_2026_05_23
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== vendor_lenders =====
ALTER POLICY "vendor_lenders_select_admin" ON public.vendor_lenders
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== vendor_memberships =====
ALTER POLICY "Admins manage all memberships" ON public.vendor_memberships
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== vendor_option_prices =====
ALTER POLICY "Admins can delete any price" ON public.vendor_option_prices
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can insert any price" ON public.vendor_option_prices
  WITH CHECK ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can update any price" ON public.vendor_option_prices
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- ===== vendor_permits =====
ALTER POLICY "Admins read all permits" ON public.vendor_permits
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== vendor_settings =====
ALTER POLICY "Admins read all settings" ON public.vendor_settings
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role]))))));


-- ===== vendor_sub_option_prices =====
ALTER POLICY "Admins can delete vendor_sub_option_prices" ON public.vendor_sub_option_prices
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can insert vendor_sub_option_prices" ON public.vendor_sub_option_prices
  WITH CHECK ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));

ALTER POLICY "Admins can update vendor_sub_option_prices" ON public.vendor_sub_option_prices
  USING ((auth_role() = ANY (ARRAY['admin'::user_role, 'admin_employee'::user_role])));


-- Verification: after apply, exactly 1 admin-only policy must remain
-- (Bucket B: profiles UPDATE 'Admins update any profile' — Rod's only carve-out).
DO $$
DECLARE
  remaining int;
  expected int := 1;
BEGIN
  SELECT count(*) INTO remaining
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (
           (qual::text       ~ 'admin' AND qual::text       !~ 'admin_employee')
       OR  (with_check::text ~ 'admin' AND with_check::text !~ 'admin_employee')
     );
  IF remaining <> expected THEN
    RAISE EXCEPTION 'mig 109 v3 verification failed: % admin-only policies remain (expected %)', remaining, expected;
  END IF;
  RAISE NOTICE 'mig 109 v3 verification ok: % admin-only policies remain (bucket B carve-out)', remaining;
END $$;

COMMIT;
