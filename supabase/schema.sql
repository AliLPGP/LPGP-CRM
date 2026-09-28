-- ===========================================================================
-- LPGP Connect CRM -- FULL SCHEMA (run this once in Supabase -> SQL Editor)
-- ---------------------------------------------------------------------------
-- This is the consolidated equivalent of every file in migrations/. If you hit
-- "relation public.companies does not exist", it means an ALTER ran before the
-- table existed -- just run THIS file top to bottom and you're set. Idempotent.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- Firm category: LP (institutional investors), GP (fund managers / VC),
-- SP (solution providers / vendors).
do $$ begin
  create type company_category as enum ('LP', 'GP', 'SP');
exception
  when duplicate_object then null;
end $$;

-- --- Companies -------------------------------------------------------------
create table if not exists public.companies (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  category          company_category not null,
  sub_type          text,
  domain            text,
  website           text,
  linkedin_url      text,
  logo_url          text,
  description       text,
  country           text,
  city              text,
  hq_location       text,
  employee_range    text,
  aum               text,
  lusha_company_id  text unique,
  -- profile / visualization fields
  aum_usd           numeric,
  region            text,
  status            text,
  investment_thesis text,
  check_size        text,
  preferred_stages  text,
  geographic_focus  text,
  active_funds      integer,
  allocations       jsonb not null default '[]'::jsonb,
  in_portfolio      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists companies_category_idx on public.companies (category);
create index if not exists companies_name_idx on public.companies (lower(name));
create index if not exists companies_portfolio_idx on public.companies (in_portfolio) where in_portfolio;

-- --- Contacts --------------------------------------------------------------
create table if not exists public.contacts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid references public.companies (id) on delete set null,
  first_name       text,
  last_name        text,
  full_name        text generated always as (
                     nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
                   ) stored,
  job_title        text,
  seniority        text,
  department       text,
  email            text,
  phone            text,
  linkedin_url     text,
  country          text,
  city             text,
  lusha_contact_id text unique,
  -- relationship fields
  relationship_strength integer,
  priority         text,
  status           text,
  last_contacted   date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists contacts_company_idx on public.contacts (company_id);
create index if not exists contacts_name_idx on public.contacts (lower(full_name));

-- --- Notes -----------------------------------------------------------------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('company', 'contact')),
  entity_id   uuid not null,
  body        text not null,
  author      text,
  created_at  timestamptz not null default now()
);
create index if not exists notes_entity_idx on public.notes (entity_type, entity_id);

-- --- Funds (fund-level / deal data per manager) ----------------------------
create table if not exists public.funds (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies (id) on delete cascade,
  name            text not null,
  vintage_year    integer,
  fund_size_usd   numeric,
  target_size_usd numeric,
  strategy        text,
  geography       text,
  status          text,
  created_at      timestamptz not null default now()
);
create index if not exists funds_company_idx on public.funds (company_id);

-- --- Commitments (LP -> Fund allocations) ----------------------------------
create table if not exists public.commitments (
  id              uuid primary key default gen_random_uuid(),
  lp_company_id   uuid references public.companies (id) on delete cascade,
  fund_id         uuid references public.funds (id) on delete cascade,
  amount_usd      numeric,
  commitment_date date,
  created_at      timestamptz not null default now()
);
create index if not exists commitments_lp_idx on public.commitments (lp_company_id);
create index if not exists commitments_fund_idx on public.commitments (fund_id);

-- --- Service relationships (which SPs a GP/LP uses) -------------------------
create table if not exists public.service_relationships (
  id                  uuid primary key default gen_random_uuid(),
  client_company_id   uuid references public.companies (id) on delete cascade,
  provider_company_id uuid references public.companies (id) on delete cascade,
  role                text,
  created_at          timestamptz not null default now()
);
create index if not exists service_rel_client_idx on public.service_relationships (client_company_id);
create index if not exists service_rel_provider_idx on public.service_relationships (provider_company_id);

-- --- updated_at trigger ----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- --- Row level security ----------------------------------------------------
-- Internal tool: anon may READ. Writes go through the service-role key
-- (bypasses RLS). No public write policies on purpose.
alter table public.companies enable row level security;
alter table public.contacts  enable row level security;
alter table public.notes     enable row level security;
alter table public.funds     enable row level security;
alter table public.commitments enable row level security;
alter table public.service_relationships enable row level security;

