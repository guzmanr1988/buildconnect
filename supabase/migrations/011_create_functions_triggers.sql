-- BuildConnect 2026 — Database Functions & Triggers

-- Calculate commission split
create or replace function calculate_commission(sale_amount numeric)
returns table(vendor_share numeric, platform_commission numeric)
language sql immutable as $$
  select
    round(sale_amount * 0.85, 2) as vendor_share,
    round(sale_amount * 0.15, 2) as platform_commission;
$$;

-- Update timestamp on app_settings change
create or replace function update_settings_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger settings_updated
  before update on app_settings
  for each row execute function update_settings_timestamp();

-- Auto-create transaction when commission is marked paid
create or replace function handle_commission_payment()
returns trigger language plpgsql security definer as $$
begin
  if new.commission_paid = true and old.commission_paid = false then
    new.commission_paid_at = now();

    insert into transactions (type, vendor_id, company, detail, customer, amount, date, status)
    select
      'commission',
      new.vendor_id,
      coalesce(p.company, p.name),
      new.project,
      new.homeowner_name,
      new.commission,
      now(),
      'paid'
    from profiles p where p.id = new.vendor_id;
  end if;
  return new;
end;
$$;

create trigger on_commission_paid
  before update on closed_sales
  for each row execute function handle_commission_payment();

-- Auto-create transaction for new closed sale
create or replace function handle_new_sale()
returns trigger language plpgsql security definer as $$
begin
  insert into transactions (type, vendor_id, company, detail, customer, amount, date, status)
  select
    'commission',
    new.vendor_id,
    coalesce(p.company, p.name),
    new.project,
    new.homeowner_name,
    new.commission,
    now(),
    'pending'
  from profiles p where p.id = new.vendor_id;
  return new;
end;
$$;

create trigger on_sale_closed
  after insert on closed_sales
  for each row execute function handle_new_sale();
