-- 047_financing_core_tables.sql
-- Phase-2 financing-core: 4 new tables (additive, drop-safe per (j.3)/(j.6)).
-- Rod 2026-05-16T21:50Z 'do all now' directive — kratos parallelized
-- implementation kickoff; hephaestus owns schema, hermes owns adapter scaffolding.
-- Reference: docs/financing-architecture.md @ personal/hermes/financing-arch-spike
--            commit 0ab4e0c — sections (a)/(c.1)/(d)/(g)/(h)/(j.3).
--
-- HERMES COORD-LOCK 2026-05-16T22:0XZ (msg 1778968611618-hermes-obqjz):
--   (1) source enum drops 'stub', defaults 'self_attest'; last_known_status
--       aligned to financing_status_v1 enum
--   (2) financing_application_status REDUCED to 7-value lowercase v1 subset
--       (post-launch enum-extend for ENVELOPE_READY/VENDOR_QUOTED/etc.)
--   (3) commission_ledger IMMUTABLE-LEDGER per feedback_immutable_ledger_freeze_at_write
--       — no updated_at, no UPDATE policy, new row per state transition;
--       vendor_id denormalized from sent_projects.vendor_id
--   (4) all money fields → *_cents integer (no floating-point money);
--       apr_bps already basis-points int
--
-- INVARIANTS (load-bearing):
--   (1) ALL NEW tables. Zero ALTER on existing core (profiles/leads/sent_projects/etc).
--   (2) FK direction one-way: financing_* -> core (profiles/leads/sent_projects).
--       NEVER core -> financing_*. Preserves drop-safe rollback per (j.3)/(j.6).
--   (3) RLS per banked feedback_widen_reads_narrow_writes:
--         - financing_applications: customer reads own; vendor reads where
--           vendor_id matches AND status in ('approved','terms_accepted');
--           admin all; service_role full.
--         - financing_approvals: service_role only (credit data private).
--         - customer_financing_profile: customer reads own; admin all; service_role full.
--         - commission_ledger: admin + service_role only
--           (vendor never sees commission, per project_buildconnect_vendor_compensation_private).
--   (4) SECURITY DEFINER trigger fns SET search_path = public per banked
--       feedback_supabase_security_definer_search_path.
--   (5) Soft-rollback path: FINANCING_ENABLED=false + UI hide + Edge-Fn pause.
--       Tables remain populated for audit retention. Hard uninstall per (j.8) playbook
--       uses _deleted_pre_launch_YYYY_MM_DD suffix-rename
--       per reference_buildconnect_pre_launch_snapshot_pattern.

-- ───────────────────────────────────────────────────────────────────
-- Shared status enum: financing_status_v1
-- Used by customer_financing_profile.last_known_status and as the
-- aligned-vocabulary source for financing_applications.status.
-- ───────────────────────────────────────────────────────────────────
create type financing_status_v1 as enum (
  'pending',
  'applied',
  'approved',
  'denied',
  'expired'
);

-- ───────────────────────────────────────────────────────────────────
-- (1) financing_applications — one row per customer financing submission.
--     FK: homeowner_id -> profiles(id); lead_id -> leads(id) NULL;
--         project_id -> sent_projects(id) NULL (populated at envelope stage).
--     status: 7-value v1 lowercase subset per hermes delta 2.
--     Post-launch enum-extend (ENVELOPE_READY/VENDOR_QUOTED/CUSTOMER_REVIEWING/
--     DP_PAID/MILESTONE_N_RELEASED/FINAL_RELEASED/DISPUTED/REFUNDED) lands in
--     a follow-up migration once those state transitions are wired.
-- ───────────────────────────────────────────────────────────────────
create type financing_application_status as enum (
  'pending',
  'applied',
  'approved',
  'denied',
  'expired',
  'terms_accepted',
  'cancelled'
);

