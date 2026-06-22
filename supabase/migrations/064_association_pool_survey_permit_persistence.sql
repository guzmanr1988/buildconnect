-- 064_association_pool_survey_permit_persistence.sql
-- task_1780776240716_817 — Association question + Pool survey question + Permit DB gap fix.
--
-- (1) Add project_permit + project_permit_waiver columns to sent_projects.
--     The cart-store already snapshots projectPermit / projectPermitWaiver at
--     sendProject time but the upsert call dropped them — refresh wiped Permit
--     for every persisted row. Adding the columns + extending the upsert path
--     (projects-store.ts) closes the silent-data-loss gap.
--
-- (2) Add project_association + pool_survey columns. New homeowner questions
--     captured at configurator time; persisted alongside permit and surfaced
--     on the vendor project-detail view. project_association rides every
--     service; pool_survey is Pool-only (other services leave it NULL).
--
-- (3) Add sent_project_id + doc_type to homeowner_documents (idempotent —
--     PR-331 already added these in production, this migration just makes
--     the schema reproducible from the repo for env re-applies).
--
-- All ADD COLUMN statements use IF NOT EXISTS so the migration is safe to
-- re-apply on environments that already received the columns out-of-band.

alter table public.sent_projects
  add column if not exists project_permit text
    check (project_permit is null or project_permit in ('yes', 'no'));

alter table public.sent_projects
  add column if not exists project_permit_waiver jsonb;

alter table public.sent_projects
  add column if not exists project_association text
    check (project_association is null or project_association in ('yes', 'no'));

alter table public.sent_projects
  add column if not exists pool_survey text
    check (pool_survey is null or pool_survey in ('yes', 'no'));

alter table public.homeowner_documents
  add column if not exists sent_project_id uuid;

alter table public.homeowner_documents
  add column if not exists doc_type text;

-- Index for vendor RLS lookups gating doc visibility by sent_project ownership.
create index if not exists idx_homeowner_documents_sent_project
  on public.homeowner_documents (sent_project_id)
  where sent_project_id is not null;
