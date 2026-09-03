-- 129_vendor_availability.sql
-- task_791 — real contractor availability. Replaces src/lib/mock-data.ts
-- generateAvailableSlots() which manufactures today+3..today+14 client-side
-- for every homeowner, so every homeowner sees the same 12 rolling dates
-- regardless of contractor. Go-live blocker.
--
-- Shape decisions (kratos rulings on draft v1 open questions):
--   Q1 profiles.timezone = net-new column (0 hits in schema, kratos-verified).
--   Q2 DOW = ISO 8601 (1=Mon..7=Sun) with CHECK 1..7. Reason: JS getDay
--      returns 0 for Sunday, so an unconverted frontend value hits the CHECK
--      and FAILS LOUD instead of silently shifting every day by one under a
--      0..6 scheme. Conversion boundary is exactly one call-site in the
--      contractor availability form (see task_791 item 3); named there.
--   Q3 slot_length_min = per-schedule-row with a vendor-level default column.
--      A vendor running 30-min consults and 4-hour installs needs both.
--   Q4 hold expiry = PREDICATE, no cron. Correctness must not depend on a
--      session-scoped cron having fired (documented fleet cron-loss across
--      recycles, kratos ruling on Q4).
--   Q5 next migration slot = 129.
--   Q6 backfill UI ownership = kratos assigns post-merge (iris + one other).
--
-- ONE TRAP CALLED OUT — apollo PR588 review note 3:
--   booking-calendar.tsx pickInitialViewDate() picks earliest slot via
--   `s.date < min` string compare on YYYY-MM-DD. Total-ordered by
--   coincidence of format, enforced by NEITHER types NOR zod, safe only
--   because the mock is the sole source. Wiring real availability breaks
--   this SILENTLY — no exception, no error, just wrong "earliest slot".
--   Fix at the boundary the migration owns: the SECURITY DEFINER function
--   vendor_availability_slots() returns slot_start_at::timestamptz and
--   ORDER BY slot_start_at ASC. Downstream must consume ordered arrays or
--   min() on timestamp getTime(), never string compare on projected dates.
--   task_791 item (4) rewire brief (helios): booking-calendar.tsx
--   pickInitialViewDate rewrites to `slots[0].slot_start_at` (already
--   sorted) — no min() at all. Legacy `s.date` projection stays available
--   for row-render but MUST NOT be used for ordering.

-- ─── profiles.timezone (net-new per kratos Q1) ────────────────────────
alter table public.profiles
  add column if not exists timezone text;

alter table public.profiles
  add constraint profiles_timezone_shape
    check (timezone is null or (length(timezone) between 3 and 64
                                and timezone ~ '^[A-Za-z_+\-/0-9]+$'));

comment on column public.profiles.timezone is
  'IANA zone (e.g. America/New_York). Null = homeowner default at read time. '
  'Contractor scheduling reads this as the interpretation zone for '
  'vendor_schedule.start_minute / end_minute.';

-- ─── vendor_schedule (recurring weekly hours) ─────────────────────────
create table public.vendor_schedule (
  id                uuid primary key default gen_random_uuid(),
  vendor_id         uuid not null references public.profiles(id) on delete cascade,
  day_of_week       smallint not null check (day_of_week between 1 and 7),  -- ISO 8601: 1=Mon..7=Sun
  start_minute      smallint not null check (start_minute between 0 and 1440),
  end_minute        smallint not null check (end_minute   between 0 and 1440),
  slot_length_min   smallint not null default 60
                      check (slot_length_min in (15, 30, 60, 90, 120)),
  effective_from    date,   -- null = always
  effective_until   date,   -- null = indefinite
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint vendor_schedule_window_ordered check (end_minute > start_minute),
  constraint vendor_schedule_effective_ordered
    check (effective_until is null or effective_from is null
           or effective_until >= effective_from)
);

create index vendor_schedule_vendor_dow_idx
  on public.vendor_schedule (vendor_id, day_of_week);

-- No unique (vendor_id, day_of_week) — a vendor may split "9-12, 14-17"
-- into two rows on the same DOW.

comment on table public.vendor_schedule is
  'Recurring weekly availability windows per contractor, per DOW. '
  'Availability at read time = this table minus vendor_schedule_exception '
  'minus vendor_appointment overlaps. Never materialized.';

-- Vendor-level default slot length (kratos Q3 "with a vendor-level default").
-- Consulted by the availability function when creating a schedule row via
-- UI that does not name a slot length; the column above still overrides.
alter table public.profiles
  add column if not exists default_slot_length_min smallint
    check (default_slot_length_min is null
           or default_slot_length_min in (15, 30, 60, 90, 120));

