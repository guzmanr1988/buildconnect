-- Phase 2 real geocoding: add latitude/longitude columns to profiles.
-- Populated by the geocode-vendor Edge Function whenever a vendor's address
-- changes (signup + profile-edit). Used by useRealVendors → vendor-compare
-- distance filter so real vendors are gated by matchRadiusMiles the same
-- way mock vendors are.
--
-- Columns are nullable: existing vendor rows stay null until the first
-- post-migration profile-update or the one-shot backfill invocation lands.
-- vendor-compare's distance filter already skips when latitude/longitude
-- are not numeric, so null rows continue rendering (no regression).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

COMMENT ON COLUMN profiles.latitude IS
  'Geocoded latitude written by geocode-vendor Edge Fn. Null until first geocode.';
COMMENT ON COLUMN profiles.longitude IS
  'Geocoded longitude written by geocode-vendor Edge Fn. Null until first geocode.';
