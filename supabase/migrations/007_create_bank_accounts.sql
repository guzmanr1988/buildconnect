-- BuildConnect 2026 — Bank Accounts (Vendor ACH Linking)
-- Sensitive data stored as last 4 digits only; full data handled by Plaid

create type account_type as enum ('checking', 'savings');

create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references profiles(id) on delete cascade,
  bank_name text not null,
  account_holder text not null,
  routing_last4 text not null,
  account_last4 text not null,
  account_type account_type not null default 'checking',
  linked_at timestamptz not null default now(),
  unique(vendor_id)
);

create index idx_bank_accounts_vendor on bank_accounts(vendor_id);
