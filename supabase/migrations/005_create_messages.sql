-- BuildConnect 2026 — In-App Messaging

create type message_type as enum ('text', 'quote');

create table messages (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references leads(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  content text not null default '',
  message_type message_type not null default 'text',
  quote_data jsonb,
  created_at timestamptz not null default now()
);

create index idx_messages_lead on messages(lead_id, created_at);
create index idx_messages_sender on messages(sender_id);

-- Enable realtime for messages
alter publication supabase_realtime add table messages;
