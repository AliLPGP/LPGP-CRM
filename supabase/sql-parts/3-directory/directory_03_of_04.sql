-- directory: part 3 of 4
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

alter table public.commitments
  add column if not exists external_key         text unique,
  add column if not exists gp_company_id        uuid references public.companies (id) on delete set null,
  add column if not exists lp_name              text,
  add column if not exists gp_name              text,
  add column if not exists fund_name            text,
  add column if not exists amount               numeric, -- in `currency`; never converted
  add column if not exists currency             text,
  add column if not exists amount_text          text,    -- as published: "up to 40,000,000"
  add column if not exists commitment_date_text text,
  add column if not exists commitment_year      integer,
  add column if not exists disclosure_type      text,
  add column if not exists source               text,    -- 'lp_disclosure' | 'sample'
  add column if not exists source_url           text,
  add column if not exists source_date          date;

create index if not exists commitments_gp_idx on public.commitments (gp_company_id);

update public.commitments
   set source = 'sample'
 where source is null and external_key is null;

-- --- Team lists and saved searches ----------------------------------------
create table if not exists public.directory_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  owner_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

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
