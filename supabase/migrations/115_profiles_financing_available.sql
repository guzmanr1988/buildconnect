-- 115_profiles_financing_available.sql
-- Contractor-controlled "Financing Available" flag.
--
-- Adds a per-vendor boolean that drives the "Financing Available" badge on
-- the homeowner-side vendor-compare surface + the vendor's own profile page.
-- The Vendor TYPE has carried `financing_available: boolean` since inception
-- (src/types/index.ts, Vendor extends Profile), and the badge already renders
-- conditionally in src/features/homeowner/pages/vendor-compare.tsx:517 and
-- src/features/vendor/pages/profile.tsx:206. But no DB column existed:
-- src/lib/hooks/use-real-vendors.ts and src/lib/vendor-scope.ts
-- (profileToVendor) hardcoded `financing_available: false`, so the badge only
-- ever surfaced for the demo MOCK_VENDORS entries. This migration lands the
-- column so real contractors can opt in via a Switch in vendor Settings.
--
-- Additive + default-false: zero behavior change for existing profile rows.
-- The badge stays hidden for every vendor already in the table until they
-- explicitly toggle it on from the vendor Settings page. RLS unchanged
-- (existing profiles policies already scope self-writes / broad reads for
-- role='vendor').
--
-- No seed writes here — walker-seed freeze in effect; badge visibility on
-- demo Apex flows through mock-data.ts (client-only), not this column.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS financing_available boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.financing_available IS
  'Vendor-facing opt-in: when true, homeowner-side vendor-compare renders a '
  '"Financing Available" badge on this vendor''s card. Vendor toggles from '
  'Settings; homeowner/admin roles ignore. Ship task_1784926281856_457.';
