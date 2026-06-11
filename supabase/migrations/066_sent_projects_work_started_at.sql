-- 066_sent_projects_work_started_at.sql
-- task_1780797727202_066 — Association Part B (engagement-time doc upload).
--
-- Adds a nullable work_started_at timestamp to sent_projects so the vendor
-- "Start Work" action (gated by association-doc presence when
-- project_association='yes') can persist the transition from "sold/won" to
-- "actively working". Pre-#066 the sold->active state was implicit; this
-- column makes it explicit so the homeowner timeline + vendor UI can render
-- accurate state.
--
-- Additive + nullable + backward-safe: old bundle ignores the new column,
-- new bundle reads/writes it. Prod-first deploy (apply before promoting
-- the bundle) so the new client never tries to write a column the schema
-- doesn't have. Idempotent via IF NOT EXISTS so re-apply on environments
-- that received it out-of-band is a no-op.

alter table public.sent_projects
  add column if not exists work_started_at timestamptz;
