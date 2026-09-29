-- schema: part 4 of 15
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- --- Leads -----------------------------------------------------------------
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references public.profiles (id) on delete set null,
  company_id      uuid references public.companies (id) on delete set null,
  company_name    text,                      -- denormalised (net-new or display)
  category        company_category,          -- optional LP/GP/SP tag
  contact_name    text,
  contact_title   text,
  contact_email   text,
  contact_phone   text,
  linkedin_url    text,
  market          text,                      -- 'US', 'UK', ...
  stage           lead_stage not null default 'New',
  value_usd       numeric,
  source          text,
  next_step       text,
  next_step_date  date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists leads_owner_idx on public.leads (owner_id);
create index if not exists leads_stage_idx on public.leads (stage);
create index if not exists leads_market_idx on public.leads (market);
create index if not exists leads_company_idx on public.leads (company_id);

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;
drop policy if exists "leads_read" on public.leads;
create policy "leads_read" on public.leads for select using (true);

-- --- Notes can now attach to a lead too ------------------------------------
alter table public.notes drop constraint if exists notes_entity_type_check;
alter table public.notes
  add constraint notes_entity_type_check check (entity_type in ('company', 'contact', 'lead'));


-- ##################################################################
-- ## Sales layer: accounts, points of contact, activities, tasks,
-- ## ops-panel links and spreadsheet imports (migration 0008)
-- ##################################################################

-- --- Accounts (sponsors) ---------------------------------------------------
create table if not exists public.accounts (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid references public.companies (id) on delete set null,
  name                 text not null,
  category             company_category,
  owner_id             uuid references public.profiles (id) on delete set null,
  status               text not null default 'Active',   -- Active | Renewal due | Churned | Prospect
  tier                 text,                             -- Platinum | Gold | Silver | Bronze
  health               text,                             -- Healthy | At risk | Critical
  domain               text,
  website              text,
  linkedin_url         text,
  hq_location          text,
  country              text,
  -- Company name as it is spelled in the ops panel. Set when a link is
  -- confirmed so later reconciles skip the fuzzy match entirely.
  ops_company          text,
  first_sponsored_year integer,
  renewal_date         date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists accounts_owner_idx    on public.accounts (owner_id);
