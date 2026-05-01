-- RLS policies for vendor_option_prices.
-- Table was created outside the local migration chain (via Supabase dashboard).
-- This migration installs vendor write access and ensures the unique constraint
-- required for ON CONFLICT upserts exists.

-- Ensure RLS is enabled on the table.
alter table vendor_option_prices enable row level security;

-- Idempotent policy creation (drop-if-exists then recreate).
do $$ begin
  drop policy if exists "Vendors read own prices" on vendor_option_prices;
  drop policy if exists "Vendors upsert own prices" on vendor_option_prices;
  drop policy if exists "Homeowners read active prices" on vendor_option_prices;
  drop policy if exists "Admins manage all prices" on vendor_option_prices;
end $$;

-- Vendors can read their own rows.
create policy "Vendors read own prices"
  on vendor_option_prices for select
  using (vendor_id = auth.uid());

-- Vendors can insert/update/delete their own rows.
create policy "Vendors upsert own prices"
  on vendor_option_prices for all
  using (vendor_id = auth.uid())
  with check (vendor_id = auth.uid());

-- Homeowners and unauthenticated read: active rows only (for price shopping).
create policy "Homeowners read active prices"
  on vendor_option_prices for select
  using (active = true);

-- Admins can manage all rows.
create policy "Admins manage all prices"
  on vendor_option_prices for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Unique constraint needed for ON CONFLICT (vendor_id, option_id) upsert.
-- Wrapped in exception handler so re-running is safe.
do $$ begin
  alter table vendor_option_prices
    add constraint vendor_option_prices_vendor_option_unique
    unique (vendor_id, option_id);
exception when duplicate_table then null;
         when others then
           if sqlerrm not like '%already exists%' then raise; end if;
end $$;
