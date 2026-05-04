-- vendor_employees table + RLS
-- Vendor manages their own crew roster. Distinct from platform-staff.
-- Split hydration: demo vendors (v-1/v-2/v-3) stay in-memory; real-auth
-- vendors read/write Supabase. Tranche-2 wiring per task_1777645041516_868.

create table vendor_employees (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references profiles(id),
  employee_code text not null,
  first_name text not null,
  last_name text not null,
  title text not null default '',
  department text not null default '',
  status text not null check (status in ('active', 'on_leave', 'inactive')) default 'active',
  start_date date,
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  manager_name text,
  avatar_color text not null default '#4f46e5',
  bank_account_holder text,
  bank_name text,
  bank_account_last4 text,
  bank_routing_last4 text,
  bank_account_type text check (bank_account_type in ('checking', 'savings')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vendor_employees enable row level security;

-- Vendors: full access to own crew
create policy "Vendors select own employees"
  on vendor_employees for select
  using (vendor_id = auth.uid());

create policy "Vendors insert own employees"
  on vendor_employees for insert
  with check (vendor_id = auth.uid());

create policy "Vendors update own employees"
  on vendor_employees for update
  using (vendor_id = auth.uid());

create policy "Vendors delete own employees"
  on vendor_employees for delete
  using (vendor_id = auth.uid());

-- Admins: full access
create policy "Admins manage all employees"
  on vendor_employees for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