-- ─── vendor_schedule_exception (one-off PTO / holiday / half-day) ─────
create table public.vendor_schedule_exception (
  id                uuid primary key default gen_random_uuid(),
  vendor_id         uuid not null references public.profiles(id) on delete cascade,
  starts_on         date not null,
  ends_on           date not null,
  -- Intra-day window: both null = whole-day off across range.
  -- Both set = window off within each day of the range.
  start_minute      smallint check (start_minute between 0 and 1440),
  end_minute        smallint check (end_minute   between 0 and 1440),
  reason            text,   -- 'pto' | 'holiday' | 'sick' | free-form; not enforced
  created_at        timestamptz not null default now(),
  constraint exception_range_ordered check (ends_on >= starts_on),
  constraint exception_intraday_both_or_neither
    check ((start_minute is null) = (end_minute is null)),
  constraint exception_intraday_ordered
    check (start_minute is null or end_minute > start_minute)
);

create index vendor_schedule_exception_lookup_idx
  on public.vendor_schedule_exception
    using gist (vendor_id, daterange(starts_on, ends_on, '[]'));

comment on table public.vendor_schedule_exception is
  'One-off unavailability windows (PTO, holidays, sick, half-days). '
  'daterange(starts_on, ends_on, ''[]'') is inclusive-inclusive on the date.';

-- ─── vendor_appointment (booked / held / vendor-blocked) ──────────────
create type public.vendor_appointment_kind
  as enum ('booked', 'homeowner_hold', 'vendor_block');

create table public.vendor_appointment (
  id                uuid primary key default gen_random_uuid(),
  vendor_id         uuid not null references public.profiles(id) on delete restrict,
  homeowner_id      uuid references public.profiles(id) on delete set null,
  -- text (not uuid) to match reschedule_requests.lead_id — accepts MOCK
  -- lead IDs (L-0001) so this table is not the reason a booking cannot
  -- persist for the mock-lead flow.
  lead_id           text,
  kind              public.vendor_appointment_kind not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  -- Only meaningful for kind='homeowner_hold'. Expiry is a PREDICATE
  -- (kratos Q4 ruling): a hold blocks availability only while
  -- hold_expires_at > now(). NO CRON reclaims stale rows; the availability
  -- function filters them at query time. Rows stay for audit.
  hold_expires_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint appointment_window_ordered check (ends_at > starts_at),
  constraint hold_expiry_only_for_holds
    check ((hold_expires_at is null) = (kind <> 'homeowner_hold'))
);

create index vendor_appointment_vendor_range_idx
  on public.vendor_appointment
    using gist (vendor_id, tstzrange(starts_at, ends_at, '[)'));

-- Overlap exclusion — a vendor cannot have two overlapping appointments,
-- EXCEPT expired holds (which no longer block per Q4 predicate).
alter table public.vendor_appointment
  add constraint vendor_appointment_no_overlap
    exclude using gist (
      vendor_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (kind <> 'homeowner_hold' or hold_expires_at > now());

comment on table public.vendor_appointment is
  'Concrete booked / held / vendor-blocked windows for a contractor. '
  'kind=homeowner_hold rows carry hold_expires_at; the availability '
  'function ignores them once expired (predicate, not cron).';

-- ─── updated_at auto-stamp triggers (function from migration 011) ─────
create trigger vendor_schedule_updated_at
  before update on public.vendor_schedule
  for each row execute function update_updated_at();

create trigger vendor_appointment_updated_at
  before update on public.vendor_appointment
  for each row execute function update_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────
alter table public.vendor_schedule            enable row level security;
alter table public.vendor_schedule_exception  enable row level security;
alter table public.vendor_appointment         enable row level security;

-- vendor_schedule + vendor_schedule_exception: vendor read/write own; admin all;
--   NO homeowner select. Homeowner reaches availability via the SECURITY
--   DEFINER function below.

create policy "Vendors read own schedule"
  on public.vendor_schedule for select using (auth.uid() = vendor_id);
create policy "Vendors write own schedule"
  on public.vendor_schedule for all
  using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);
create policy "Admins manage all schedules"
  on public.vendor_schedule for all
  using (exists (select 1 from public.profiles
                  where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Vendors read own exceptions"
  on public.vendor_schedule_exception for select using (auth.uid() = vendor_id);
create policy "Vendors write own exceptions"
  on public.vendor_schedule_exception for all
  using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);
create policy "Admins manage all exceptions"
  on public.vendor_schedule_exception for all
  using (exists (select 1 from public.profiles
                  where profiles.id = auth.uid() and profiles.role = 'admin'));

-- vendor_appointment: vendor read+write own; homeowner read own; admin all.
create policy "Vendors read own appointments"
  on public.vendor_appointment for select using (auth.uid() = vendor_id);
create policy "Vendors write own appointments"
  on public.vendor_appointment for all
  using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);
