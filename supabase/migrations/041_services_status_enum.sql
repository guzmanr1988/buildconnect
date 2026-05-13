-- BuildConnect 2026 — services.status enum (draft|live) replaces phase2 boolean
--
-- Per Rodolfo spec 2026-05-13: admin should be able to ACTIVATE / DEACTIVATE
-- services as a first-class lifecycle state, with reversibility (live → draft)
-- supported for catalog-pull scenarios. Vendor pricing entry now operates on
-- BOTH draft and live services so vendors can build their catalog ahead of
-- launch; homeowner visibility still gates on status='live'.
--
-- Backfill rule: phase2:true → 'draft'; phase2:false/null → 'live'.
--
-- Expand-only: phase2 column is left in place so the previous bundle can
-- continue to read it during the deploy window. A follow-up migration will
-- drop phase2 after the new bundle is fully rolled out.

alter table services add column status text not null default 'live'
  check (status in ('draft', 'live'));

update services set status = 'draft' where phase2 = true;
