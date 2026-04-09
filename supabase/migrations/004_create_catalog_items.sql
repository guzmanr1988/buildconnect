-- BuildConnect 2026 — Vendor Catalog Items

create type catalog_unit as enum ('per_sq_ft', 'per_unit', 'per_linear_ft', 'flat_rate');

create table vendor_catalog_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references profiles(id) on delete cascade,
  category service_category not null,
  name text not null,
  description text not null default '',
  unit catalog_unit not null default 'flat_rate',
  price numeric(10,2) not null default 0,
  active boolean not null default true,
  multiplier numeric(4,2) not null default 1.0,
  created_at timestamptz not null default now()
);

create index idx_catalog_vendor on vendor_catalog_items(vendor_id);
create index idx_catalog_category on vendor_catalog_items(category);
create index idx_catalog_active on vendor_catalog_items(active) where active = true;
