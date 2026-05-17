-- 048_admin_financing_surface.sql
-- Admin Financing Phase 1 surface: lenders registry, feature_flags, audit_log.
-- Additive + idempotent. Drop-safe per _deleted_pre_launch_YYYY_MM_DD convention.
-- Single admin role; RLS = role-boundary only (no intra-role split).

-- 1. Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lender_category') then
    create type lender_category as enum (
      'contractor_pos',
      'personal_loans',
      'solar_hi_specialty'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'audit_action') then
    create type audit_action as enum (
      'insert', 'update', 'delete', 'toggle', 'login', 'export'
    );
  end if;
end$$;

-- 2. lenders (33-row registry seeded via 049_lenders_seed.sql)
create table if not exists public.lenders (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category        lender_category not null,
  contact_email   text,
  notes           text,
  sort_order      integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create unique index if not exists lenders_name_unique
  on public.lenders (lower(name)) where deleted_at is null;
create index if not exists lenders_category
  on public.lenders (category) where deleted_at is null;
create index if not exists lenders_active
  on public.lenders (active) where deleted_at is null;

-- 3. feature_flags (DB-driven runtime, replaces VITE_FINANCING_ENABLED for master)
create table if not exists public.feature_flags (
  key             text primary key,
  enabled         boolean not null,
  description     text,
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now()
);

insert into public.feature_flags (key, enabled, description)
values ('financing_enabled', true, 'Master switch for all financing UI + Edge-Fns. OFF = card hidden globally.')
on conflict (key) do nothing;

-- 4. audit_log (shared, not financing-specific; text target_id supports composite keys)
create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  ts              timestamptz not null default now(),
  actor_id        uuid references public.profiles(id),
  actor_role      text,
  action          audit_action not null,
  target_table    text not null,
  target_id       text,
  before_json     jsonb,
  after_json      jsonb,
  notes           text
);

create index if not exists audit_log_ts
  on public.audit_log (ts desc);
create index if not exists audit_log_actor
  on public.audit_log (actor_id, ts desc);
create index if not exists audit_log_target
  on public.audit_log (target_table, target_id, ts desc);

-- 5. RLS
alter table public.lenders        enable row level security;
alter table public.feature_flags  enable row level security;
alter table public.audit_log      enable row level security;

-- lenders: read = any authenticated; write = admin only
drop policy if exists lenders_select_authenticated on public.lenders;
create policy lenders_select_authenticated on public.lenders
  for select using (auth.role() = 'authenticated');

drop policy if exists lenders_write_admin on public.lenders;
create policy lenders_write_admin on public.lenders
  for all
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- feature_flags: read = any authenticated; write (update) = admin only
drop policy if exists ff_select_authenticated on public.feature_flags;
create policy ff_select_authenticated on public.feature_flags
  for select using (auth.role() = 'authenticated');

drop policy if exists ff_write_admin on public.feature_flags;
create policy ff_write_admin on public.feature_flags
  for update
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- audit_log: read = admin only; write = service_role only (no INSERT/UPDATE/DELETE policy)
drop policy if exists audit_select_admin on public.audit_log;
create policy audit_select_admin on public.audit_log
  for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 6. updated_at trigger (security definer, search_path = public per hardening rule)
create or replace function public.set_updated_at_secure()
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

revoke execute on function public.set_updated_at_secure() from public;
revoke execute on function public.set_updated_at_secure() from anon, authenticated;
grant  execute on function public.set_updated_at_secure() to service_role;

drop trigger if exists lenders_set_updated_at on public.lenders;
create trigger lenders_set_updated_at
  before update on public.lenders
  for each row execute function public.set_updated_at_secure();

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at_secure();
