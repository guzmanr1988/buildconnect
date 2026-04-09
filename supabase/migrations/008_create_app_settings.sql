-- BuildConnect 2026 — App Settings (singleton row)

create table app_settings (
  id integer primary key default 1 check (id = 1),
  revenue_share_pct integer not null default 15,
  subscription_fee numeric(6,2) not null default 35.00,
  payout_day integer not null default 15 check (payout_day between 1 and 28),
  maintenance_mode boolean not null default false,
  ar_mode boolean not null default false,
  phase2_enabled boolean not null default false,
  financing_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Insert default settings
insert into app_settings default values;
