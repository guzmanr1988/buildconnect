-- 046_homeowner_documents_and_draft_projects.sql
-- PR-242 — Roof Measurement Breakdown PDF auto-save to homeowner /documents
-- + widened upfront for PR-243 (homeowner-upload + vendor-visibility) per
-- Rod 2026-05-14 15:25Z directive.
--
-- Lifecycle: draft project row exists from address+service-pick onward;
-- promotes to sent_projects via same-UUID INSERT on sendProject (Option C
-- per kratos+hermes recon — preserves sent_projects immutable-ledger
-- invariant per banked feedback_immutable_ledger_freeze_at_write).
-- Documents anchor to project_id (uuid, soft-ref) stable across promotion.

-- ───────────────────────────────────────────────────────────────────
-- (1) draft_projects — mutable WIP rows pre-send
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.draft_projects (
  id                  uuid primary key default gen_random_uuid(),
  homeowner_id        uuid not null references public.profiles(id) on delete cascade,
  service_id          text not null,
  address             text,
  latitude            numeric,
  longitude           numeric,
  area_sqft           numeric,
  measurement_meta    jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_draft_projects_homeowner
  on public.draft_projects (homeowner_id);
create index if not exists idx_draft_projects_homeowner_service
  on public.draft_projects (homeowner_id, service_id);

alter table public.draft_projects enable row level security;

create policy "Homeowners select own drafts"
  on public.draft_projects for select
  using (homeowner_id = auth.uid());

create policy "Homeowners insert own drafts"
  on public.draft_projects for insert
  with check (homeowner_id = auth.uid());

create policy "Homeowners update own drafts"
  on public.draft_projects for update
  using (homeowner_id = auth.uid());

create policy "Homeowners delete own drafts"
  on public.draft_projects for delete
  using (homeowner_id = auth.uid());

create policy "Admins manage all drafts"
  on public.draft_projects for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create or replace function public.draft_projects_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_draft_projects_updated_at on public.draft_projects;
create trigger trg_draft_projects_updated_at
  before update on public.draft_projects
  for each row execute function public.draft_projects_set_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- (2) homeowner_documents — durable per-homeowner document collection
-- ───────────────────────────────────────────────────────────────────
-- Replaces in-memory useHomeownerDocsStore (PR #194 reverted LS-persist
-- per banked rule feedback_ls_quota_compounds_across_stores).
-- storage_path → 'homeowner-documents' bucket (folder {homeowner_id}/...).
-- project_id soft-ref: same UUID lives in draft_projects pre-send and
-- sent_projects post-send, so docs survive promotion without rewrite.
-- uploaded_by + vendor_id + size_bytes + mime_type widen the table
-- upfront for PR-243 (homeowner upload + vendor visibility) so the
-- migration shape doesn't churn across the auto-save vs upload-ui ships.
create table if not exists public.homeowner_documents (
  id              uuid primary key default gen_random_uuid(),
  homeowner_id    uuid not null references public.profiles(id) on delete cascade,
  category        text not null check (category in ('project-submission', 'roof-measurement', 'other')),
  filename        text not null,
  storage_path    text not null,
  project_id      uuid,
  address         text,
  uploaded_by     text not null default 'system' check (uploaded_by in ('system', 'homeowner', 'vendor')),
  vendor_id       uuid references public.profiles(id) on delete set null,
  size_bytes      integer,
  mime_type       text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_homeowner_documents_homeowner
  on public.homeowner_documents (homeowner_id);
create index if not exists idx_homeowner_documents_homeowner_project
  on public.homeowner_documents (homeowner_id, project_id);
create index if not exists idx_homeowner_documents_homeowner_address
  on public.homeowner_documents (homeowner_id, address);
create index if not exists idx_homeowner_documents_vendor
  on public.homeowner_documents (vendor_id) where vendor_id is not null;

alter table public.homeowner_documents enable row level security;

create policy "Homeowners select own documents"
  on public.homeowner_documents for select
  using (homeowner_id = auth.uid());

create policy "Homeowners insert own documents"
  on public.homeowner_documents for insert
  with check (homeowner_id = auth.uid());

create policy "Homeowners update own documents"
  on public.homeowner_documents for update
  using (homeowner_id = auth.uid());

create policy "Homeowners delete own documents"
  on public.homeowner_documents for delete
  using (homeowner_id = auth.uid());

create policy "Vendors select assigned homeowner documents"
  on public.homeowner_documents for select
  using (vendor_id = auth.uid());

create policy "Admins manage all homeowner documents"
  on public.homeowner_documents for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- ───────────────────────────────────────────────────────────────────
-- (3) Storage bucket + RLS — applied via Mgmt API at ship time.
-- Captured here for reproducibility on env re-applies; the bucket and
-- storage.objects policies are also live on apex (verified via curl).
-- ───────────────────────────────────────────────────────────────────
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
--   values ('homeowner-documents', 'homeowner-documents', false, 10485760,
--           array['application/pdf', 'image/jpeg', 'image/png']);
--
-- storage.objects policies (folder convention: {homeowner_id}/{doc_id}.<ext>):
--   - "Homeowners {select|insert|update|delete} own documents"
--       bucket_id = 'homeowner-documents' AND
--       (storage.foldername(name))[1] = auth.uid()::text
--   - "Vendors select assigned homeowner documents storage"
--       bucket_id = 'homeowner-documents' AND
--       exists (select 1 from public.homeowner_documents hd
--               where hd.storage_path = name and hd.vendor_id = auth.uid())
--   - "Admins manage all homeowner documents"
--       bucket_id = 'homeowner-documents' AND admin-role check
