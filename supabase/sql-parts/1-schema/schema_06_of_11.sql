-- schema: part 6 of 11
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create index if not exists activities_recent_idx  on public.activities (occurred_at desc);

-- --- Tasks / follow-ups ----------------------------------------------------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  notes      text,
  due_date   date,
  priority   text not null default 'Normal',  -- High | Normal | Low
  done       boolean not null default false,
  done_at    timestamptz,
  owner_id   uuid references public.profiles (id) on delete set null,
  lead_id    uuid references public.leads (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_owner_due_idx on public.tasks (owner_id, done, due_date);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- --- Ops panel links -------------------------------------------------------
-- ops_deal_id is TrackerLPGP's deals.id (a bigint in another database), so it
-- is stored as a plain integer with no FK. `snapshot` holds the last payload
-- the bridge returned: amounts, paid status and the event allocations.
create table if not exists public.ops_links (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lead', 'account', 'company')),
  entity_id   uuid not null,
  ops_deal_id integer not null,
  ops_company text,
  confidence  numeric,
  snapshot    jsonb not null default '{}'::jsonb,
  synced_at   timestamptz not null default now(),
  linked_by   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists ops_links_unique
  on public.ops_links (entity_type, entity_id, ops_deal_id);
create index if not exists ops_links_entity_idx on public.ops_links (entity_type, entity_id);
create index if not exists ops_links_deal_idx   on public.ops_links (ops_deal_id);

-- --- Spreadsheet import batches -------------------------------------------
create table if not exists public.lead_imports (
  id            uuid primary key default gen_random_uuid(),
  filename      text,
  row_count     integer not null default 0,
  created_count integer not null default 0,
  skipped_count integer not null default 0,
  mapping       jsonb not null default '{}'::jsonb,
  owner_id      uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
