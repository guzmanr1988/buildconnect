-- 113_column_gate_platform_app_settings.sql
-- Column-gate v2: lock sensitive columns on platform_settings + app_settings
-- via REVOKE-highest-tier-then-GRANT-keep-list pattern.
--
-- Consumer-column survey completed pre-apply:
--   * platform_settings: 3 live FE call sites, all explicit column lists.
--       - src/lib/hooks/use-platform-settings.ts L42 reads:
--         stripe_enabled, application_fee_bps, homeowner_payout_fee_bps,
--         show_margin_on_project_report, updated_at
--       - src/features/admin/pages/referral-program.tsx L131 reads:
--         default_referral_bonus_cents
--       - No consumer reads updated_by (admin identity trail).
--   * app_settings: ZERO live FE call sites at survey time
--     (src/lib/api/admin.ts::getSettings/updateSettings define query paths
--     but are not imported anywhere; admin/settings.tsx uses local
--     MOCK_SETTINGS state). We still lock the 3 commercially-sensitive cols
--     and leave the 4 feature-flag cols public for defense-in-depth against
--     any future maintenance-banner-style anon reader.
--
-- CRITICAL discipline lesson (N=2 same-class bug within 24h): column-level
-- REVOKE is a NO-OP when a higher-tier grant already exists (PUBLIC or
-- table-level). First arc was implicit-PUBLIC-grant on 2026-06-30; this
-- migration was rewritten after v1 attempted to REVOKE at column-level while
-- table-level SELECT was still present. The correct, universally-safe pattern:
--   1) REVOKE at the highest existing tier (table-level here)
--   2) GRANT the keep-list at column-level
--   3) Role-switched, EXCEPTION-catching probe suite BEFORE live apply
--
-- If a future dev re-adds `SELECT *` (e.g. wires admin.ts::getSettings),
-- the query will 42501 on the locked columns rather than silently leaking.
-- Explicit safe col-lists for each table are documented above each GRANT below.
--
-- This migration matches the live-applied change (2026-07-01 20:47:43Z) so
-- the repo does not drift from deployed state.

-- ----------------------------------------------------------------------------
-- platform_settings: allow authenticated to read 7 of 8 cols; lock updated_by.
-- Sensitive: updated_by (admin identity trail).
-- Keep: id, stripe_enabled, application_fee_bps, homeowner_payout_fee_bps,
--       show_margin_on_project_report, updated_at, default_referral_bonus_cents.
-- Anon: no policy on platform_settings → RLS blocks anon regardless (defense
-- in depth on top of RLS-layer denial).
-- ----------------------------------------------------------------------------
REVOKE SELECT ON public.platform_settings FROM authenticated;
GRANT  SELECT (id, stripe_enabled, application_fee_bps, homeowner_payout_fee_bps,
               show_margin_on_project_report, updated_at, default_referral_bonus_cents)
       ON public.platform_settings TO authenticated;

-- ----------------------------------------------------------------------------
-- app_settings: allow anon + authenticated to read 6 of 9 cols; lock the
-- 3 commercially-sensitive cols (revenue_share_pct, subscription_fee, payout_day).
-- Keep: id, maintenance_mode, ar_mode, phase2_enabled, financing_enabled, updated_at.
-- ----------------------------------------------------------------------------
REVOKE SELECT ON public.app_settings FROM anon;
REVOKE SELECT ON public.app_settings FROM authenticated;
GRANT  SELECT (id, maintenance_mode, ar_mode, phase2_enabled, financing_enabled, updated_at)
       ON public.app_settings TO anon;
GRANT  SELECT (id, maintenance_mode, ar_mode, phase2_enabled, financing_enabled, updated_at)
       ON public.app_settings TO authenticated;
