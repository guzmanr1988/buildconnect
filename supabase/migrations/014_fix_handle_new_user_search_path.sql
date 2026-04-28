-- Ship #322 Phase B Part 1 — Pin search_path on handle_new_user trigger
-- Per Apollo probe-275 evidence: handle_new_user() SECURITY DEFINER trigger
-- failing silently — auth.users INSERT succeeds but profiles row never
-- created. Frontend PATCH against the missing row returns 406 / PGRST116.
-- Banked feedback_supabase_security_definer_search_path firing-as-designed.
--
-- The migration 001_create_profiles.sql source DOES have `set search_path
-- = public` on the function, but deployed runtime config may have drifted
-- (older deploy, manual edit, partial migration). ALTER FUNCTION re-pins
-- the search_path explicitly + adds `auth` for any future references the
-- trigger may need (defensive: trigger fires on auth.users; while current
-- body doesnt schema-qualify auth tables explicitly, future patches might).
--
-- Banked feedback_defensive_plus_corrective_pairing #92 — ship CAUSE
-- (this migration) + MASK (register.tsx onSubmit catch) together for
-- architectural close.
--
-- Idempotent (ALTER FUNCTION SET search_path overwrites; safe to re-apply).
-- Reversible (ALTER FUNCTION ... RESET search_path if needed).

alter function public.handle_new_user() set search_path = public, auth;

-- Sibling SECURITY DEFINER functions in 011_create_functions_triggers.sql
-- (handle_commission_payment, handle_new_sale) currently lack
-- `set search_path` per banked feedback_supabase_security_definer_search_path
-- audit. Pinning these defensively to prevent same-class regression in
-- commission + sale flows (no current Apollo evidence those have failed,
-- but the class-rule per banked predicts identical risk-shape).

alter function public.handle_commission_payment() set search_path = public;
alter function public.handle_new_sale() set search_path = public;