create table if not exists public.financing_applications (
  id                       uuid primary key default gen_random_uuid(),

  -- Party FKs (one-way refs into core; never the other direction).
  homeowner_id             uuid not null references public.profiles(id) on delete cascade,
  lead_id                  text references public.leads(id) on delete set null,
  project_id               uuid references public.sent_projects(id) on delete set null,

  -- Adapter identifiers (per FinancingBankAdapter contract section (a)).
  adapter                  text not null,
  adapter_application_id   text,

  -- State machine (7-value v1 subset).
  status                   financing_application_status not null default 'applied',

  -- TTL for auto-expire pg_cron sweep (section (c.1) applied -> expired).
  ttl_days                 integer not null default 14,

  -- Lifecycle timestamps.
  applied_at               timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_financing_applications_homeowner
  on public.financing_applications (homeowner_id);
create index if not exists idx_financing_applications_lead
  on public.financing_applications (lead_id)
  where lead_id is not null;
create index if not exists idx_financing_applications_project
  on public.financing_applications (project_id)
  where project_id is not null;
create index if not exists idx_financing_applications_status
  on public.financing_applications (status);
create index if not exists idx_financing_applications_adapter_app_id
  on public.financing_applications (adapter_application_id)
  where adapter_application_id is not null;

alter table public.financing_applications enable row level security;

create policy "fa_select_homeowner_own"
  on public.financing_applications for select
  using (homeowner_id = auth.uid());

create policy "fa_select_vendor_envelope_ready"
  on public.financing_applications for select
  using (
    project_id is not null
    and exists (
      select 1 from public.sent_projects sp
      where sp.id = financing_applications.project_id
        and sp.vendor_id = auth.uid()
    )
    and status in ('approved', 'terms_accepted')
  );

create policy "fa_select_admin_all"
  on public.financing_applications for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "fa_insert_homeowner_own"
  on public.financing_applications for insert
  with check (homeowner_id = auth.uid() and status = 'applied');

create policy "fa_update_admin"
  on public.financing_applications for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create or replace function public.financing_applications_set_updated_at()
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

drop trigger if exists trg_financing_applications_updated_at on public.financing_applications;
create trigger trg_financing_applications_updated_at
  before update on public.financing_applications
  for each row execute function public.financing_applications_set_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- (2) financing_approvals — one row per partner-returned decision.
--     RLS: service_role only (envelope/credit data private per section (c.1)).
--     Money fields are *_cents integers per hermes delta 4
--     (no floating-point money; APR in basis points).
-- ───────────────────────────────────────────────────────────────────
create type financing_approval_status as enum ('approved', 'denied');

create table if not exists public.financing_approvals (
  id                       uuid primary key default gen_random_uuid(),
  financing_application_id uuid not null references public.financing_applications(id) on delete cascade,

  status                   financing_approval_status not null,

  -- Envelope (approved path) — all money as integer cents.
  envelope_amount_cents    integer,
  dp_amount_cents          integer,
  term_months              integer,
  apr_bps                  integer,                 -- basis points; 1500 = 15.00% APR
  expires_at               timestamptz,
  letter_url               text,                    -- Supabase Storage homeowner-documents bucket path

  -- Denial path.
  denial_reason_code       text,
  denial_reason_text       text,

  created_at               timestamptz not null default now()
);

create index if not exists idx_financing_approvals_application
  on public.financing_approvals (financing_application_id);
create index if not exists idx_financing_approvals_status
  on public.financing_approvals (status);

alter table public.financing_approvals enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies for non-service-role.
-- service_role bypasses RLS by default in Supabase, so omitting policies
-- = locked to service_role-only access. Customer reads via materialized
-- customer_financing_profile (below); vendor reads via cap-only join, never directly.

-- ───────────────────────────────────────────────────────────────────
-- (3) customer_financing_profile — D4 separate table per (g)/(j.3).
--     One row per customer (UNIQUE customer_id); last-known approval state.
--     Sourced from adapter webhooks OR customer self-attest path (section (i)).
--     Per hermes delta 1: source enum is {self_attest, adapter} (no stub);
--     last_known_status aligned to financing_status_v1.
-- ───────────────────────────────────────────────────────────────────
create type customer_financing_source as enum ('self_attest', 'adapter');

create table if not exists public.customer_financing_profile (
  id                       uuid primary key default gen_random_uuid(),
  customer_id              uuid not null unique references public.profiles(id) on delete cascade,

  has_financing            boolean not null default false,
  last_known_status        financing_status_v1,
  last_known_amount_cents  integer,
  source                   customer_financing_source not null default 'self_attest',
  approval_partner         text,                    -- Hearth | Acorn | GoodLeap | Sunlight | self_attested
  approval_expires_at      timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_customer_financing_profile_customer
  on public.customer_financing_profile (customer_id);

alter table public.customer_financing_profile enable row level security;

create policy "cfp_select_customer_own"
  on public.customer_financing_profile for select
  using (customer_id = auth.uid());

create policy "cfp_select_admin_all"
  on public.customer_financing_profile for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Vendor cap-only read: vendor sees has_financing + last_known_amount_cents when
-- they are on a project with this customer AND status reaches the envelope stage.
-- Vendor must NOT see source/partner/expires details — those are credit-adjacent.
-- This is enforced as a separate envelope_cap view in a follow-up migration
-- to keep this migration drop-safe (no view = no leak).

-- Writes: service_role only (no INSERT/UPDATE policies for non-service-role).

create or replace function public.customer_financing_profile_set_updated_at()
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

drop trigger if exists trg_customer_financing_profile_updated_at on public.customer_financing_profile;
create trigger trg_customer_financing_profile_updated_at
  before update on public.customer_financing_profile
  for each row execute function public.customer_financing_profile_set_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- (4) commission_ledger — separate pipeline per (j.4). RLS admin+service_role only.
--     IMMUTABLE-LEDGER per feedback_immutable_ledger_freeze_at_write (hermes delta 3):
--       - INSERT-only; new row per state transition (no in-place UPDATE)
--       - no updated_at column, no UPDATE policy, no updated_at trigger
--       - vendor_id denormalized from sent_projects.vendor_id at write time
--     Three trigger points per section (h): reserved -> receivable -> realized.
--     'frozen' state for disputes per (h) refund/dispute path.
--     milestone_id NULL for reserved/receivable; populated at each realized payout.
-- ───────────────────────────────────────────────────────────────────
create type commission_ledger_state as enum (
  'reserved',
  'receivable',
  'realized',
  'frozen'
);

create table if not exists public.commission_ledger (
  id                              uuid primary key default gen_random_uuid(),

  -- FKs into financing-core + core (one-way).
  financing_application_id        uuid not null references public.financing_applications(id) on delete restrict,
  sent_project_id                 uuid references public.sent_projects(id) on delete restrict,

  -- Denormalized vendor (snapshot at write — sent_projects.vendor_id can churn).
  vendor_id                       uuid references public.profiles(id) on delete set null,

  -- Milestone scope. Populated only at realized; NULL for reserved/receivable.
  milestone_id                    text,

  state                           commission_ledger_state not null default 'reserved',

  -- Amounts (all money as integer cents; pct stays numeric).
  envelope_amount_cents           integer,            -- snapshot at reserved
  vendor_commission_pct           numeric(5,4),       -- e.g. 0.0850 = 8.50%
  reserved_commission_amount_cents integer,           -- envelope × pct at reserved
  final_commission_amount_cents   integer,            -- final_project_price × pct at receivable
  net_to_vendor_cents             integer,            -- milestone-net at realized

  created_at                      timestamptz not null default now()
);

create index if not exists idx_commission_ledger_application
  on public.commission_ledger (financing_application_id);
create index if not exists idx_commission_ledger_project
  on public.commission_ledger (sent_project_id);
create index if not exists idx_commission_ledger_vendor
  on public.commission_ledger (vendor_id)
  where vendor_id is not null;
create index if not exists idx_commission_ledger_state
  on public.commission_ledger (state);

alter table public.commission_ledger enable row level security;

create policy "cl_select_admin_all"
  on public.commission_ledger for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Writes: admin OR service_role. No vendor/customer write paths.
-- IMMUTABLE-LEDGER: only INSERT allowed; no UPDATE policy.
create policy "cl_insert_admin"
  on public.commission_ledger for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- No updated_at trigger: ledger rows are immutable; state transitions = new rows.

-- ───────────────────────────────────────────────────────────────────
-- Rollback note (per (j.6) data preservation + (j.8) playbook):
--   Soft-rollback = FINANCING_ENABLED=false + UI hide + Edge-Fn pause.
--     Tables remain populated for audit/legal retention.
--   Hard uninstall (post-audit-window only): suffix-rename to
--     _deleted_pre_launch_YYYY_MM_DD per reference_buildconnect_pre_launch_snapshot_pattern.
-- ───────────────────────────────────────────────────────────────────
