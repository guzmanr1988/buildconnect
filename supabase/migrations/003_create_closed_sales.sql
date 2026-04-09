-- BuildConnect 2026 — Closed Sales table

create table closed_sales (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references leads(id),
  vendor_id uuid not null references profiles(id),
  homeowner_id uuid not null references profiles(id),
  sale_amount numeric(12,2) not null,
  vendor_share numeric(12,2) not null generated always as (sale_amount * 0.85) stored,
  commission numeric(12,2) not null generated always as (sale_amount * 0.15) stored,
  commission_paid boolean not null default false,
  commission_paid_at timestamptz,
  closed_at timestamptz not null default now(),
  homeowner_name text not null default '',
  project text not null default ''
);

create index idx_closed_sales_vendor on closed_sales(vendor_id);
create index idx_closed_sales_homeowner on closed_sales(homeowner_id);
create index idx_closed_sales_date on closed_sales(closed_at desc);

-- Function to close a lead and create sale record
create or replace function close_lead_sale(
  p_lead_id text,
  p_sale_amount numeric
)
returns uuid language plpgsql security definer as $$
declare
  v_lead leads%rowtype;
  v_sale_id uuid;
begin
  select * into v_lead from leads where id = p_lead_id;

  if not found then
    raise exception 'Lead not found: %', p_lead_id;
  end if;

  -- Update lead status
  update leads set status = 'completed' where id = p_lead_id;

  -- Create closed sale record
  insert into closed_sales (lead_id, vendor_id, homeowner_id, sale_amount, homeowner_name, project)
  values (p_lead_id, v_lead.vendor_id, v_lead.homeowner_id, p_sale_amount, v_lead.homeowner_name, v_lead.project)
  returning id into v_sale_id;

  return v_sale_id;
end;
$$;