drop policy if exists "funds_read" on public.funds;
create policy "funds_read" on public.funds for select using (true);

drop policy if exists "commitments_read" on public.commitments;
create policy "commitments_read" on public.commitments for select using (true);

drop policy if exists "service_rel_read" on public.service_relationships;
create policy "service_rel_read" on public.service_relationships for select using (true);

drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies for select using (true);

drop policy if exists "contacts_read" on public.contacts;
create policy "contacts_read" on public.contacts for select using (true);

drop policy if exists "notes_read" on public.notes;
create policy "notes_read" on public.notes for select using (true);

-- ###########################################################################
-- ## CRM: auth profiles + leads pipeline
-- ###########################################################################

-- --- Profiles (one row per Supabase Auth user) -----------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'member',   -- 'member' | 'admin'
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select using (true);

-- Auto-create a profile whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that already exist.
insert into public.profiles (id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- --- Lead pipeline stages --------------------------------------------------
do $$ begin
  create type lead_stage as enum ('New', 'Contacted', 'Discussing', 'Proposal Sent', 'Confirmed', 'Blown Out');
exception
  when duplicate_object then null;
end $$;

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
create index if not exists accounts_company_idx  on public.accounts (company_id);
create index if not exists accounts_name_idx     on public.accounts (lower(name));
create index if not exists accounts_status_idx   on public.accounts (status);

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- --- Points of contact -----------------------------------------------------
-- Standalone by design: a sponsor's billing contact often isn't in the
-- intelligence database at all. contact_id links one up when it is.
create table if not exists public.account_contacts (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts (id) on delete cascade,
  contact_id     uuid references public.contacts (id) on delete set null,
  full_name      text not null,
  job_title      text,
  email          text,
  phone          text,
  mobile         text,
  linkedin_url   text,
  role           text,                       -- Primary | Billing | Marketing | Speaker liaison | Legal
  is_primary     boolean not null default false,
  last_contacted date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists account_contacts_account_idx on public.account_contacts (account_id);
-- At most one primary contact per account.
create unique index if not exists account_contacts_one_primary
  on public.account_contacts (account_id) where is_primary;

drop trigger if exists account_contacts_set_updated_at on public.account_contacts;
create trigger account_contacts_set_updated_at
  before update on public.account_contacts
  for each row execute function public.set_updated_at();

-- --- Activity log ----------------------------------------------------------
do $$ begin
  create type activity_type as enum ('call', 'email', 'meeting', 'linkedin', 'note', 'task');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.activities (
  id                 uuid primary key default gen_random_uuid(),
  type               activity_type not null default 'call',
  outcome            text,                   -- Connected | Voicemail | No answer | Gatekeeper | ...
  subject            text,
  body               text,
  duration_seconds   integer,
  occurred_at        timestamptz not null default now(),
  owner_id           uuid references public.profiles (id) on delete set null,
  lead_id            uuid references public.leads (id) on delete cascade,
  account_id         uuid references public.accounts (id) on delete cascade,
  company_id         uuid references public.companies (id) on delete cascade,
  contact_id         uuid references public.contacts (id) on delete set null,
  account_contact_id uuid references public.account_contacts (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists activities_lead_idx    on public.activities (lead_id, occurred_at desc);
create index if not exists activities_account_idx on public.activities (account_id, occurred_at desc);
create index if not exists activities_company_idx on public.activities (company_id, occurred_at desc);
create index if not exists activities_owner_idx   on public.activities (owner_id, occurred_at desc);
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

-- --- Lead columns the sales workflow needs ---------------------------------
alter table public.leads
  add column if not exists disposition      text,          -- last call outcome
  add column if not exists callback_at      timestamptz,   -- scheduled call-back
  add column if not exists last_activity_at timestamptz,
  add column if not exists call_count       integer not null default 0,
  add column if not exists do_not_call      boolean not null default false,
  add column if not exists priority         text not null default 'Normal',
  add column if not exists website          text,
  add column if not exists country          text,
  add column if not exists title            text,          -- free-text deal title
  add column if not exists import_id        uuid references public.lead_imports (id) on delete set null,
  add column if not exists account_id       uuid references public.accounts (id) on delete set null,
  add column if not exists ops_deal_id      integer,       -- confirmed tracker deal
  add column if not exists ops_checked_at   timestamptz;   -- last time we asked the bridge

create index if not exists leads_callback_idx on public.leads (callback_at) where callback_at is not null;
create index if not exists leads_activity_idx on public.leads (last_activity_at desc nulls last);
create index if not exists leads_name_idx     on public.leads (lower(company_name));

-- --- Notes can attach to an account too ------------------------------------
alter table public.notes drop constraint if exists notes_entity_type_check;
alter table public.notes
  add constraint notes_entity_type_check
  check (entity_type in ('company', 'contact', 'lead', 'account'));

-- --- Row level security ----------------------------------------------------
-- Same posture as the rest of the app: anon may READ, every write goes through
-- the service-role key in server code.
alter table public.accounts         enable row level security;
alter table public.account_contacts enable row level security;
alter table public.activities       enable row level security;
alter table public.tasks            enable row level security;
alter table public.ops_links        enable row level security;
alter table public.lead_imports     enable row level security;

drop policy if exists "accounts_read" on public.accounts;
create policy "accounts_read" on public.accounts for select using (true);

drop policy if exists "account_contacts_read" on public.account_contacts;
create policy "account_contacts_read" on public.account_contacts for select using (true);

drop policy if exists "activities_read" on public.activities;
create policy "activities_read" on public.activities for select using (true);

drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks for select using (true);

drop policy if exists "ops_links_read" on public.ops_links;
create policy "ops_links_read" on public.ops_links for select using (true);

drop policy if exists "lead_imports_read" on public.lead_imports;
create policy "lead_imports_read" on public.lead_imports for select using (true);


-- ##################################################################
-- ## Event revenue targets, keyed to the ops panel's events (0009)
-- ##################################################################

create table if not exists public.event_targets (
  id               uuid primary key default gen_random_uuid(),
  -- TrackerLPGP portfolio_events.id -- an integer in another database, so no FK.
  ops_event_id     integer not null unique,
  -- Snapshot of the tracker's name, so the page still reads sensibly when the
  -- bridge is unreachable.
  event_name       text,
  -- Programme series ("portfolio"): private-debt, cfo-private-markets, ...
  series           text,
  target_amount    numeric,
  target_currency  text not null default 'GBP',
  target_sponsors  integer,
  notes            text,
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists event_targets_series_idx on public.event_targets (series);

drop trigger if exists event_targets_set_updated_at on public.event_targets;
create trigger event_targets_set_updated_at
  before update on public.event_targets
  for each row execute function public.set_updated_at();

alter table public.event_targets enable row level security;
drop policy if exists "event_targets_read" on public.event_targets;
create policy "event_targets_read" on public.event_targets for select using (true);


-- ##################################################################
-- ## Which event(s) a lead is being pursued for (0010)
-- ##################################################################

alter table public.leads
  add column if not exists target_events jsonb not null default '[]'::jsonb;

-- Lets "who else has this event in their pipeline?" use the index rather than
-- scanning every lead's JSON.
create index if not exists leads_target_events_idx
  on public.leads using gin (target_events jsonb_path_ops);


-- ##################################################################
-- ## Link CRM users to the ops panel's deal initials (0011)
-- ##################################################################

alter table public.profiles
  add column if not exists initials text;

-- Two people can't share initials, or "who signed this?" has two answers.
-- Case-insensitive, and NULLs are allowed (not everyone signs deals).
create unique index if not exists profiles_initials_unique
  on public.profiles (upper(initials)) where initials is not null;


-- ##################################################################
-- ## A person can claim an ops-panel deal as their own (0012)
-- ##################################################################

alter table public.ops_links drop constraint if exists ops_links_entity_type_check;
alter table public.ops_links
  add constraint ops_links_entity_type_check
  check (entity_type in ('lead', 'account', 'company', 'user'));


-- ##################################################################
-- ## Directory intelligence: the Master Directory workbook, Form ADV
-- ## provider links, LP commitments, team lists (0013)
-- ##################################################################

-- Firms the capture file hasn't classified yet get a book of their own
-- rather than a guess. (A new enum value can't be used in the transaction
-- that adds it; nothing below uses it.)
alter type company_category add value if not exists 'UN';

-- --- Companies: firmographics, Form ADV, LP and SP facts -------------------
alter table public.companies
  add column if not exists external_id        text unique,                  -- workbook id, e.g. "GP-0014"
  add column if not exists external_ids       text[] not null default '{}', -- every id merged into this record
  add column if not exists source             text,                         -- 'master_directory' when imported
  add column if not exists directory_vertical text,                         -- the sheet's own vertical / SP line
  add column if not exists state              text,                         -- "CA", "ON", "Zug"
  add column if not exists founded_year       integer,
  add column if not exists years_active       integer,
  add column if not exists employee_count     integer,
  add column if not exists industry           text,                         -- Lusha industry
  add column if not exists lusha_verified_on  date,
  add column if not exists catalog_updated_at timestamptz,
  add column if not exists sources            jsonb not null default '[]'::jsonb; -- [{label, url}]

alter table public.companies
  add column if not exists sec_crd                   text,
  add column if not exists sec_file_number           text,
  add column if not exists adv_firm_type             text,    -- 'Registered' | 'ERA'
  add column if not exists adv_matched_entity        text,
  add column if not exists adv_last_filed            date,
  add column if not exists adv_employee_count        integer,
  add column if not exists private_fund_count        integer,
  add column if not exists private_fund_gross_assets numeric, -- ERAs report this instead of RAUM
  add column if not exists regulatory_aum_usd        numeric, -- per registered SEC entity
  add column if not exists brand_entity_count        integer,
  add column if not exists brand_aum_total_usd       numeric, -- summed across the brand's entities
  add column if not exists adv_source_url            text,
  add column if not exists adv_entities              jsonb not null default '[]'::jsonb;

alter table public.companies
  add column if not exists investor_type            text,
  add column if not exists total_assets_usd         numeric,
  add column if not exists alts_allocation_pct      numeric,
  add column if not exists discloses_commitments    text,
  add column if not exists disclosure_source_url    text,
  add column if not exists assets_monitored_usd     numeric,
  add column if not exists assets_monitored_display text,
  add column if not exists lifecycle                text[] not null default '{}',   -- fund lifecycle stages an SP covers
  add column if not exists service_lines            jsonb not null default '[]'::jsonb; -- [{name, description, capabilities[]}]

create index if not exists companies_sec_crd_idx on public.companies (sec_crd) where sec_crd is not null;
create index if not exists companies_domain_idx on public.companies (lower(domain)) where domain is not null;

-- --- Contacts: the key people each book names -------------------------------
alter table public.contacts
  add column if not exists external_ref text unique, -- "GP-0014#jane-doe"
  add column if not exists source       text,
  add column if not exists connectable  boolean;     -- the team's master sheet holds a direct email

-- --- Service relationships: Form ADV Schedule D, one row per brand & role ---
alter table public.service_relationships
  add column if not exists external_key       text unique, -- "adv:GP-0014:auditor:kpmg"
  add column if not exists provider_key       text,        -- brand slug, groups every legal entity
  add column if not exists provider_brand     text,
  add column if not exists provider_entities  text[] not null default '{}', -- names as filed
  add column if not exists provider_locations text[] not null default '{}',
  add column if not exists fund_count         integer,
  add column if not exists fund_examples      text[] not null default '{}',
  add column if not exists source             text,        -- 'form_adv' | 'sample'
  add column if not exists source_url         text,
  add column if not exists filed              text;

create index if not exists service_rel_provider_key_idx on public.service_relationships (provider_key);

-- The original seed's links were illustrative; say so rather than let them
-- sit beside filed data looking like it.
update public.service_relationships
   set source = 'sample'
 where source is null and external_key is null;

-- --- Funds and commitments: the public LP -> GP allocation record ----------
alter table public.funds
  add column if not exists external_key text unique,
  add column if not exists manager_name text, -- when the manager isn't a directory firm
  add column if not exists source       text;

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
create policy "directory_lists_read" on public.directory_lists for select using (true);
drop policy if exists "directory_list_items_read" on public.directory_list_items;
create policy "directory_list_items_read" on public.directory_list_items for select using (true);
drop policy if exists "saved_searches_read" on public.saved_searches;
create policy "saved_searches_read" on public.saved_searches for select using (true);
drop policy if exists "directory_imports_read" on public.directory_imports;
create policy "directory_imports_read" on public.directory_imports for select using (true);
