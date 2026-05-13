-- 039_create_notifications_test.sql
-- task_1778632248579_013 (overnight vendor SMS/email new-lead notification, flag-off)
-- + task_1778632251533_805 (phaethon lead-status transitions homeowner-notify on accept)
--
-- Shared notification plumbing for BOTH the vendor-new-lead path (hermes) and
-- the homeowner-notify-on-accept path (phaethon). Single generic table so
-- recipient_type and event_type discriminate; channel + event_type per row.
--
-- Test-table semantics: every payload writes here regardless of flag state.
-- When VENDOR_NOTIF_ENABLED / HOMEOWNER_NOTIF_ENABLED flip to true the Edge
-- Function fires the real provider (Twilio for sms, Resend for email) AND
-- updates the row's status field. Until then status stays 'test' — Rod
-- inspects this table in the morning to verify payload shape before flipping.
--
-- Idempotency: unique (lead_id, recipient_type, channel, event_type) — a
-- retry of the same notification deduplicates. Distinct event_types on the
-- same lead (new_lead vs lead_accepted) coexist on the same lead row.

create table if not exists public.notifications_test (
  id              uuid primary key default gen_random_uuid(),

  -- Lead identifier — sent_projects.id (uuid per migration 018).
  lead_id         uuid not null,

  -- Who receives this notification.
  recipient_type  text not null check (recipient_type in ('vendor', 'homeowner')),
  recipient_id    uuid not null references public.profiles(id) on delete cascade,

  -- Delivery channel.
  channel         text not null check (channel in ('sms', 'email')),

  -- Domain event that triggered this notification. Open string so new
  -- event_types can be added without DDL — first users: 'new_lead' (hermes),
  -- 'lead_accepted' / 'lead_rejected' (phaethon).
  event_type      text not null,

  -- Full payload: {to, body, subject?, html?, lead_summary, ...}
  payload         jsonb not null,

  -- Lifecycle: starts 'test' (default), flips to 'queued' on real-fire
  -- dispatch, then 'sent' or 'failed' from provider callback.
  status          text not null default 'test'
                    check (status in ('test', 'queued', 'sent', 'failed')),
  error_msg       text,

  created_at      timestamptz not null default now()
);

-- Idempotency gate: a second invocation for the same (lead, recipient_type,
-- channel, event_type) tuple is a no-op insert.
create unique index if not exists notifications_test_dedupe_uniq
  on public.notifications_test (lead_id, recipient_type, channel, event_type);

-- Indexes for the morning-review queries (filter by recipient + event + time).
create index if not exists notifications_test_recipient_id_idx
  on public.notifications_test (recipient_id, created_at desc);
create index if not exists notifications_test_lead_id_idx
  on public.notifications_test (lead_id, created_at desc);
create index if not exists notifications_test_event_type_idx
  on public.notifications_test (event_type, created_at desc);

alter table public.notifications_test enable row level security;

-- Edge Function uses service_role; bypasses RLS automatically. This policy
-- is the explicit declaration for clarity + audit-grep matches.
create policy "service_role_all"
  on public.notifications_test
  for all
  using (auth.role() = 'service_role');

-- Admins (Rod) read in the morning review via SQL Editor or admin dashboard.
-- No write policy for admins — only the Edge Function writes here.
create policy "admin_read"
  on public.notifications_test
  for select
  using (
    exists (
      select 1 from public.profiles
       where profiles.id = auth.uid()
         and profiles.role = 'admin'
    )
  );

-- Defense-in-depth on the table grants. Supabase auto-grants on public schema
-- tables include anon/authenticated SELECT/INSERT/UPDATE/DELETE; RLS already
-- denies via no-matching-policy, but explicit revoke removes the
-- attack-surface of a future policy bug. service_role bypasses RLS and table
-- grants entirely.
revoke all on table public.notifications_test from anon, authenticated;
