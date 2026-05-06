-- Migration 025 — Add phone, address, company to handle_new_user trigger
--
-- Apex 471 — fix-forward on the trigger-vs-PATCH race that left
-- profiles.phone/address/company NULL for vendors who DID type those
-- values at signup. Hermes confirmed (auth.users.raw_user_meta_data
-- for vendor 7db2dc32-897a-41b0-b620-a69d88f3544a) that the values
-- were captured by Supabase Auth (signUp metadata.{phone,address,company}
-- → raw_user_meta_data) but the handle_new_user() trigger only INSERTed
-- id, email, name, role, initials — never reading the other three from
-- raw_user_meta_data. profiles.{phone, address, company} relied entirely
-- on the post-trigger updateVendor PATCH from register.tsx, which
-- (pre-Ship #322) silently swallowed errors AND skipped company on
-- conditional-spread falsy.
--
-- This migration makes profile creation atomic: every value the user
-- typed at signup lands on the profiles row at trigger-time, before any
-- client-side network round-trip. Eliminates the silent-fail surface
-- entirely for these three fields. Bug 4 4-layer hardening (HTML
-- required + submit-time gate + trim-once + unconditional vendor
-- persist) on the form side stays in place; this migration is the
-- defense-in-depth at the DB-trigger layer.
--
-- Banked rules cited:
-- - feedback_supabase_security_definer_search_path — `set search_path
--   = public` retained (per migration 014 re-pin); without it the
--   `profiles` table + `user_role` cast + `generate_initials` would
--   be unresolvable in the SECURITY DEFINER context.
-- - feedback_defensive_plus_corrective_pairing — Bug 4 form-side fix
--   (mask layer) shipped earlier; this migration is the cause-layer.
--   Architectural close per banked discipline.
-- - feedback_silent_undefined_field_mismatch — sibling shape: trigger
--   "knew about" name+role columns but not phone/address/company,
--   producing silent NULL writes that downstream visibility gates
--   then filtered on (use-real-vendors.ts:23 company-NOT-NULL).
--
-- Idempotent: CREATE OR REPLACE FUNCTION overwrites; safe to re-apply.
-- Reversible: redeploy 014's body if regression surfaces.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, name, role, initials, phone, address, company)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'homeowner'),
    generate_initials(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'address', ''),
    nullif(trim(new.raw_user_meta_data->>'company'), '')
  );
  return new;
end;
$$;
