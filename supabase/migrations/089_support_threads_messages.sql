-- BuildConnect — Platform Support v1 (homeowner ↔ admin)
-- Wave-18 #3 — athena spec (msg 1781106745013), kratos endorsement
-- (msg 1781107038683): unique partial index on (homeowner_id) WHERE status='open'
-- enforces ONE-open-thread-per-homeowner at the DB layer so a race or double-
-- submit cannot punch through to create two open threads.

create type support_status as enum ('open', 'answered', 'closed');

create table support_threads (
  id uuid primary key default gen_random_uuid(),
  homeowner_id uuid not null references profiles(id) on delete cascade,
  status support_status not null default 'open',
  -- subject auto-derived from first message content (first 80 chars) by
  -- trg_support_autoderive_subject; NULL at INSERT, trigger fills.
  subject text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
  -- assignee_id uuid references profiles(id) -- reserved for v2 additive migration; intentionally omitted v1
);

create table support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references support_threads(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  -- sender_role denormalized at write — historical audit if profile.role
  -- changes later. user_role enum already includes 'admin' 'homeowner' 'vendor'.
  sender_role user_role not null,
  content text not null check (length(content) > 0),
  created_at timestamptz not null default now()
);

create index idx_support_threads_status_activity on support_threads(status, last_activity_at desc);
create index idx_support_threads_homeowner on support_threads(homeowner_id, last_activity_at desc);
create index idx_support_messages_thread on support_messages(thread_id, created_at);

-- One open thread per homeowner: DB-enforced. Application Compose handler
-- does SELECT-or-create with ON CONFLICT 23505 re-SELECT fallback for the
-- concurrent-submit race window.
create unique index uniq_one_open_thread_per_homeowner
  on support_threads(homeowner_id)
  where status = 'open';

alter publication supabase_realtime add table support_threads;
alter publication supabase_realtime add table support_messages;

-- Trigger: bump parent thread last_activity_at on any new message
create or replace function support_bump_thread_activity()
returns trigger language plpgsql as $$
begin
  update support_threads
    set last_activity_at = now()
    where id = new.thread_id;
  return new;
end;
$$;

create trigger trg_support_bump_activity
  after insert on support_messages
  for each row execute function support_bump_thread_activity();

-- Trigger: when admin OR admin_employee replies to an open thread, flip status
-- to 'answered'. admin_employee included per kratos widen-scope directive
-- (1781112259222) — FE treats admin/admin_employee identically for the reply
-- box, so an admin_employee reply must also flip the thread state.
create or replace function support_admin_reply_flips_open_to_answered()
returns trigger language plpgsql as $$
begin
  if new.sender_role in ('admin', 'admin_employee') then
    update support_threads
      set status = 'answered'
      where id = new.thread_id and status = 'open';
  end if;
  return new;
end;
$$;

create trigger trg_support_admin_reply_status
  after insert on support_messages
  for each row execute function support_admin_reply_flips_open_to_answered();

-- Trigger: auto-derive subject from first message if NULL (first 80 chars)
create or replace function support_autoderive_subject()
returns trigger language plpgsql as $$
declare
  first_msg_content text;
begin
  select content into first_msg_content
    from support_messages
    where thread_id = new.thread_id
    order by created_at asc
    limit 1;
  if first_msg_content is not null then
    update support_threads
      set subject = left(first_msg_content, 80)
      where id = new.thread_id and subject is null;
  end if;
  return new;
end;
$$;

create trigger trg_support_autoderive_subject
  after insert on support_messages
  for each row execute function support_autoderive_subject();

-- ─── SUPPORT THREADS RLS ───
alter table support_threads enable row level security;

create policy "Homeowners read own support threads"
  on support_threads for select using (homeowner_id = auth.uid());

create policy "Homeowners create own support threads"
  on support_threads for insert
  with check (homeowner_id = auth.uid() and auth_role() = 'homeowner');

create policy "Admins read all support threads"
  on support_threads for select using (auth_role() in ('admin', 'admin_employee'));

create policy "Admins update support thread status"
  on support_threads for update using (auth_role() in ('admin', 'admin_employee'));

-- ─── SUPPORT MESSAGES RLS ───
alter table support_messages enable row level security;

create policy "Homeowners read own thread messages"
  on support_messages for select using (
    exists (
      select 1 from support_threads
      where support_threads.id = support_messages.thread_id
      and support_threads.homeowner_id = auth.uid()
    )
  );

create policy "Homeowners send to own threads"
  on support_messages for insert with check (
    sender_id = auth.uid()
    and sender_role = 'homeowner'
    and exists (
      select 1 from support_threads
      where support_threads.id = support_messages.thread_id
      and support_threads.homeowner_id = auth.uid()
    )
  );

create policy "Admins read all support messages"
  on support_messages for select using (auth_role() in ('admin', 'admin_employee'));

-- admin + admin_employee can reply (kratos widen-scope 1781112259222). FE
-- shows the reply box to both roles identically, so RLS must accept both
-- INSERTs or the button is visibly broken for admin_employee.
create policy "Admins reply to any thread"
  on support_messages for insert with check (
    sender_id = auth.uid()
    and sender_role in ('admin', 'admin_employee')
    and auth_role() in ('admin', 'admin_employee')
  );

-- INTENTIONAL: NO UPDATE policy, NO DELETE policy on support_messages.
-- Append-only chat — apollo verifies via supabase-js attempt-update returns
-- 403/empty (RLS reject).
--
-- INTENTIONAL: ZERO vendor policies on support_messages or support_threads.
-- Vendors cannot read or write support_* tables; vendor↔admin chat continues
-- via lead-scoped messages table with admin SELECT-all RLS (mig 010 unchanged).
