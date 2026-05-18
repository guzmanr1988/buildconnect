-- 057_lender_apply_url_and_instructions.sql
-- Add per-lender apply-link + how-to-apply copy fields.
--
-- ROD-DIRECT 2026-05-18 02:40Z (via kratos msg 1779072650846): "now add
-- links to link up the contractors directly to their pages, so when home
-- owner click on them it sends the homeowner directly to that link to apply
-- and in their application they would have to provide the company info or
-- code to do the financing".
--
-- Two new columns on lenders, both NULLABLE so existing 36 rows are
-- unaffected and Rod populates per-lender via admin UI on his cadence.
--
-- (1) apply_url            text  — external apply page URL.
--                                  HTTPS-only check constraint (scheme
--                                  safety: blocks javascript:/http:/data:
--                                  schemes). All major lenders use HTTPS
--                                  so zero false-rejects in scope.
-- (2) apply_instructions   text  — free-form how-to-apply copy. Per
--                                  design Q1 decision (display-only, not
--                                  pre-fill), this copy carries what the
--                                  homeowner needs to type on the lender
--                                  form — e.g. "Provide this contractor:
--                                  BuildConnect Network · Vendor ID:
--                                  VND-XXXX". No length cap (text type) to
--                                  let Rod write per-lender as detailed as
--                                  needed.
--
-- DESIGN Q ANSWERS (banked in kratos thread 1779072830559):
-- Q1 pre-fill vs display-only → DISPLAY-ONLY (matches Rod literal "they
--   would have to provide"; narrower compliance surface; no lender API
--   pre-fill dep).
-- Q2 url-required vs optional → OPTIONAL with conditional UI degradation
--   in Phase B homeowner surface (apply_url set → "Apply at Lender →"
--   external CTA; apply_url null → "How to apply ↓" instructions reveal
--   only; both null → "Coming soon" badge still visible in browse).
--
-- 053 AUDIT TRIGGER INTERACTION: lenders_audit_change uses to_jsonb(NEW)
-- + to_jsonb(OLD), so new columns are auto-captured in before/after_json
-- on every INSERT/UPDATE. Zero trigger change needed.
--
-- 048 UPDATED_AT TRIGGER INTERACTION: lenders_set_updated_at fires BEFORE
-- UPDATE for any column diff, so editing apply_url/apply_instructions
-- bumps updated_at correctly. Zero trigger change needed.
--
-- Pattern: PAT-apply pre-PR-open per kratos splits-by-class doctrine —
-- column-add is greenfield (no consumers reference new columns yet) +
-- additive + reversibility-cheap, mirrors 055 enum-widen ahead-of-PR
-- timing (not 056 DML-bundled-with-FE atomic-at-merge).

alter table public.lenders
  add column if not exists apply_url text,
  add column if not exists apply_instructions text;

-- HTTPS-only scheme check (allows NULL since column is nullable; only
-- enforces shape when admin sets a value).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lenders_apply_url_https_only'
      and conrelid = 'public.lenders'::regclass
  ) then
    alter table public.lenders
      add constraint lenders_apply_url_https_only
      check (apply_url is null or apply_url ~* '^https://[a-zA-Z0-9]');
  end if;
end$$;
