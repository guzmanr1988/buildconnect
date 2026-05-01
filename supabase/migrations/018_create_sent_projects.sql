-- 018_create_sent_projects.sql
-- Surface 2: homeowner → vendor project/lead pipeline
--
-- Maps from zustand projects-store (persist key: buildconnect-projects).
-- SentProject entity + all overlay-map state flattened into columns.
-- MOCK_LEADS continue as local-only fixtures and are NOT migrated here.
-- Persist key must be bumped to buildconnect-projects-v2 at deploy time
-- (helios concern) to prevent stale localStorage bleeding into server reads.

create table if not exists public.sent_projects (
  id                      uuid primary key default gen_random_uuid(),

  -- Party FKs (stable cross-surface join keys; power RLS + vendor/homeowner reads)
  homeowner_id            uuid not null references public.profiles(id) on delete cascade,
  vendor_id               uuid not null references public.profiles(id) on delete restrict,

  -- Item snapshot (CartItem — frozen at sendProject per immutable-ledger-freeze-at-write)
  item                    jsonb not null,

  -- Contractor snapshot (ContractorInfo — frozen at booking per Ship #355)
  contractor              jsonb not null,

  -- Booking slot (top-level columns; also inside booking JSONB in store — promoted for indexing)
  booking_date            text not null,
  booking_time            text not null,

  -- Homeowner contact snapshot (frozen at sendProject time for audit trail)
  homeowner_name          text,
  homeowner_phone         text,
  homeowner_email         text,
  homeowner_address       text,

  -- Core status (chain — matches SentProject.status in store)
  status                  text not null default 'pending'
                            check (status in ('pending', 'approved', 'declined', 'sold')),

  -- Timeline stamps
  sent_at                 timestamptz not null default now(),
  confirmed_at            timestamptz,
  sold_at                 timestamptz,
  completed_at            timestamptz,        -- manual vendor completion (Ship #295)

  -- Financial (frozen at markSold time)
  sale_amount             numeric,
  quoted_price_cents      integer,            -- homeowner-visible price at booking (Ship #355)

  -- Price breakdown snapshot (frozen at sendProject per immutable-ledger-freeze-at-write)
  price_line_items        jsonb,

  -- Identity document upload (base64 data URL for Surface 2; Supabase Storage path in Tranche-3)
  id_document             text,

  -- Rejection
  rejection_reason        text,

  -- Admin contract review (Ship #314)
  review_status           text check (review_status in ('pending', 'approved', 'flagged')),
  reviewed_at             timestamptz,
  reviewed_by             uuid references public.profiles(id) on delete set null,
  review_note             text,

  -- Field rep assignment
  -- assigned_rep: VendorRep JSONB snapshot (display fields — name, role, phone, email)
  -- account_rep_id: profile.id FK used for RLS scoping (rep READ filtered to assigned-only)
  assigned_rep            jsonb,
  rep_assigned_at         timestamptz,
  rep_acceptance          text check (rep_acceptance in ('pending', 'accepted', 'reschedule_requested')),
  account_rep_id          uuid references public.profiles(id) on delete set null,

  -- Cancellation request (embedded; one active request per lead per CancellationRequest shape)
  -- { requestedAt, status: 'pending'|'approved'|'denied', reason?, explanation? }
  cancellation_request    jsonb,

  -- Reschedule request (embedded; active negotiation — last requestReschedule wins)
  -- { requestedBy, requestedAt, proposedDate, proposedTime, originalDate, originalTime,
  --   status: 'pending'|'approved'|'rejected', reason?, resolvedAt? }
  reschedule_request      jsonb,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Indexes for primary read paths
create index on public.sent_projects (homeowner_id);
create index on public.sent_projects (vendor_id);
create index on public.sent_projects (account_rep_id) where account_rep_id is not null;
create index on public.sent_projects (review_status)  where review_status is not null;
create index on public.sent_projects (status);

-- RLS
alter table public.sent_projects enable row level security;

-- Homeowner: full CRUD on own projects
create policy "Homeowners read own sent projects"
  on public.sent_projects for select
  using (auth.uid() = homeowner_id);

create policy "Homeowners insert own sent projects"
  on public.sent_projects for insert
  with check (auth.uid() = homeowner_id);

create policy "Homeowners update own sent projects"
  on public.sent_projects for update
  using (auth.uid() = homeowner_id);

-- Vendor: read + update leads in their book (no insert — homeowner creates the row)
create policy "Vendors read assigned leads"
  on public.sent_projects for select
  using (auth.uid() = vendor_id);

create policy "Vendors update assigned leads"
  on public.sent_projects for update
  using (auth.uid() = vendor_id);

-- Account rep: read-only, assigned leads only
-- (rep-architecture: READ scoped to assigned-only; WRITE recorded as vendor with rep metadata)
create policy "Reps read assigned leads"
  on public.sent_projects for select
  using (auth.uid() = account_rep_id);

-- Admin: full access across all rows
create policy "Admins manage all sent projects"
  on public.sent_projects for all
  using (
    exists (
      select 1 from public.profiles
       where profiles.id = auth.uid()
         and profiles.role = 'admin'
    )
  );

-- updated_at auto-stamp (reuses function defined in migration 012)
create trigger sent_projects_updated_at
  before update on public.sent_projects
  for each row execute function update_updated_at();
