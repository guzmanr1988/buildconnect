-- BuildConnect 2026 — Leads table

create type lead_status as enum ('pending', 'confirmed', 'rejected', 'rescheduled', 'completed');
create type service_category as enum (
  'roofing', 'windows_doors', 'pool', 'driveways', 'pergolas',
  'air_conditioning', 'kitchen', 'bathroom', 'wall_paneling', 'garage'
);

-- Auto-generate lead IDs in L-XXXX format
create sequence lead_id_seq start 1;

create or replace function generate_lead_id()
returns text language plpgsql as $$
begin
  return 'L-' || lpad(nextval('lead_id_seq')::text, 4, '0');
end;
$$;

create table leads (
  id text primary key default generate_lead_id(),
  homeowner_id uuid not null references profiles(id),
  vendor_id uuid not null references profiles(id),
  project text not null,
  value numeric(12,2) not null default 0,
  status lead_status not null default 'pending',
  slot timestamptz,
  permit_choice boolean not null default false,
  service_category service_category not null,
  pack_items jsonb not null default '{}',
  sq_ft integer not null default 2100,
  financing boolean not null default false,
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  homeowner_name text not null default '',
  received_at timestamptz not null default now()
);

create index idx_leads_homeowner on leads(homeowner_id);
create index idx_leads_vendor on leads(vendor_id);
create index idx_leads_status on leads(status);
create index idx_leads_received on leads(received_at desc);
