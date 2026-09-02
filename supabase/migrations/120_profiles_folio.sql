-- 120_profiles_folio.sql
-- Add three nullable columns to profiles for Miami-Dade folio caching.
--
--   folio            text        (13-digit MDC folio, e.g. 3060180330340)
--   folio_checked_at timestamptz (attempted-vs-never-attempted provenance)
--   folio_source     text        (default 'mdc_arcgis'; futureproofs a
--                                 second county lookup without another migration)
--
-- Two-column split (folio, folio_checked_at) is deliberate: a single nullable
-- folio column conflates 'never attempted' with 'attempted, no match' and the
-- success path is what writes the NULL, so the blind state is produced by the
-- thing working correctly. With folio_checked_at:
--   folio NULL + checked_at NULL  = never attempted (backfill candidate)
--   folio NULL + checked_at set   = attempted, no match (Broward / ambiguous /
--                                   parser reject) — do NOT retry
--   folio set                     = resolved
--
-- Task_1788364687325_793. Rod voice-asked 09-02 (via kratos dispatch msg
-- 1788364712293-kratos-10q90): display folio next to phone on homeowner main.
-- Schema shape agreed with kratos msg 1788365051839-kratos-ytarj.
--
-- No folio/parcel/property_id column existed pre-migration — verified via
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND (column_name ILIKE '%folio%'
--     OR column_name ILIKE '%parcel%' OR column_name ILIKE '%property_id%')
-- returning [] on prod project llybxugitrbgybplgpsi at 2026-09-02.
--
-- Migration number 120: verified free across all branches at author time via
--   git log --all --diff-filter=A --name-only --pretty=format: \
--     -- 'supabase/migrations/120*'
-- (0 hits). Highest existing across-branches: 119 (task_683 image_urls,
-- landed 3b8e94d 09-01).
--
-- Idempotent: three ADD COLUMN IF NOT EXISTS. Safe to re-apply.
-- RLS: no policy changes — new columns inherit existing profiles-row
-- policies. A homeowner writing their own row updates their own folio;
-- no cross-user leak surface added.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS folio            text,
  ADD COLUMN IF NOT EXISTS folio_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS folio_source     text DEFAULT 'mdc_arcgis';

COMMENT ON COLUMN public.profiles.folio            IS 'Miami-Dade property FOLIO (13-digit); NULL means no match or never attempted — disambiguate with folio_checked_at';
COMMENT ON COLUMN public.profiles.folio_checked_at IS 'Timestamp of last lookup attempt. NULL + folio NULL = never attempted; NOT NULL + folio NULL = attempted no-match, do not retry';
COMMENT ON COLUMN public.profiles.folio_source     IS 'Which appraiser data source resolved this folio (default mdc_arcgis)';
