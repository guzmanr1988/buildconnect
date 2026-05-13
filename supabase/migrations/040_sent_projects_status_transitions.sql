-- 040_sent_projects_status_transitions.sql
-- task_1778632251533_805 — vendor lead-status transition wiring
--
-- Adds the 'expired' status to sent_projects, a partial sent_at index for
-- pending rows, and a pg_cron job that auto-expires stale pending rows
-- every 5 minutes (computed on the fly as sent_at + 24h < now()). Accept/reject transitions are driven by the Edge Function
-- transition-lead-status (vendor-side); the cron path handles the silent
-- auto-expire (no homeowner notification per shared-notification spec
-- with hermes migration 039).
--
-- Status state-machine after this migration:
--   pending → approved | declined | expired
--   approved → sold (via existing close-sale path)
--   declined → terminal (re-route flag-gated; LEAD_AUTOROUTE_ENABLED off tonight)
--   expired  → terminal (re-route flag-gated; LEAD_AUTOROUTE_ENABLED off tonight)
--   sold     → terminal
--
-- Bridge to legacy leads table (text PK L-XXXX) deferred per kratos directive.

-- (1) Extend status CHECK constraint to allow 'expired'.
alter table public.sent_projects
  drop constraint if exists sent_projects_status_check;

alter table public.sent_projects
  add constraint sent_projects_status_check
  check (status in ('pending', 'approved', 'declined', 'sold', 'expired'));

-- (2) Partial index on sent_at for the cron expiry query. Generated
-- expires_at column was tried but rejected (42P17: timestamptz + interval
-- is not immutable due to TZ/DST rules). Cron computes sent_at + 24h
-- on the fly; the partial index keeps the working set tight (only
-- pending rows are candidates for expiry).
create index if not exists idx_sent_projects_pending_sent_at
  on public.sent_projects (sent_at)
  where status = 'pending';

-- (4) pg_cron extension (Supabase-managed; may need one-shot dashboard
-- enable if this errors — kratos has the one-shot escalation path).
create extension if not exists pg_cron;

-- (5) Schedule: every 5 min, mark stale pending rows as expired. Silent
-- transition — no notification fired here per the shared-notification spec.
-- Re-route logic on reject/expire is server-side, flag-gated by the
-- transition-lead-status Edge Function reading LEAD_AUTOROUTE_ENABLED.
select cron.schedule(
  'expire-stale-sent-projects',
  '*/5 * * * *',
  $$
    update public.sent_projects
       set status = 'expired'
     where status = 'pending'
       and sent_at + interval '24 hours' < now()
  $$
);
