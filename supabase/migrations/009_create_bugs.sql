-- BuildConnect 2026 — Bug Tracker

create type bug_priority as enum ('high', 'medium', 'low');
create type bug_status as enum ('open', 'in_progress', 'resolved');

create table bugs (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  description text not null,
  priority bug_priority not null default 'medium',
  status bug_status not null default 'open',
  created_at timestamptz not null default now()
);

create index idx_bugs_status on bugs(status);
create index idx_bugs_priority on bugs(priority);
