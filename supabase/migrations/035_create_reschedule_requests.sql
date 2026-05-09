-- 035_create_reschedule_requests.sql
-- Athena gap #4 — server-side audit trail for post-approval reschedule negotiations.
--
-- Pre-#034: counter / approve / reject only wrote to zustand-persist (LS) +
-- the embedded sent_projects.reschedule_request JSONB. The JSONB approach
-- works for sent_project-backed leads but only stores the LATEST state;
-- counter-proposals overwrite prior ones with no history. Mock leads (no
-- sent_project row) had nowhere to write at all.
--
-- This table normalizes reschedule_request shape into its own row.
-- Combined with the existing activity_log entries (reschedule_requested /
-- reschedule_resolved), it gives admins a full audit trail of every
-- negotiation event without losing the current-state view.
--
-- Shape mirrors the RescheduleRequest interface in projects-store.ts.
-- lead_id is text (not uuid) so MOCK lead ids (L-0001) write here too;
-- the FK columns (homeowner_id / vendor_id) gate RLS for sent_project-
-- backed leads. Mock leads only persist when an admin acts (via the
-- admin-manage-all policy below).

create table if not exists public.reschedule_requests (
  id              uuid primary key default gen_random_uuid(),

  -- Lead identifier — accepts sent_projects.id::text OR MOCK lead id.
  lead_id         text not null,

  -- Negotiation state (mirrors RescheduleRequest in projects-store.ts).
  requested_by    text not null check (requested_by in ('homeowner', 'vendor', 'rep')),
  requested_at    timestamptz not null default now(),
  proposed_date   text not null,
  proposed_time   text not null,
  original_date   text,
  original_time   text,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  reason          text,
  resolved_at     timestamptz,

  -- Party FKs — RLS scoping. NULL allowed for MOCK leads (admin-only writes).
  homeowner_id    uuid references public.profiles(id) on delete cascade,
  vendor_id       uuid references public.profiles(id) on delete restrict,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One active (pending) row per lead. Resolved rows stay as audit history;
-- a new requestReschedule after approval/rejection inserts a fresh pending
-- row alongside the resolved ones.
create unique index if not exists reschedule_requests_pending_uniq
  on public.reschedule_requests (lead_id) where status = 'pending';

create index if not exists reschedule_requests_lead_id_idx
  on public.reschedule_requests (lead_id);
create index if not exists reschedule_requests_homeowner_id_idx
  on public.reschedule_requests (homeowner_id) where homeowner_id is not null;
create index if not exists reschedule_requests_vendor_id_idx
  on public.reschedule_requests (vendor_id) where vendor_id is not null;

alter table public.reschedule_requests enable row level security;

-- Homeowner: read + write own rows
create policy "Homeowners read own reschedule requests"
  on public.reschedule_requests for select
  using (auth.uid() = homeowner_id);

create policy "Homeowners insert own reschedule requests"
  on public.reschedule_requests for insert
  with check (auth.uid() = homeowner_id);

create policy "Homeowners update own reschedule requests"
  on public.reschedule_requests for update
  using (auth.uid() = homeowner_id);

-- Vendor: read + write own rows
create policy "Vendors read assigned reschedule requests"
  on public.reschedule_requests for select
  using (auth.uid() = vendor_id);

create policy "Vendors insert reschedule requests"
  on public.reschedule_requests for insert
  with check (auth.uid() = vendor_id);

create policy "Vendors update assigned reschedule requests"
  on public.reschedule_requests for update
  using (auth.uid() = vendor_id);

-- Admin: full access
create policy "Admins manage all reschedule requests"
  on public.reschedule_requests for all
  using (
    exists (
      select 1 from public.profiles
       where profiles.id = auth.uid()
         and profiles.role = 'admin'
    )
  );

-- updated_at auto-stamp (reuses function defined in migration 011)
create trigger reschedule_requests_updated_at
  before update on public.reschedule_requests
  for each row execute function update_updated_at();
