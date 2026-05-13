-- 040_sent_projects_status_transitions.sql
-- task_1778632251533_805 — vendor lead-status transition wiring
--
-- Adds the 'expired' status to sent_projects, a generated expires_at column
-- (sent_at + 24h), and a pg_cron job that auto-expires stale pending rows
-- every 5 minutes. Accept/reject transitions are driven by the Edge Function
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

-- (2) Generated expires_at column (24h TTL from sent_at). Stored so the
-- cron index is usable without recomputation per row.
alter table public.sent_projects
  add column if not exists expires_at timestamptz
  generated always as (sent_at + interval '24 hours') stored;

-- (3) Index for the cron query: only pending rows are candidates for
-- expiry; partial index keeps the working set tight as table grows.
create index if not exists idx_sent_projects_pending_expiry
  on public.sent_projects (expires_at)
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
       and expires_at < now()
  $$
);
