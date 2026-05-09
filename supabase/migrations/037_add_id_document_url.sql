-- Add id_document_url column to profiles for the mandatory homeowner ID flow.
-- Hybrid Option A.1 (PR #197): TEXT column stores either a base64 dataURL
-- (interim) or a Supabase Storage URL (Tranche-3 follow-up). Single-row-per-
-- user storage replaces the per-project base64 copies that drove the LS-quota
-- launch-blocker arc (PRs #189/#191/#193/#194/#195/#196).

alter table profiles
  add column if not exists id_document_url text null;
