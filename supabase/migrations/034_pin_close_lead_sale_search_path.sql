-- Migration 034 - Pin search_path on close_lead_sale (SECURITY DEFINER hardening)
--
-- Backend audit (hephaestus 2026-05-08) found close_lead_sale was the only
-- SECURITY DEFINER function in public missing SET search_path. The other 4
-- (auth_role, handle_new_user, handle_new_sale, handle_commission_payment)
-- are pinned. close_lead_sale was introduced in migration 003 before the
-- search_path discipline was banked.
--
-- Banked rule: feedback_supabase_security_definer_search_path - the same
-- root-cause class as the original signup-500 incident. SECURITY DEFINER
-- functions execute with the owner's privileges; an attacker who can
-- influence search_path (via SET ROLE on a session, etc.) can shadow the
-- bare table references (leads, closed_sales) with same-named objects in
-- a writable schema and hijack the function. Pinning search_path to
-- public, pg_temp is the canonical fix per migration 014's precedent.
--
-- Function body unchanged from migration 003 - this is a search_path-only
-- hardening pass. close_lead_sale signature: (p_lead_id text, p_sale_amount
-- numeric) returning uuid.
--
-- Idempotent: CREATE OR REPLACE FUNCTION overwrites; safe to re-apply.
-- Reversible: redeploy migration 003's body if regression surfaces (no body
-- change here, only the SET search_path clause is added).

create or replace function close_lead_sale(
  p_lead_id text,
  p_sale_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads%rowtype;
  v_sale_id uuid;
begin
  select * into v_lead from leads where id = p_lead_id;

  if not found then
    raise exception 'Lead not found: %', p_lead_id;
  end if;

  update leads set status = 'completed' where id = p_lead_id;

  insert into closed_sales (lead_id, vendor_id, homeowner_id, sale_amount, homeowner_name, project)
  values (p_lead_id, v_lead.vendor_id, v_lead.homeowner_id, p_sale_amount, v_lead.homeowner_name, v_lead.project)
  returning id into v_sale_id;

  return v_sale_id;
end;
$$;
