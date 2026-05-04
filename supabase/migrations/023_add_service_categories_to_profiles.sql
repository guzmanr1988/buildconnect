-- Add service_categories JSONB column to profiles for real-auth vendors.
-- Enables vendor-compare picker to filter real vendors by service category.
-- Demo vendors (v-1/v-2/v-3) use MOCK_VENDORS fixture; this column is for
-- real-auth vendor signups. Default empty array = no category coverage.

alter table profiles
  add column if not exists service_categories jsonb not null default '[]'::jsonb;
