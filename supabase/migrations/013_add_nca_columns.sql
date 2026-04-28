-- Ship #321 — Add 5 noncircumvention_agreement_* columns to profiles table
-- Per Tranche-2 task_1777149753858_947 + Q1 #275 multi-defect resolution Phase A.
--
-- Resolves defects 4+5 of Q1 #275 retest arc:
--   4. signed-once-then-re-prompts-every-login (persistence broken)
--   5. admin doesn't see vendor signed agreement (cross-role visibility)
--
-- Both root-causes: the 5 NCA columns existed in TS Profile interface (per
-- types/index.ts since #270) but never landed on Supabase profiles table.
-- updateVendor calls including NCA fields rejected with column-not-found;
-- getProfile reads returned rows lacking these fields. AuthBootstrap defensive
-- merge (#273) preserved local-zustand-prior-state as workaround but couldn't
-- survive cross-tab/refresh + admin-side never had the data.
--
-- Once this migration applies, real-Supabase persistence resumes:
--   - NonCircumventionAgreementDialog sign-action → updateVendor → row update
--     succeeds → next getProfile returns persisted state → dialog stays closed
--   - admin/vendor-detail.tsx reads vendor.noncircumvention_agreement_signed_at
--     directly from Supabase → admin sees signed agreements
--   - AuthBootstrap merge-from-prior fallback becomes no-op (server returns
--     non-null values) — backward-compat preserved during partial-rollout
--     window
--
-- All columns nullable; no defaults. Legacy rows stay NULL until vendor signs;
-- vendor-layout.tsx NCA-gate (#270) reads version-mismatch on NULL → re-prompts
-- the dialog as designed (current behavior preserved for unsigned vendors).
--
-- additive-only ALTER (no data loss); reversal possible via DROP COLUMN if
-- needed. IF NOT EXISTS guards make the migration idempotent.

alter table profiles
  add column if not exists noncircumvention_agreement_signed_at timestamptz null,
  add column if not exists noncircumvention_agreement_signed_name text null,
  add column if not exists noncircumvention_agreement_version text null,
  add column if not exists noncircumvention_agreement_text_snapshot text null,
  add column if not exists noncircumvention_agreement_signature_metadata jsonb null;
