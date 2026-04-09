-- BuildConnect 2026 — Transactions Ledger

create type transaction_type as enum ('commission', 'membership', 'payout');
create type transaction_status as enum ('pending', 'paid', 'closed');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  type transaction_type not null,
  vendor_id uuid not null references profiles(id),
  company text not null default '',
  detail text not null default '',
  customer text,
  amount numeric(12,2) not null default 0,
  date timestamptz not null default now(),
  status transaction_status not null default 'pending'
);

create index idx_transactions_vendor on transactions(vendor_id);
create index idx_transactions_type on transactions(type);
create index idx_transactions_date on transactions(date desc);
