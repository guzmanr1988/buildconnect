-- vendor_change_requests table + RLS
-- Vendors submit free-text info-change requests; admin reviews, approves/denies,
-- and applies profile edits on approve. Tranche-2 wiring per task_1777645039117_750.

create table vendor_change_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references profiles(id),
  vendor_company text not null,
  vendor_name text not null,
  requested_change text not null,
  status text not null check (status in ('pending', 'approved', 'denied')) default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  admin_note text,
  resolved_by_admin_id uuid references profiles(id)
);

alter table vendor_change_requests enable row level security;

-- Vendors: read + insert own requests only
create policy "Vendors read own change requests"
  on vendor_change_requests for select
  using (vendor_id = auth.uid());

create policy "Vendors insert own change requests"
  on vendor_change_requests for insert
  with check (vendor_id = auth.uid());

-- Admins: full access
create policy "Admins manage all change requests"
  on vendor_change_requests for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Admin UPDATE on profiles (needed for approve path that applies profile edits).
-- Existing policy (010) only allows self-update (id = auth.uid()).
create policy "Admins update any profile"
  on profiles for update
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