create policy "Homeowners read own appointments"
  on public.vendor_appointment for select using (auth.uid() = homeowner_id);
create policy "Homeowners insert own holds"
  on public.vendor_appointment for insert
  with check (auth.uid() = homeowner_id and kind = 'homeowner_hold');
create policy "Admins manage all appointments"
  on public.vendor_appointment for all
  using (exists (select 1 from public.profiles
                  where profiles.id = auth.uid() and profiles.role = 'admin'));

-- ─── vendor_availability_slots(...) SECURITY DEFINER function ─────────
-- Homeowner-facing read surface. Returns timestamptz slot bounds ordered
-- ASC — the ORDER BY here is the load-bearing defense against apollo
-- PR588 note 3. Downstream must NOT re-sort via string projection.

create or replace function public.vendor_availability_slots(
  p_vendor_id  uuid,
  p_from_date  date,
  p_to_date    date
) returns table (
  slot_start_at   timestamptz,
  slot_end_at     timestamptz,
  slot_date       date          -- projection for legacy row-render ONLY, NOT for ordering
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_tz text;
begin
  if p_to_date < p_from_date then
    raise exception 'vendor_availability_slots: p_to_date < p_from_date';
  end if;
  if (p_to_date - p_from_date) > 90 then
    raise exception 'vendor_availability_slots: range > 90 days';
  end if;

  select coalesce(profiles.timezone, 'America/New_York')
    into v_tz
    from public.profiles
   where profiles.id = p_vendor_id;

  if v_tz is null then
    raise exception 'vendor_availability_slots: vendor % not found', p_vendor_id;
  end if;

  return query
  with days as (
    select d::date as day,
           extract(isodow from d)::smallint as dow  -- ISO 1=Mon..7=Sun (Q2)
      from generate_series(p_from_date, p_to_date, interval '1 day') as g(d)
  ),
  raw_slots as (
    select
      d.day,
      s.slot_length_min,
      (d.day + (s.start_minute * interval '1 minute')) at time zone v_tz as day_start,
      (d.day + (s.end_minute   * interval '1 minute')) at time zone v_tz as day_end
    from days d
    join public.vendor_schedule s
      on s.vendor_id = p_vendor_id
     and s.day_of_week = d.dow
     and (s.effective_from  is null or s.effective_from  <= d.day)
     and (s.effective_until is null or s.effective_until >= d.day)
  ),
  expanded as (
    select
      r.day,
      gs as slot_start_at,
      gs + (r.slot_length_min * interval '1 minute') as slot_end_at
    from raw_slots r,
      lateral generate_series(
        r.day_start,
        r.day_end - (r.slot_length_min * interval '1 minute'),
        (r.slot_length_min * interval '1 minute')
      ) as gs
  )
  select
    e.slot_start_at,
    e.slot_end_at,
    e.day as slot_date
  from expanded e
  where not exists (
    -- exception window overlap
    select 1 from public.vendor_schedule_exception ex
     where ex.vendor_id = p_vendor_id
       and daterange(ex.starts_on, ex.ends_on, '[]') @> e.day
       and (
         ex.start_minute is null  -- whole-day exception
         or tstzrange(
              (e.day + (ex.start_minute * interval '1 minute')) at time zone v_tz,
              (e.day + (ex.end_minute   * interval '1 minute')) at time zone v_tz,
              '[)'
            ) && tstzrange(e.slot_start_at, e.slot_end_at, '[)')
       )
  )
  and not exists (
    -- appointment overlap (respects Q4 hold-expiry predicate)
    select 1 from public.vendor_appointment ap
     where ap.vendor_id = p_vendor_id
       and (ap.kind <> 'homeowner_hold' or ap.hold_expires_at > now())
       and tstzrange(ap.starts_at, ap.ends_at, '[)')
           && tstzrange(e.slot_start_at, e.slot_end_at, '[)')
  )
  order by e.slot_start_at asc;  -- ← LOAD-BEARING per apollo PR588 note 3
end;
$$;

comment on function public.vendor_availability_slots(uuid, date, date) is
  'Homeowner-facing availability read. Returns timestamptz slot bounds '
  'ordered ASC. Downstream MUST consume this order or min() on '
  'slot_start_at.getTime(); MUST NOT sort or min() on slot_date (see '
  'apollo PR588 note 3 — YYYY-MM-DD lex-order invariant is enforced by '
  'neither types nor zod and breaks silently on wire-up).';

revoke all on function public.vendor_availability_slots(uuid, date, date) from public;
grant execute on function public.vendor_availability_slots(uuid, date, date)
  to authenticated;
