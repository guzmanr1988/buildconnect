-- BuildConnect 2026 — Profiles table
-- Extends Supabase auth.users with app-specific fields

create type user_role as enum ('homeowner', 'vendor', 'admin');
create type user_status as enum ('active', 'pending', 'suspended');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role user_role not null default 'homeowner',
  phone text not null default '',
  address text not null default '',
  company text,
  avatar_color text not null default '#3b82f6',
  initials text not null default '',
  status user_status not null default 'active',
  created_at timestamptz not null default now()
);

create index idx_profiles_role on profiles(role);
create index idx_profiles_email on profiles(email);

-- Auto-generate initials from name
create or replace function generate_initials(full_name text)
returns text language plpgsql immutable as $$
declare
  parts text[];
begin
  parts := string_to_array(trim(full_name), ' ');
  if array_length(parts, 1) >= 2 then
    return upper(left(parts[1], 1) || left(parts[array_length(parts, 1)], 1));
  elsif array_length(parts, 1) = 1 then
    return upper(left(parts[1], 2));
  else
    return '??';
  end if;
end;
$$;

-- Auto-create profile on new auth user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, name, role, initials)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'homeowner'),
    generate_initials(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
