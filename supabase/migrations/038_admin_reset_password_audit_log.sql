-- Audit log + rate-limit tracking for the admin reset-password Edge Function
-- (task_1776743274579_661, Tranche-2). Backs the two endpoints:
--   POST /admin/send-reset-link  → supabase.auth.admin.resetPasswordForEmail
--   POST /admin/set-user-password → supabase.auth.admin.updateUserById
--
-- Audit log: append-only, every Edge Function call writes a row BEFORE
-- returning so operator actions are durably traceable. target_user_id is
-- nullable because send-reset-link accepts an email even if the user does
-- not yet exist in auth.users.
--
-- RLS: service-role write, service-role-or-admin read. Future: a /admin/audit
-- page reads this table to surface operator history.

create table if not exists admin_reset_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  admin_email text not null,
  target_email text not null,
  target_user_id uuid null,
  action text not null check (action in ('send-reset-link', 'set-user-password')),
  ip text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists admin_reset_audit_log_admin_idx
  on admin_reset_audit_log (admin_id, created_at desc);

create index if not exists admin_reset_audit_log_target_idx
  on admin_reset_audit_log (target_email, created_at desc);

alter table admin_reset_audit_log enable row level security;

-- Service-role (Edge Function) is the only writer. Admins can read their own
-- audit trail via the API key path; no client-side direct read.
drop policy if exists "admin_audit_service_write" on admin_reset_audit_log;
create policy "admin_audit_service_write"
  on admin_reset_audit_log
  for insert
  to service_role
  with check (true);

drop policy if exists "admin_audit_admin_read" on admin_reset_audit_log;
create policy "admin_audit_admin_read"
  on admin_reset_audit_log
  for select
  to authenticated
  using (
    exists (
      select 1
      from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Rate-limit counter table. Tracks reset-password endpoint hits per admin
-- per rolling hour. Edge Function checks count(*) where created_at > now() -
-- interval '1 hour' before allowing the call; rejects with 429 at 10. Per
-- kratos: NOT relying on Supabase Auth signup-band rate-limit (that's IP-
-- band per Supabase docs and unrelated to operator-side throttle).
--
-- The audit log itself is the rate-limit source-of-truth — counting rows in
-- the last hour is sufficient. No separate counter table needed; this comment
-- documents the design choice (avoid two-tables-one-truth drift class).

-- SECURITY DEFINER helper for rate-limit count from the Edge Function with
-- pinned search_path (per feedback_supabase_security_definer_search_path).
create or replace function admin_reset_count_last_hour(p_admin_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from admin_reset_audit_log
  where admin_id = p_admin_id
    and created_at > now() - interval '1 hour';
$$;

revoke all on function admin_reset_count_last_hour(uuid) from public;
grant execute on function admin_reset_count_last_hour(uuid) to service_role;
