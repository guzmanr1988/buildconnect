-- vendor_homeowner_documents table + RLS
-- Vendor-private per-homeowner document collection (permits, contracts,
-- quotes, photos, etc.). dataUrl stored as base64 text for Tranche-2;
-- Supabase Storage migration is a separate Tranche-3 task.
-- Tranche-2 wiring per task_1777645043912_223.

create table vendor_homeowner_documents (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references profiles(id) on delete cascade,
  homeowner_email text not null,
  category text not null check (category in ('driver_license', 'permit', 'contract', 'quote', 'photo', 'other')),
  custom_label text,
  filename text not null,
  data_url text not null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index on vendor_homeowner_documents (vendor_id);
create index on vendor_homeowner_documents (homeowner_email);
create index on vendor_homeowner_documents (vendor_id, homeowner_email);

alter table vendor_homeowner_documents enable row level security;

-- Vendors: read + write own documents only
create policy "Vendors select own documents"
  on vendor_homeowner_documents for select
  using (vendor_id = auth.uid());

create policy "Vendors insert own documents"
  on vendor_homeowner_documents for insert
  with check (vendor_id = auth.uid());

create policy "Vendors delete own documents"
  on vendor_homeowner_documents for delete
  using (vendor_id = auth.uid());

-- Admins: full access (god-view across all vendors)
create policy "Admins manage all documents"
  on vendor_homeowner_documents for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
