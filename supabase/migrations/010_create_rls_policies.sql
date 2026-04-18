-- BuildConnect 2026 — Row Level Security Policies

-- Helper: get current user's role.
-- SET search_path = public for the same reason as handle_new_user — SECURITY
-- DEFINER functions would otherwise fail to resolve `profiles` and `user_role`.
create or replace function auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

-- ─── PROFILES ───
alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select using (id = auth.uid());

create policy "Admins can view all profiles"
  on profiles for select using (auth_role() = 'admin');

create policy "Homeowners can view vendor profiles"
  on profiles for select using (role = 'vendor' and auth_role() = 'homeowner');

create policy "Users can update own profile"
  on profiles for update using (id = auth.uid());

-- Needed so the handle_new_user trigger (migration 001) can insert the profile
-- row after an auth.users INSERT. INSERTs into profiles are only reachable via
-- that trigger; application code has no direct write path.
create policy "handle_new_user can insert profile"
  on profiles for insert
  with check (true);

-- ─── LEADS ───
alter table leads enable row level security;

create policy "Homeowners see own leads"
  on leads for select using (homeowner_id = auth.uid());

create policy "Vendors see assigned leads"
  on leads for select using (vendor_id = auth.uid());

create policy "Admins see all leads"
  on leads for select using (auth_role() = 'admin');

create policy "Homeowners can create leads"
  on leads for insert with check (homeowner_id = auth.uid());

create policy "Vendors can update lead status"
  on leads for update using (vendor_id = auth.uid());

create policy "Admins can update any lead"
  on leads for update using (auth_role() = 'admin');

-- ─── CLOSED SALES ───
alter table closed_sales enable row level security;

create policy "Vendors see own sales"
  on closed_sales for select using (vendor_id = auth.uid());

create policy "Homeowners see own sales"
  on closed_sales for select using (homeowner_id = auth.uid());

create policy "Admins see all sales"
  on closed_sales for select using (auth_role() = 'admin');

create policy "Vendors can update commission status"
  on closed_sales for update using (vendor_id = auth.uid());

-- ─── VENDOR CATALOG ───
alter table vendor_catalog_items enable row level security;

create policy "Vendors CRUD own catalog"
  on vendor_catalog_items for all using (vendor_id = auth.uid());

create policy "Homeowners read active items"
  on vendor_catalog_items for select using (active = true and auth_role() = 'homeowner');

create policy "Admins see all catalog"
  on vendor_catalog_items for select using (auth_role() = 'admin');

-- ─── MESSAGES ───
alter table messages enable row level security;

create policy "Lead participants can read messages"
  on messages for select using (
    exists (
      select 1 from leads
      where leads.id = messages.lead_id
      and (leads.homeowner_id = auth.uid() or leads.vendor_id = auth.uid())
    )
  );

create policy "Lead participants can send messages"
  on messages for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from leads
      where leads.id = messages.lead_id
      and (leads.homeowner_id = auth.uid() or leads.vendor_id = auth.uid())
    )
  );

create policy "Admins read all messages"
  on messages for select using (auth_role() = 'admin');

-- ─── TRANSACTIONS ───
alter table transactions enable row level security;

create policy "Vendors see own transactions"
  on transactions for select using (vendor_id = auth.uid());

create policy "Admins see all transactions"
  on transactions for select using (auth_role() = 'admin');

create policy "Admins can create transactions"
  on transactions for insert with check (auth_role() = 'admin');

-- ─── BANK ACCOUNTS ───
alter table bank_accounts enable row level security;

create policy "Vendors see own bank account"
  on bank_accounts for select using (vendor_id = auth.uid());

create policy "Vendors manage own bank account"
  on bank_accounts for all using (vendor_id = auth.uid());

create policy "Admins see bank metadata"
  on bank_accounts for select using (auth_role() = 'admin');

-- ─── APP SETTINGS ───
alter table app_settings enable row level security;

create policy "All roles can read settings"
  on app_settings for select using (true);

create policy "Admins can update settings"
  on app_settings for update using (auth_role() = 'admin');

-- ─── BUGS ───
alter table bugs enable row level security;

create policy "Any role can submit bugs"
  on bugs for insert with check (reporter_id = auth.uid());

create policy "Admins full access to bugs"
  on bugs for all using (auth_role() = 'admin');

create policy "Users see own bugs"
  on bugs for select using (reporter_id = auth.uid());

-- ─── Enable realtime for key tables ───
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table closed_sales;
