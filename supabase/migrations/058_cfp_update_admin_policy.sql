-- 058_cfp_update_admin_policy
--
-- Adds cfp_update_admin policy enabling admin-JWT direct UPDATE on
-- customer_financing_profile. Mirrors the cfp_select_admin_all admin-gate
-- pattern from 047 — admin role check via profiles table EXISTS clause.
--
-- Motivation: TEMP admin manual-stepper at /admin/financing-applications/:appId
-- needs to flip cfp.last_known_status between lifecycle stages without an
-- Edge Fn hop. Pre-058 the only path was admin-create-approval (service_role)
-- which is INSERT-only. UPDATE policy parity is the minimal addition.
--
-- Scope is intentionally UPDATE-only (no INSERT). cfp rows are seeded by
-- admin-create-approval Edge Fn at envelope-set time; admin direct INSERT
-- would bypass envelope-amount/partner/expires gating.

create policy "cfp_update_admin"
  on public.customer_financing_profile for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
