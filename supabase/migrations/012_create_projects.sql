-- Projects (cart/draft system)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  homeowner_id uuid references public.profiles(id) on delete cascade not null,
  title text not null default 'Untitled Project',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'accepted', 'in_progress', 'completed', 'cancelled')),
  notes text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Project items (individual service selections within a project)
create table if not exists public.project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  service_id text not null,
  service_name text not null,
  selections jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.projects enable row level security;
alter table public.project_items enable row level security;

-- RLS policies: homeowners can manage their own projects
create policy "Homeowners can view own projects"
  on public.projects for select
  using (auth.uid() = homeowner_id);

create policy "Homeowners can create projects"
  on public.projects for insert
  with check (auth.uid() = homeowner_id);

create policy "Homeowners can update own projects"
  on public.projects for update
  using (auth.uid() = homeowner_id);

create policy "Homeowners can delete own draft projects"
  on public.projects for delete
  using (auth.uid() = homeowner_id and status = 'draft');

-- RLS for project items (access through project ownership)
create policy "Users can view own project items"
  on public.project_items for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_items.project_id
      and projects.homeowner_id = auth.uid()
    )
  );

create policy "Users can create project items"
  on public.project_items for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = project_items.project_id
      and projects.homeowner_id = auth.uid()
    )
  );

create policy "Users can update own project items"
  on public.project_items for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_items.project_id
      and projects.homeowner_id = auth.uid()
    )
  );

create policy "Users can delete own project items"
  on public.project_items for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_items.project_id
      and projects.homeowner_id = auth.uid()
    )
  );

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on public.projects
  for each row execute function update_updated_at();

create trigger project_items_updated_at
  before update on public.project_items
  for each row execute function update_updated_at();
