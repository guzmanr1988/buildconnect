-- Add missing profile columns to support auth-store updateProfile → Supabase upsert.
-- avatar_url: base64 data URL (Tranche-3 migrates to Storage bucket).
-- additional_addresses: JSONB array of secondary property addresses.
-- contractor_licenses: JSONB array of contractor license records.

alter table profiles
  add column if not exists avatar_url text null,
  add column if not exists additional_addresses jsonb null,
  add column if not exists contractor_licenses jsonb null;
