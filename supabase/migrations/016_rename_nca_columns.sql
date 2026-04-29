-- Ship #348 — Rename concatenated NCA columns to canonical snake_case.
--
-- Per Apollo Probe 2 evidence + kratos #94 truthfulness self-classification:
-- Migration 013 was originally pasted via Telegram which stripped the
-- underscores from column names (Markdown italic interpretation on
-- underscore-delimited identifiers). Postgres accepted the concatenated
-- names as valid identifiers (no error) so Migration 013 "Success" was
-- a FALSE-POSITIVE — columns exist but with wrong names.
--
-- Frontend code reads profile.noncircumvention_agreement_signed_at
-- (snake_case) which returns undefined on the actually-stored
-- concatenated columns → NCA appears never-signed forever → cross-tab
-- persistence broken → Q1 #275 defect 5 (NCA persistence + admin
-- visibility) un-resolved despite Migration 013 "applying".
--
-- This migration RENAMES the 5 concatenated columns back to canonical
-- snake_case names matching the frontend Profile interface + the
-- migration 013 SOURCE (which was correct in repo all along).
--
-- Sub-observation per banked sibling-cite (kratos absorption):
-- telegram-DDL-underscore-stripping-as-silent-schema-divergence — sibling
-- of feedback_silent_undefined_field_mismatch at schema-creation-vs-
-- frontend-read layer. Forward-discipline: ALWAYS deliver migration SQL
-- via FILE-PATH (Finder → TextEdit → Studio paste) NOT raw Telegram
-- paste, when SQL contains underscored identifiers.
--
-- Idempotency: each RENAME wrapped in DO-block that checks BOTH the
-- concatenated-source-column exists AND the snake_case-target-column
-- doesn't yet exist. Re-application after success is no-op. If columns
-- are already snake_case (e.g., manual fix preceded this migration),
-- entire migration no-ops cleanly.
--
-- Reversibility: ALTER TABLE RENAME COLUMN reversible via reverse-
-- direction RENAME. No data lost; column data preserved across rename.
--
-- Per banked CHAIN IS GOD: schema-correction at additive non-chain layer.
-- Compliance-pass anticipated.

do $$
begin
  -- Column 1: noncircumventionagreementsignedat → noncircumvention_agreement_signed_at
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'noncircumventionagreementsignedat'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'noncircumvention_agreement_signed_at'
  ) then
    alter table public.profiles
      rename column noncircumventionagreementsignedat to noncircumvention_agreement_signed_at;
  end if;

  -- Column 2: noncircumventionagreementsignedname → noncircumvention_agreement_signed_name
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'noncircumventionagreementsignedname'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'noncircumvention_agreement_signed_name'
  ) then
    alter table public.profiles
      rename column noncircumventionagreementsignedname to noncircumvention_agreement_signed_name;
  end if;

  -- Column 3: noncircumventionagreementversion → noncircumvention_agreement_version
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'noncircumventionagreementversion'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'noncircumvention_agreement_version'
  ) then
    alter table public.profiles
      rename column noncircumventionagreementversion to noncircumvention_agreement_version;
  end if;

  -- Column 4: noncircumventionagreementtextsnapshot → noncircumvention_agreement_text_snapshot
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'noncircumventionagreementtextsnapshot'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'noncircumvention_agreement_text_snapshot'
  ) then
    alter table public.profiles
      rename column noncircumventionagreementtextsnapshot to noncircumvention_agreement_text_snapshot;
  end if;

  -- Column 5: noncircumventionagreementsignaturemetadata → noncircumvention_agreement_signature_metadata
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'noncircumventionagreementsignaturemetadata'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'noncircumvention_agreement_signature_metadata'
  ) then
    alter table public.profiles
      rename column noncircumventionagreementsignaturemetadata to noncircumvention_agreement_signature_metadata;
  end if;
end $$;
