-- schema: part 11 of 12
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create table if not exists public.directory_list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.directory_lists (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  note       text,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (list_id, company_id)
);
create index if not exists directory_list_items_company_idx on public.directory_list_items (company_id);

create table if not exists public.saved_searches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  query      text,
  filters    jsonb not null default '{}'::jsonb,
  owner_id   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One row per workbook import: what came in and what it changed.
create table if not exists public.directory_imports (
  id          uuid primary key default gen_random_uuid(),
  filename    text,
  stats       jsonb not null default '{}'::jsonb,
  result      jsonb not null default '{}'::jsonb,
  imported_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

drop trigger if exists directory_lists_set_updated_at on public.directory_lists;
create trigger directory_lists_set_updated_at
  before update on public.directory_lists
  for each row execute function public.set_updated_at();

alter table public.directory_lists      enable row level security;
alter table public.directory_list_items enable row level security;
alter table public.saved_searches       enable row level security;
alter table public.directory_imports    enable row level security;

drop policy if exists "directory_lists_read" on public.directory_lists;
create policy "directory_lists_read" on public.directory_lists for select using (true);
drop policy if exists "directory_list_items_read" on public.directory_list_items;
create policy "directory_list_items_read" on public.directory_list_items for select using (true);
drop policy if exists "saved_searches_read" on public.saved_searches;
create policy "saved_searches_read" on public.saved_searches for select using (true);
drop policy if exists "directory_imports_read" on public.directory_imports;
create policy "directory_imports_read" on public.directory_imports for select using (true);

-- ##################################################################
-- ## Fund lineup: private funds named on Form ADV Schedule D, with
-- ## the providers each filing ties them to (0014)
-- ##################################################################

alter table public.funds
  add column if not exists name_filed        text,  -- exactly as filed
  add column if not exists vehicle_kind      text,  -- from the name: Feeder, Co-investment, Master ...
  add column if not exists domicile          text,  -- only when the legal form fixes it (SCSp, ICAV)
  add column if not exists currency          text,  -- a currency class the name states
  add column if not exists service_providers jsonb not null default '[]'::jsonb, -- [{role, key, brand}]
  add column if not exists filed             text,  -- which ADV filings named it
  add column if not exists source_url        text;

create index if not exists funds_source_idx on public.funds (source);
