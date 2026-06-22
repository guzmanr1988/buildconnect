-- Wave-9 9b — repoint messages.lead_id from leads(id) to sent_projects(id).
-- leads table is empty in prod (0 rows) and the app keyed conversations off
-- sent_projects (1 row d11d1c01 launch night) — pre-9b useEffectiveLeads
-- queried the empty leads table → invisible threads. messages table is also
-- empty (zero callers pre-9a, hooks just landed in preview) → zero data move.
--
-- Drops the FK constraint so we can store sent_projects.id (uuid) as text
-- in messages.lead_id without an ALTER COLUMN TYPE pass. Repoints the two
-- "Lead participants" RLS policies to join sent_projects instead of leads.
-- "Admins read all messages" policy is untouched (no leads join).
--
-- Reversible: the inverse migration restores the FK + original policies if
-- ever needed (kept as comments at the bottom).

begin;

-- 1) Drop the FK constraint pointing messages.lead_id → leads(id)
alter table public.messages
  drop constraint if exists messages_lead_id_fkey;

-- 2) Repoint "Lead participants can read messages" to sent_projects
drop policy if exists "Lead participants can read messages" on public.messages;

create policy "Lead participants can read messages"
  on public.messages for select using (
    exists (
      select 1 from public.sent_projects
      where sent_projects.id::text = messages.lead_id
      and (sent_projects.homeowner_id = auth.uid()
           or sent_projects.vendor_id = auth.uid())
    )
  );

-- 3) Repoint "Lead participants can send messages" to sent_projects
drop policy if exists "Lead participants can send messages" on public.messages;

create policy "Lead participants can send messages"
  on public.messages for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.sent_projects
      where sent_projects.id::text = messages.lead_id
      and (sent_projects.homeowner_id = auth.uid()
           or sent_projects.vendor_id = auth.uid())
    )
  );

commit;

-- Inverse (for reference; do not apply unless rolling back):
-- begin;
--   drop policy if exists "Lead participants can read messages" on public.messages;
--   drop policy if exists "Lead participants can send messages" on public.messages;
--   alter table public.messages
--     add constraint messages_lead_id_fkey
--     foreign key (lead_id) references public.leads(id) on delete cascade;
--   create policy "Lead participants can read messages"
--     on public.messages for select using (
--       exists (
--         select 1 from public.leads
--         where leads.id = messages.lead_id
--         and (leads.homeowner_id = auth.uid() or leads.vendor_id = auth.uid())
--       )
--     );
--   create policy "Lead participants can send messages"
--     on public.messages for insert with check (
--       sender_id = auth.uid()
--       and exists (
--         select 1 from public.leads
--         where leads.id = messages.lead_id
--         and (leads.homeowner_id = auth.uid() or leads.vendor_id = auth.uid())
--       )
--     );
-- commit;
