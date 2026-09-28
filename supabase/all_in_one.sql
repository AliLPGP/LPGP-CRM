-- ==================================================================
-- LPGP Connect CRM -- COMPLETE SETUP (schema + all seed data)
-- Paste into Supabase -> SQL Editor and Run. Idempotent.
-- Includes CRM auth (profiles) + leads pipeline tables.
-- ==================================================================


-- ##################################################################
-- ## schema.sql
-- ##################################################################

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
-- ## seed.sql
-- ##################################################################

-- ===========================================================================
-- LPGP Connect CRM -- starter seed (real firms + Lusha-sourced contacts)
-- Run in Supabase -> SQL Editor AFTER schema.sql. Safe to re-run (idempotent:
-- companies de-dupe on name, contacts on Lusha id).
--
-- Notes:
--  * AUM / allocation figures are approximate, public-domain (annual reports,
--    Form ADV, public disclosures). Treat as starting points and refine.
--  * Contact work emails were sourced via the Lusha connector (emails only).
--  * Solution Providers (SPs) are service firms, so they carry no AUM/allocation.
-- ===========================================================================

-- ----------------------------------------------------------------------------
-- LPs -- institutional investors
-- ----------------------------------------------------------------------------
insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'CalPERS', 'LP', 'Pension fund', 'North America', 'Active Allocator', 'United States', 'Sacramento', 'Sacramento, CA', 'https://www.calpers.ca.gov', 'calpers.ca.gov', 502400000000, 300, '$50M - $500M', 'Buyout, Growth, Core', 'Global', 'Largest US public pension. Builds a diversified total-fund portfolio with a growing private markets program across private equity, private debt and real assets.', '[{"label":"Public Equity","value":42},{"label":"Fixed Income","value":28},{"label":"Private Equity","value":17},{"label":"Real Assets","value":13}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('CalPERS'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'CPP Investments', 'LP', 'Pension fund', 'North America', 'Active Allocator', 'Canada', 'Toronto', 'Toronto, Canada', 'https://www.cppinvestments.com', 'cppinvestments.com', 480000000000, 150, '$100M - $1B', 'Buyout, Growth, Core', 'Global', 'Manages the Canada Pension Plan fund with a global, active strategy spanning private equity, credit, real assets and external managers.', '[{"label":"Public Equities","value":24},{"label":"Private Equity","value":24},{"label":"Real Assets","value":21},{"label":"Government Bonds","value":18},{"label":"Credit","value":13}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('CPP Investments'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Harvard Management Company', 'LP', 'Endowment', 'North America', 'Active Allocator', 'United States', 'Boston', 'Boston, MA', 'https://www.hmc.harvard.edu', 'hmc.harvard.edu', 53200000000, 120, '$25M - $200M', 'Venture, Growth, Buyout', 'Global', 'Manages Harvard University endowment with a heavy alternatives tilt toward private equity and hedge funds.', '[{"label":"Private Equity","value":39},{"label":"Hedge Funds","value":31},{"label":"Public Equity","value":14},{"label":"Bonds / TIPS","value":11},{"label":"Real Estate","value":5}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('Harvard Management Company'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Yale Investments Office', 'LP', 'Endowment', 'North America', 'Active Allocator', 'United States', 'New Haven', 'New Haven, CT', 'https://investments.yale.edu', 'investments.yale.edu', 40700000000, 100, '$20M - $150M', 'Venture, Buyout, Absolute Return', 'Global', 'Pioneer of the endowment model; allocates heavily to venture capital, leveraged buyouts and absolute return via long-term manager relationships.', '[{"label":"Venture Capital","value":25},{"label":"Absolute Return","value":20},{"label":"Leveraged Buyouts","value":17},{"label":"Foreign Equity","value":12},{"label":"Real Estate","value":9},{"label":"Bonds / Cash","value":8},{"label":"Other","value":9}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('Yale Investments Office'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Wellcome Trust', 'LP', 'Foundation', 'Europe', 'Active Allocator', 'United Kingdom', 'London', 'London, UK', 'https://wellcome.org', 'wellcome.org', 47000000000, 90, '£25M - £200M', 'Growth, Buyout, Venture', 'Global', 'Charitable foundation funding health research; runs a long-horizon endowment with a strong public and private equity allocation.', '[{"label":"Public Equity","value":50},{"label":"Private Equity","value":30},{"label":"Property","value":8},{"label":"Cash / Other","value":12}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('Wellcome Trust'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Ford Foundation', 'LP', 'Foundation', 'North America', 'Active Allocator', 'United States', 'New York', 'New York, NY', 'https://www.fordfoundation.org', 'fordfoundation.org', 16000000000, 70, '$10M - $75M', 'Growth, Buyout', 'Global', 'Social-justice philanthropy investing its endowment across public and private markets with a mission-aligned lens.', '[{"label":"Public Equity","value":40},{"label":"Private Equity","value":25},{"label":"Hedge Funds","value":20},{"label":"Fixed Income","value":10},{"label":"Real Assets","value":5}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('Ford Foundation'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'AustralianSuper', 'LP', 'Superannuation scheme', 'Asia Pacific', 'Active Allocator', 'Australia', 'Melbourne', 'Melbourne, Australia', 'https://www.australiansuper.com', 'australiansuper.com', 230000000000, 110, 'A$50M - A$1B', 'Core, Growth, Buyout', 'Global', 'Australia largest superannuation fund; scaling international private markets and infrastructure as assets grow.', '[{"label":"Equities","value":55},{"label":"Fixed Income","value":15},{"label":"Infrastructure","value":13},{"label":"Property","value":7},{"label":"Private Equity","value":6},{"label":"Cash","value":4}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('AustralianSuper'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'GIC', 'LP', 'Sovereign wealth fund', 'Asia Pacific', 'Active Allocator', 'Singapore', 'Singapore', 'Singapore', 'https://www.gic.com.sg', 'gic.com.sg', 770000000000, 200, '$100M - $1B', 'Core, Growth, Buyout', 'Global', 'Manages Singapore foreign reserves with a long-term, all-weather portfolio across public and private asset classes.', '[{"label":"Developed Equities","value":30},{"label":"Nominal Bonds","value":30},{"label":"Emerging Equities","value":16},{"label":"Real Estate","value":13},{"label":"Inflation-linked Bonds","value":6},{"label":"Private Equity","value":5}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('GIC'));

-- ----------------------------------------------------------------------------
-- GPs -- fund managers & VCs
-- ----------------------------------------------------------------------------
insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, lusha_company_id, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'BlackRock', 'GP', 'Asset manager', 'North America', 'Core GP', 'United States', 'New York', 'New York, NY', 'https://www.blackrock.com', 'blackrock.com', '5743592', 11500000000000, '$50M - $5B', 'All stages', 'Global', 'World largest asset manager spanning index, active, multi-asset and alternatives via iShares and institutional mandates.', '[{"label":"Equities","value":52},{"label":"Fixed Income","value":27},{"label":"Multi-Asset","value":8},{"label":"Cash","value":10},{"label":"Alternatives","value":3}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('BlackRock'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, lusha_company_id, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Blackstone', 'GP', 'Alternative asset manager', 'North America', 'Core GP', 'United States', 'New York', 'New York, NY', 'https://www.blackstone.com', 'blackstone.com', '16189032', 1100000000000, '$100M - $5B', 'Buyout, Core+, Credit', 'Global', 'Largest alternatives manager with leading real estate, credit, private equity and hedge fund solutions franchises.', '[{"label":"Credit & Insurance","value":33},{"label":"Real Estate","value":30},{"label":"Private Equity","value":22},{"label":"Multi-Asset","value":15}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('Blackstone'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, lusha_company_id, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'KKR', 'GP', 'Private equity', 'North America', 'Core GP', 'United States', 'New York', 'New York, NY', 'https://www.kkr.com', 'kkr.com', '40628456', 624000000000, '$100M - $3B', 'Buyout, Growth, Infrastructure', 'Global', 'Global investment firm across private equity, credit, infrastructure and real assets with a strong balance-sheet model.', '[{"label":"Credit","value":36},{"label":"Private Equity","value":30},{"label":"Real Assets","value":24},{"label":"Other","value":10}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('KKR'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Apollo Global Management', 'GP', 'Alternative asset manager', 'North America', 'Core GP', 'United States', 'New York', 'New York, NY', 'https://www.apollo.com', 'apollo.com', 751000000000, '$100M - $5B', 'Credit, Buyout, Hybrid', 'Global', 'Credit-led alternatives manager pairing investment-grade and opportunistic credit with private equity and real assets.', '[{"label":"Credit","value":76},{"label":"Private Equity","value":14},{"label":"Real Assets","value":10}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('Apollo Global Management'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, lusha_company_id, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Ares Management', 'GP', 'Private credit', 'North America', 'Core GP', 'United States', 'Los Angeles', 'Los Angeles, CA', 'https://www.aresmgmt.com', 'aresmgmt.com', '53826888', 464000000000, '$50M - $2B', 'Credit, Buyout, Secondaries', 'Global', 'Leading private credit manager with adjacent private equity, real assets and secondaries platforms.', '[{"label":"Credit","value":70},{"label":"Real Assets","value":13},{"label":"Private Equity","value":9},{"label":"Secondaries","value":8}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('Ares Management'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'The Carlyle Group', 'GP', 'Private equity', 'North America', 'Core GP', 'United States', 'Washington', 'Washington, DC', 'https://www.carlyle.com', 'carlyle.com', 447000000000, '$50M - $2B', 'Buyout, Growth, Credit', 'Global', 'Global private equity, credit and investment-solutions manager across corporate, real assets and fund-of-funds strategies.', '[{"label":"Global Credit","value":42},{"label":"Global Private Equity","value":36},{"label":"Investment Solutions","value":22}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('The Carlyle Group'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'EQT', 'GP', 'Private equity', 'Europe', 'Core GP', 'Sweden', 'Stockholm', 'Stockholm, Sweden', 'https://www.eqtgroup.com', 'eqtgroup.com', 140000000000, '€100M - €2B', 'Buyout, Infrastructure', 'Europe, North America, APAC', 'European-rooted global manager focused on private equity and infrastructure with a thematic, value-creation approach.', '[{"label":"Private Equity","value":60},{"label":"Infrastructure","value":30},{"label":"Real Estate","value":10}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('EQT'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Sequoia Capital', 'GP', 'Venture capital', 'North America', 'Core GP', 'United States', 'Menlo Park', 'Menlo Park, CA', 'https://www.sequoiacap.com', 'sequoiacap.com', 85000000000, '$1M - $250M', 'Seed, Venture, Growth', 'US, Europe, India', 'Storied venture firm backing founders from seed through growth across technology and healthcare.', '[{"label":"Venture","value":55},{"label":"Growth","value":30},{"label":"Public / Other","value":15}]'::jsonb
where not exists (select 1 from public.companies where lower(name) = lower('Sequoia Capital'));

-- ----------------------------------------------------------------------------
-- SPs -- solution providers (no AUM/allocation; service firms)
-- ----------------------------------------------------------------------------
insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'KPMG', 'SP', 'Audit & advisory', 'Global', 'Vendor', 'Netherlands', 'Amstelveen', 'Amstelveen, Netherlands', 'https://www.kpmg.com', 'kpmg.com', '270,000+', 'Big Four audit, tax and advisory network serving asset managers and institutional investors worldwide.'
where not exists (select 1 from public.companies where lower(name) = lower('KPMG'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'PwC', 'SP', 'Audit & advisory', 'Global', 'Vendor', 'United Kingdom', 'London', 'London, UK', 'https://www.pwc.com', 'pwc.com', '364,000+', 'Big Four professional services firm covering audit, deals, tax and consulting for the private markets industry.'
where not exists (select 1 from public.companies where lower(name) = lower('PwC'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'Deloitte', 'SP', 'Audit & advisory', 'Global', 'Vendor', 'United Kingdom', 'London', 'London, UK', 'https://www.deloitte.com', 'deloitte.com', '457,000+', 'Largest professional services network; audit, consulting, financial advisory and tax for GPs and LPs.'
where not exists (select 1 from public.companies where lower(name) = lower('Deloitte'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'MUFG', 'SP', 'Bank', 'Asia Pacific', 'Vendor', 'Japan', 'Tokyo', 'Tokyo, Japan', 'https://www.mufg.jp', 'mufg.jp', '120,000+', 'Global banking group providing financing, fund finance and transaction banking to alternative asset managers.'
where not exists (select 1 from public.companies where lower(name) = lower('MUFG'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'Apex Group', 'SP', 'Fund administrator', 'Global', 'Vendor', 'Bermuda', 'Hamilton', 'Hamilton, Bermuda', 'https://www.apexgroup.com', 'apexgroup.com', '13,000+', 'Single-source fund administration, depositary and middle-office services for funds across strategies.'
where not exists (select 1 from public.companies where lower(name) = lower('Apex Group'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'Citco', 'SP', 'Fund administrator', 'Global', 'Vendor', 'United States', 'New York', 'New York, NY', 'https://www.citco.com', 'citco.com', '8,000+', 'Leading hedge fund and private markets administrator providing NAV, treasury and investor services.'
where not exists (select 1 from public.companies where lower(name) = lower('Citco'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'Kirkland & Ellis', 'SP', 'Law firm', 'North America', 'Vendor', 'United States', 'Chicago', 'Chicago, IL', 'https://www.kirkland.com', 'kirkland.com', '7,000+', 'Top private equity law firm advising on fund formation, M&A and financing for sponsors globally.'
where not exists (select 1 from public.companies where lower(name) = lower('Kirkland & Ellis'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'Simpson Thacher & Bartlett', 'SP', 'Law firm', 'North America', 'Vendor', 'United States', 'New York', 'New York, NY', 'https://www.stblaw.com', 'stblaw.com', '2,000+', 'Premier fund formation and private equity legal practice advising leading global GPs and LPs.'
where not exists (select 1 from public.companies where lower(name) = lower('Simpson Thacher & Bartlett'));

-- ----------------------------------------------------------------------------
-- Contacts (work emails via Lusha; de-dupe on Lusha contact id)
-- ----------------------------------------------------------------------------
-- BlackRock
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('BlackRock') limit 1), 'Gavin','Lewis','Managing Director, Head of Institutional','Director','General Management','gavin.lewis@blackrock.com','https://www.linkedin.com/in/gavin-lewis-19b0664','United Kingdom','London','494938814'
where not exists (select 1 from public.contacts where lusha_contact_id='494938814');

insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('BlackRock') limit 1), 'Claire','Lane','Managing Director & Chief Marketing Officer, EMEA','C-Suite','Marketing','claire.lane@blackrock.com','https://www.linkedin.com/in/claire-lane-b1ab864a','United Kingdom',null,'92629316'
where not exists (select 1 from public.contacts where lusha_contact_id='92629316');

insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('BlackRock') limit 1), 'Stephen','Scharf','Managing Director & Global CISO','C-Suite','Information Technology','stephen.scharf@blackrock.com','https://www.linkedin.com/in/stephen-scharf-75373113','United States','Boston','1314712489'
where not exists (select 1 from public.contacts where lusha_contact_id='1314712489');

-- Blackstone
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Blackstone') limit 1), 'Kenneth','Caplan','Global Co-Chief Investment Officer','C-Suite','Finance','kenneth.caplan@blackstone.com','https://www.linkedin.com/in/ken-caplan','United States','New York','355761437'
where not exists (select 1 from public.contacts where lusha_contact_id='355761437');

insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Blackstone') limit 1), 'Mukesh','Mehta','Chief Investment Officer & Senior MD, Private Equity','C-Suite','Finance','mukesh.mehta@blackstone.com','https://www.linkedin.com/in/mukesh-mehta-1920012','India','Mumbai','426796744'
where not exists (select 1 from public.contacts where lusha_contact_id='426796744');

insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Blackstone') limit 1), 'James','Seppala','Senior Managing Director & Head of Real Estate','Director','General Management','james.seppala@blackstone.com','https://www.linkedin.com/in/james-seppala','United Kingdom','London','826352526'
where not exists (select 1 from public.contacts where lusha_contact_id='826352526');

-- KKR
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('KKR') limit 1), 'Tara','Davies','Partner, Head of European Infrastructure','Partner','General Management','tara.davies@kkr.com','https://www.linkedin.com/in/tara-courtney-davies','United Kingdom','London','665840378'
where not exists (select 1 from public.contacts where lusha_contact_id='665840378');

insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('KKR') limit 1), 'Vincent','Policard','Partner','Partner','General Management','vincent.policard@kkr.com','https://www.linkedin.com/in/vincent-policard-790b999b','United Kingdom','London','743914871'
where not exists (select 1 from public.contacts where lusha_contact_id='743914871');

insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('KKR') limit 1), 'Shreya','Malik','Managing Director','Director','General Management','shreya.malik@kkr.com','https://www.linkedin.com/in/shreyamalik','United Kingdom',null,'19029368'
where not exists (select 1 from public.contacts where lusha_contact_id='19029368');

-- Ares Management
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Ares Management') limit 1), 'Michael','Arougheti','Co-Founder & Chief Executive Officer','Founder','General Management','marougheti@aresmgmt.com','https://www.linkedin.com/in/michael-arougheti','United States','New York','465136760'
where not exists (select 1 from public.contacts where lusha_contact_id='465136760');

insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Ares Management') limit 1), 'Daniel','Taylor','Partner, Co-Head of Global Product & Investor Relations','Partner','Investor Relations','dtaylor@aresmgmt.com','https://www.linkedin.com/in/daniel-j-taylor-4067382','United Kingdom','London','462129709'
where not exists (select 1 from public.contacts where lusha_contact_id='462129709');

insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Ares Management') limit 1), 'Eli','Appelbaum','Partner, Co-Head of Europe, Alternative Credit','Partner','Finance','eappelbaum@aresmgmt.com','https://www.linkedin.com/in/eli-appelbaum','United Kingdom','London','75431114'
where not exists (select 1 from public.contacts where lusha_contact_id='75431114');

-- CPP Investments
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('CPP Investments') limit 1), 'John','Graham','President & Chief Executive Officer','C-Suite','General Management','jgraham@cppib.ca','https://www.linkedin.com/in/johngrahamcppib','Canada','Toronto','108838240'
where not exists (select 1 from public.contacts where lusha_contact_id='108838240');

insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('CPP Investments') limit 1), 'Amy','Flikerski','Managing Director, Head of External Portfolio Management','Director','Finance','amy.flikerski@cppinvestments.com','https://www.linkedin.com/in/amy-flikerski-1730b023','United Kingdom',null,'834110304'
where not exists (select 1 from public.contacts where lusha_contact_id='834110304');

insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('CPP Investments') limit 1), 'Maximilian','Biagosch','Senior Managing Director','Director','General Management','maximilian.biagosch@cppinvestments.com','https://www.linkedin.com/in/maximilian-biagosch-79aa369','United Kingdom','London','711450727'
where not exists (select 1 from public.contacts where lusha_contact_id='711450727');


-- ##################################################################
-- ## seed_companies_2.sql
-- ##################################################################

-- ===========================================================================
-- LPGP Connect CRM -- company expansion (12 more major firms)
-- Run AFTER schema.sql. Idempotent (de-dupes on name). Approximate public-domain
-- AUM / allocation figures (annual reports, Form ADV style) -- refine as needed.
-- ===========================================================================

-- ---- LPs ----
insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'CalSTRS', 'LP', 'Pension fund', 'North America', 'Active Allocator', 'United States', 'West Sacramento', 'West Sacramento, CA', 'https://www.calstrs.com', 'calstrs.com', 350000000000, 200, '$50M - $400M', 'Buyout, Growth, Core', 'Global', 'Second-largest US public pension; diversified total fund with a sizeable private equity and real estate program and a collaborative co-investment model.', '[{"label":"Public Equity","value":42},{"label":"Private Equity","value":17},{"label":"Real Estate","value":15},{"label":"Risk Mitigating","value":14},{"label":"Fixed Income","value":12}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('CalSTRS'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Ontario Teachers'' Pension Plan', 'LP', 'Pension fund', 'North America', 'Active Allocator', 'Canada', 'Toronto', 'Toronto, Canada', 'https://www.otpp.com', 'otpp.com', 190000000000, 150, '$100M - $1B', 'Buyout, Growth, Infrastructure', 'Global', 'Direct-investing Canadian pension plan with strong infrastructure, private equity and natural-resources teams alongside external managers.', '[{"label":"Equities","value":33},{"label":"Fixed Income","value":27},{"label":"Real Assets","value":22},{"label":"Credit","value":12},{"label":"Inflation Hedge","value":6}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Ontario Teachers'' Pension Plan'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Abu Dhabi Investment Authority', 'LP', 'Sovereign wealth fund', 'Middle East & Africa', 'Active Allocator', 'United Arab Emirates', 'Abu Dhabi', 'Abu Dhabi, UAE', 'https://www.adia.ae', 'adia.ae', 1000000000000, 250, '$100M - $2B', 'Core, Buyout, Growth', 'Global', 'One of the world largest sovereign investors, deploying across a broad reference portfolio with deep external manager and direct programs.', '[{"label":"Developed Equities","value":42},{"label":"Alternatives","value":31},{"label":"Government Bonds","value":15},{"label":"Emerging Equities","value":12}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Abu Dhabi Investment Authority'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Norges Bank Investment Management', 'LP', 'Sovereign wealth fund', 'Europe', 'Active Allocator', 'Norway', 'Oslo', 'Oslo, Norway', 'https://www.nbim.no', 'nbim.no', 1800000000000, 100, '$100M - $2B', 'Core, Index, Real Assets', 'Global', 'Manages Norway Government Pension Fund Global — a predominantly listed-equity portfolio with growing unlisted real estate and renewable infrastructure.', '[{"label":"Equities","value":71},{"label":"Fixed Income","value":26},{"label":"Real Assets","value":3}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Norges Bank Investment Management'));

-- ---- GPs ----
insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Brookfield Asset Management', 'GP', 'Alternative asset manager', 'North America', 'Core GP', 'Canada', 'Toronto', 'Toronto, Canada', 'https://www.brookfield.com', 'brookfield.com', 1000000000000, '$100M - $5B', 'Buyout, Infrastructure, Real Assets', 'Global', 'Leading real-assets and alternatives manager across infrastructure, renewable power, real estate, private equity and credit.', '[{"label":"Infrastructure","value":32},{"label":"Real Estate","value":23},{"label":"Renewable Power & Transition","value":18},{"label":"Credit","value":14},{"label":"Private Equity","value":13}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Brookfield Asset Management'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'TPG', 'GP', 'Private equity', 'North America', 'Core GP', 'United States', 'Fort Worth', 'Fort Worth, TX', 'https://www.tpg.com', 'tpg.com', 250000000000, '$50M - $2B', 'Buyout, Growth, Impact', 'Global', 'Diversified alternatives platform spanning buyout (TPG Capital), growth, impact (Rise), real estate and market solutions / credit (Angelo Gordon).', '[{"label":"Capital (Buyout)","value":38},{"label":"Growth","value":22},{"label":"Market Solutions / Credit","value":18},{"label":"Impact","value":12},{"label":"Real Estate","value":10}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('TPG'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Vista Equity Partners', 'GP', 'Private equity', 'North America', 'Core GP', 'United States', 'Austin', 'Austin, TX', 'https://www.vistaequitypartners.com', 'vistaequitypartners.com', 100000000000, '$50M - $1.5B', 'Buyout, Growth', 'North America, Europe', 'Enterprise-software specialist using operational value creation across flagship buyout, mid-market and credit strategies.', '[{"label":"Flagship Buyout","value":55},{"label":"Foundation (Mid)","value":25},{"label":"Endeavor (Growth)","value":12},{"label":"Credit","value":8}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Vista Equity Partners'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Thoma Bravo', 'GP', 'Private equity', 'North America', 'Core GP', 'United States', 'Chicago', 'Chicago, IL', 'https://www.thomabravo.com', 'thomabravo.com', 160000000000, '$50M - $2B', 'Buyout, Growth', 'North America, Europe', 'Software-focused buyout firm scaling flagship, mid-market (Discover) and lower-mid (Explore) funds plus a credit platform.', '[{"label":"Flagship Buyout","value":60},{"label":"Discover (Mid)","value":22},{"label":"Explore (Lower-Mid)","value":10},{"label":"Credit","value":8}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Thoma Bravo'));

-- ---- SPs ----
insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'EY', 'SP', 'Audit & advisory', 'Global', 'Vendor', 'United Kingdom', 'London', 'London, UK', 'https://www.ey.com', 'ey.com', '395,000+', 'Big Four assurance, tax, strategy and transactions firm serving asset managers, GPs and institutional investors.'
where not exists (select 1 from public.companies where lower(name)=lower('EY'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'Goldman Sachs', 'SP', 'Bank', 'North America', 'Vendor', 'United States', 'New York', 'New York, NY', 'https://www.goldmansachs.com', 'goldmansachs.com', '46,000+', 'Global investment bank providing financial sponsors coverage, financing, M&A advisory and prime services to private markets.'
where not exists (select 1 from public.companies where lower(name)=lower('Goldman Sachs'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'SS&C Technologies', 'SP', 'Fund administrator', 'North America', 'Vendor', 'United States', 'Windsor', 'Windsor, CT', 'https://www.ssctech.com', 'ssctech.com', '27,000+', 'Financial technology and fund administration provider for alternatives, delivering accounting, transfer agency and operations software.'
where not exists (select 1 from public.companies where lower(name)=lower('SS&C Technologies'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'Latham & Watkins', 'SP', 'Law firm', 'North America', 'Vendor', 'United States', 'Los Angeles', 'Los Angeles, CA', 'https://www.lw.com', 'lw.com', '7,000+', 'Global law firm with leading fund formation, private equity, finance and capital-markets practices.'
where not exists (select 1 from public.companies where lower(name)=lower('Latham & Watkins'));


-- ##################################################################
-- ## seed_companies_3.sql
-- ##################################################################

-- ===========================================================================
-- LPGP Connect CRM -- company expansion wave 3 (12 more major firms)
-- Run AFTER schema.sql. Idempotent (de-dupes on name). Approximate public-domain
-- AUM / allocation figures (annual reports, regulatory disclosures).
-- ===========================================================================

-- ---- LPs ----
insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Temasek', 'LP', 'Sovereign wealth fund', 'Asia Pacific', 'Active Allocator', 'Singapore', 'Singapore', 'Singapore', 'https://www.temasek.com.sg', 'temasek.com.sg', 285000000000, 180, '$50M - $1B', 'Growth, Buyout, Direct', 'Global', 'Singapore state investor running a concentrated, conviction-led direct portfolio across technology, financial services, consumer and sustainability.', '[{"label":"Singapore","value":27},{"label":"Asia (ex-SG/China)","value":23},{"label":"Americas","value":22},{"label":"China","value":19},{"label":"EMEA","value":9}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Temasek'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Teacher Retirement System of Texas', 'LP', 'Pension fund', 'North America', 'Active Allocator', 'United States', 'Austin', 'Austin, TX', 'https://www.trs.texas.gov', 'trs.texas.gov', 210000000000, 220, '$50M - $500M', 'Buyout, Growth, Core', 'Global', 'One of the largest US public pensions; sophisticated private markets and principal-investment programs with extensive co-investment.', '[{"label":"Global Equity","value":54},{"label":"Real Return","value":21},{"label":"Stable Value","value":16},{"label":"Risk Parity","value":8},{"label":"Cash","value":1}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Teacher Retirement System of Texas'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Future Fund', 'LP', 'Sovereign wealth fund', 'Asia Pacific', 'Active Allocator', 'Australia', 'Melbourne', 'Melbourne, Australia', 'https://www.futurefund.gov.au', 'futurefund.gov.au', 160000000000, 120, 'A$50M - A$1B', 'Core, Growth, Buyout', 'Global', 'Australia sovereign wealth fund with a flexible, whole-of-portfolio approach and significant alternatives and private equity exposure.', '[{"label":"Global Equities","value":36},{"label":"Private Equity","value":17},{"label":"Alternatives","value":15},{"label":"Infrastructure & Property","value":14},{"label":"Cash","value":10},{"label":"Debt","value":8}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Future Fund'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, active_funds, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'OMERS', 'LP', 'Pension fund', 'North America', 'Active Allocator', 'Canada', 'Toronto', 'Toronto, Canada', 'https://www.omers.com', 'omers.com', 95000000000, 130, '$50M - $750M', 'Buyout, Infrastructure, Direct', 'Global', 'Ontario municipal pension with a direct-drive model across private equity, infrastructure (OMERS Infrastructure) and real estate (Oxford).', '[{"label":"Infrastructure","value":23},{"label":"Public Equity","value":22},{"label":"Credit / Bonds","value":20},{"label":"Private Equity","value":18},{"label":"Real Estate","value":17}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('OMERS'));

-- ---- GPs ----
insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'CVC Capital Partners', 'GP', 'Private equity', 'Europe', 'Core GP', 'Luxembourg', 'Luxembourg', 'Luxembourg', 'https://www.cvc.com', 'cvc.com', 200000000000, '€100M - €2B', 'Buyout, Growth, Credit', 'Europe, Americas, Asia', 'Global private markets manager across European/American buyout, Asia, strategic opportunities, secondaries and credit.', '[{"label":"Private Equity (Europe/Americas)","value":55},{"label":"Credit","value":20},{"label":"Strategic Opportunities","value":13},{"label":"Asia","value":12}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('CVC Capital Partners'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Bain Capital', 'GP', 'Private equity', 'North America', 'Core GP', 'United States', 'Boston', 'Boston, MA', 'https://www.baincapital.com', 'baincapital.com', 185000000000, '$50M - $2B', 'Buyout, Credit, Venture', 'Global', 'Multi-asset alternatives firm spanning private equity, credit, special situations, ventures, real estate and public equity.', '[{"label":"Private Equity","value":40},{"label":"Credit","value":30},{"label":"Special Situations","value":12},{"label":"Ventures","value":8},{"label":"Real Estate","value":6},{"label":"Public Equity","value":4}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Bain Capital'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'Warburg Pincus', 'GP', 'Private equity', 'North America', 'Core GP', 'United States', 'New York', 'New York, NY', 'https://www.warburgpincus.com', 'warburgpincus.com', 86000000000, '$50M - $1B', 'Growth, Buyout', 'Global', 'Growth-oriented private equity investor across technology, financial services, healthcare and industrials with a global footprint.', '[{"label":"Technology","value":35},{"label":"Financial Services","value":20},{"label":"Healthcare","value":18},{"label":"Industrial & Business Services","value":15},{"label":"Real Estate","value":12}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('Warburg Pincus'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, aum_usd, check_size, preferred_stages, geographic_focus, investment_thesis, allocations)
select 'General Atlantic', 'GP', 'Growth equity', 'North America', 'Core GP', 'United States', 'New York', 'New York, NY', 'https://www.generalatlantic.com', 'generalatlantic.com', 100000000000, '$25M - $1B', 'Growth, Late Venture', 'Global', 'Global growth equity firm partnering with category-leading companies across technology, financial services, healthcare, consumer and climate.', '[{"label":"Technology","value":40},{"label":"Financial Services","value":18},{"label":"Healthcare","value":17},{"label":"Consumer","value":15},{"label":"Climate","value":10}]'::jsonb
where not exists (select 1 from public.companies where lower(name)=lower('General Atlantic'));

-- ---- SPs ----
insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'State Street', 'SP', 'Fund administrator', 'North America', 'Vendor', 'United States', 'Boston', 'Boston, MA', 'https://www.statestreet.com', 'statestreet.com', '46,000+', 'Global custodian and asset servicer providing fund administration, custody and middle-office services to institutional investors and managers.'
where not exists (select 1 from public.companies where lower(name)=lower('State Street'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'Morgan Stanley', 'SP', 'Bank', 'North America', 'Vendor', 'United States', 'New York', 'New York, NY', 'https://www.morganstanley.com', 'morganstanley.com', '80,000+', 'Global investment bank offering financial sponsors coverage, capital raising, M&A advisory and prime brokerage to private markets.'
where not exists (select 1 from public.companies where lower(name)=lower('Morgan Stanley'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'Clifford Chance', 'SP', 'Law firm', 'Europe', 'Vendor', 'United Kingdom', 'London', 'London, UK', 'https://www.cliffordchance.com', 'cliffordchance.com', '7,000+', 'Global law firm with leading funds, private equity, finance and regulatory practices across Europe, US, Middle East and Asia.'
where not exists (select 1 from public.companies where lower(name)=lower('Clifford Chance'));

insert into public.companies (name, category, sub_type, region, status, country, city, hq_location, website, domain, employee_range, investment_thesis)
select 'Aztec Group', 'SP', 'Fund administrator', 'Europe', 'Vendor', 'Jersey', 'St Helier', 'St Helier, Jersey', 'https://www.aztecgroup.co.uk', 'aztecgroup.co.uk', '2,000+', 'Independent European fund and corporate services administrator specialising in private equity, real assets, debt and venture funds.'
where not exists (select 1 from public.companies where lower(name)=lower('Aztec Group'));


-- ##################################################################
-- ## seed_contacts_2.sql
-- ##################################################################

-- ===========================================================================
-- LPGP Connect CRM -- contacts wave 2 (work emails via Lusha; emails only)
-- Run AFTER schema.sql and seed.sql. Idempotent (de-dupes on Lusha contact id).
-- Covers the remaining seeded LPs/GPs. (Harvard returned only university admin
-- staff via Lusha, so it is left without contacts for now.)
-- ===========================================================================

-- CalPERS (LP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('CalPERS') limit 1), 'Stephen','Gilmore','Chief Investment Officer','C-Suite','Finance','stephen.gilmore@calpers.ca.gov','https://www.linkedin.com/in/stephen-gilmore-a68015169','United States','Sacramento','324549214'
where not exists (select 1 from public.contacts where lusha_contact_id='324549214');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('CalPERS') limit 1), 'Dan','Bienvenue','Managing Director of Global Equity','Director','Finance','dan_bienvenue@calpers.ca.gov','https://www.linkedin.com/in/dan-bienvenue-cfa-caia-7031a15','United States','Folsom','233522483'
where not exists (select 1 from public.contacts where lusha_contact_id='233522483');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('CalPERS') limit 1), 'Mascha','Canio','Managing Director of Private Debt','Director','Finance','mascha.canio@calpers.ca.gov','https://www.linkedin.com/in/mascha-canio-095a39a','United States','Sacramento','201487979'
where not exists (select 1 from public.contacts where lusha_contact_id='201487979');

-- Yale Investments Office (LP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Yale Investments Office') limit 1), 'Vincent','Clarke','Director of Capital Markets','Director','Finance','vincent.clarke@yale.edu','https://www.linkedin.com/in/vincent-clarke-cfa-4823365','United States','New York','30428658'
where not exists (select 1 from public.contacts where lusha_contact_id='30428658');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Yale Investments Office') limit 1), 'Amy','Chivetta','Managing Director','Director','General Management','amy.chivetta@yale.edu','https://www.linkedin.com/in/amy-chivetta-70895475','United States','New Haven','584300200'
where not exists (select 1 from public.contacts where lusha_contact_id='584300200');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Yale Investments Office') limit 1), 'Cole','Weston','Director','Director','Investments','cole.weston@yale.edu','https://www.linkedin.com/in/cole-weston-ab7888a6','United States','New York','517916808'
where not exists (select 1 from public.contacts where lusha_contact_id='517916808');

-- Wellcome Trust (LP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Wellcome Trust') limit 1), 'Audrey','Duncanson','Senior Portfolio Manager','Manager','Finance','a.duncanson@wellcome.org','https://www.linkedin.com/in/audrey-duncanson-4404a249','United Kingdom','London','496452213'
where not exists (select 1 from public.contacts where lusha_contact_id='496452213');

-- Ford Foundation (LP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Ford Foundation') limit 1), 'Emily','O''Leary','Associate Director of Investments','Director','Finance','e.oleary@fordfoundation.org','https://www.linkedin.com/in/emily-o-leary-95932a5','United States',null,'319726128'
where not exists (select 1 from public.contacts where lusha_contact_id='319726128');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Ford Foundation') limit 1), 'Pat','Uttamobol','Investment Director','Director','Finance','p.uttamobol@fordfoundation.org','https://www.linkedin.com/in/patuttamobol','United States','New York','19143054'
where not exists (select 1 from public.contacts where lusha_contact_id='19143054');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Ford Foundation') limit 1), 'Michael','Walden','Director of Public Investments','Director','Finance','m.walden@fordfoundation.org','https://www.linkedin.com/in/michael-walden-cfa-93026135','United States','Princeton','634158200'
where not exists (select 1 from public.contacts where lusha_contact_id='634158200');

-- AustralianSuper (LP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('AustralianSuper') limit 1), 'Mark','Delaney','Chief Investment Officer','C-Suite','Finance','mdelaney@australiansuper.com','https://www.linkedin.com/in/mark-delaney-99313238','Australia','Melbourne','782155862'
where not exists (select 1 from public.contacts where lusha_contact_id='782155862');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('AustralianSuper') limit 1), 'Paul','Dawson','Senior Investment Director, Infrastructure','Director','Finance','pdawson@australiansuper.com','https://www.linkedin.com/in/paul-dawson-cfa-54a9a344','Australia','Melbourne','516551552'
where not exists (select 1 from public.contacts where lusha_contact_id='516551552');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('AustralianSuper') limit 1), 'Deborah','Kelly','Senior Investment Director, Real Assets','Director','Finance','deborahkelly@australiansuper.com','https://www.linkedin.com/in/deborah-kelly-b62b4855','Australia','Sydney','442172102'
where not exists (select 1 from public.contacts where lusha_contact_id='442172102');

-- GIC (LP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('GIC') limit 1), 'Matthew','Lim','Managing Director','Director','General Management','matthewlim@gic.com.sg','https://www.linkedin.com/in/matthew-lim-6011a42','Singapore','Singapore','18383484'
where not exists (select 1 from public.contacts where lusha_contact_id='18383484');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('GIC') limit 1), 'Richard','Massey','Managing Director, Head of Real Estate','Director','General Management','richardmassey@gic.com.sg','https://www.linkedin.com/in/richard-massey-10ba0742','Australia',null,'390039085'
where not exists (select 1 from public.contacts where lusha_contact_id='390039085');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('GIC') limit 1), 'Kenneth','Ho','Portfolio Manager','Manager','Finance','kennethho@gic.com.sg','https://www.linkedin.com/in/hkykenneth','Singapore','Singapore','629821525'
where not exists (select 1 from public.contacts where lusha_contact_id='629821525');

-- Apollo Global Management (GP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Apollo Global Management') limit 1), 'Olivia','Wassenaar','Partner, Global Head of Infrastructure','Partner','General Management','owassenaar@apollo.com','https://www.linkedin.com/in/olivia-wassenaar-apollo','United States',null,'201572331'
where not exists (select 1 from public.contacts where lusha_contact_id='201572331');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Apollo Global Management') limit 1), 'Christine','Moy','Partner, Head of Digital Assets, Data & AI Strategy','Partner','General Management','christine.moy@apollo.com','https://www.linkedin.com/in/christine-moy','United States','New York','240978350'
where not exists (select 1 from public.contacts where lusha_contact_id='240978350');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Apollo Global Management') limit 1), 'Alex','Van Hoek','Lead Partner, European Private Equity','Partner','General Management','vanhoek@apollo.com','https://www.linkedin.com/in/alex-vanhoek-apollo','United Kingdom',null,'968009012'
where not exists (select 1 from public.contacts where lusha_contact_id='968009012');

-- The Carlyle Group (GP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('The Carlyle Group') limit 1), 'Constantin','Boye','Managing Director, Head of Carlyle Growth Europe','Director','General Management','constantin.boye@carlyle.com','https://www.linkedin.com/in/constantinboye','United Kingdom','London','10122668'
where not exists (select 1 from public.contacts where lusha_contact_id='10122668');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('The Carlyle Group') limit 1), 'Joshua','Pang','Managing Director','Director','General Management','joshua.pang@carlyle.com','https://www.linkedin.com/in/joshpang','United States','New York','255710962'
where not exists (select 1 from public.contacts where lusha_contact_id='255710962');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('The Carlyle Group') limit 1), 'Michael','Wand','Managing Director','Director','General Management','michael.wand@carlyle.com','https://www.linkedin.com/in/michael-wand-43b3a7','United Kingdom',null,'747821358'
where not exists (select 1 from public.contacts where lusha_contact_id='747821358');

-- EQT (GP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('EQT') limit 1), 'Felice','Verduyn Van Weegen','Partner','Partner','General Management','felice.verduyn@eqtpartners.com','https://www.linkedin.com/in/felice-verduyn-van-weegen-9286198','Netherlands','Amsterdam','350183023'
where not exists (select 1 from public.contacts where lusha_contact_id='350183023');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('EQT') limit 1), 'Robert','Maclean','Partner','Partner','General Management','robert.maclean@eqtpartners.com','https://www.linkedin.com/in/robert-maclean-b330a67','United Kingdom',null,'310577595'
where not exists (select 1 from public.contacts where lusha_contact_id='310577595');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('EQT') limit 1), 'Victor','Englesson','Partner, Global Co-Head of TMT','Partner','General Management','victor.englesson@eqtpartners.com','https://www.linkedin.com/in/victor-englesson-476a413','Sweden','Stockholm','755275706'
where not exists (select 1 from public.contacts where lusha_contact_id='755275706');

-- Sequoia Capital (GP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Sequoia Capital') limit 1), 'Roelof','Botha','Partner','Partner','General Management','roelof@sequoiacap.com','https://www.linkedin.com/in/roelofbotha','United States','Menlo Park','449122374'
where not exists (select 1 from public.contacts where lusha_contact_id='449122374');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Sequoia Capital') limit 1), 'Luciana','Lixandru','Partner','Partner','General Management','luciana@sequoiacap.com','https://www.linkedin.com/in/luciana-lixandru-11042875','United Kingdom',null,'363043142'
where not exists (select 1 from public.contacts where lusha_contact_id='363043142');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Sequoia Capital') limit 1), 'George','Robson','Partner','Partner','General Management','grobson@sequoiacap.com','https://www.linkedin.com/in/georgerobson','United Kingdom','London','694902507'
where not exists (select 1 from public.contacts where lusha_contact_id='694902507');


-- ##################################################################
-- ## seed_contacts_3.sql
-- ##################################################################

-- ===========================================================================
-- LPGP Connect CRM -- SP contacts wave (work emails via Lusha; emails only)
-- Run AFTER schema.sql and seed.sql. Idempotent (de-dupes on Lusha contact id).
-- ===========================================================================

-- KPMG (SP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('KPMG') limit 1), 'Vincent','Delmas','Head of Private Equity','Director','Finance','vdelmas@kpmg.fr','https://www.linkedin.com/in/vdelmas-kpmg','France',null,'214485094'
where not exists (select 1 from public.contacts where lusha_contact_id='214485094');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('KPMG') limit 1), 'Nicolas','Cottis','Partner, ESG Private Equity Lead, Deal Advisory','Partner','Finance','ncottis@kpmg.fr','https://www.linkedin.com/in/nicolascottis','France','Paris','23292353'
where not exists (select 1 from public.contacts where lusha_contact_id='23292353');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('KPMG') limit 1), 'Benoit','Durand','Head of Risk and Compliance, Financial Services','Director','Finance','bdurand@kpmg.fr','https://www.linkedin.com/in/benoit-d-9250012','France','Paris','83141647'
where not exists (select 1 from public.contacts where lusha_contact_id='83141647');

-- PwC (SP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('PwC') limit 1), 'Ben','Cox','Partner, Finance','Partner','Finance','ben.cox@pwc.com','https://www.linkedin.com/in/ben-cox','United Kingdom','London','535310737'
where not exists (select 1 from public.contacts where lusha_contact_id='535310737');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('PwC') limit 1), 'Leonie','Schreve','Partner','Partner','General Management','leonie.schreve@pwc.com','https://www.linkedin.com/in/leonieschreve','Netherlands',null,'574612213'
where not exists (select 1 from public.contacts where lusha_contact_id='574612213');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('PwC') limit 1), 'Anand','Balasubramanian','Partner, Financial Services Consulting','Partner','Consulting','anand.x.balasubramanian@pwc.com','https://www.linkedin.com/in/anand-balasubramanian-5120028','United Arab Emirates','Dubai','206079539'
where not exists (select 1 from public.contacts where lusha_contact_id='206079539');

-- Deloitte (SP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Deloitte') limit 1), 'Marieke','''T Hart','Partner, Private Equity Leader','Partner','Finance','hartm@deloitte.com','https://www.linkedin.com/in/marieke-t-hart-impactinvesteerder','Netherlands','Amsterdam','9481520'
where not exists (select 1 from public.contacts where lusha_contact_id='9481520');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Deloitte') limit 1), 'Hans','Scholtes','Partner','Partner','Finance','hscholtes@deloitte.com','https://www.linkedin.com/in/hans-scholtes-96b9936','Netherlands',null,'163276109'
where not exists (select 1 from public.contacts where lusha_contact_id='163276109');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Deloitte') limit 1), 'Dominika','Tomek','Partner, Financial Services Digital Transformation','Partner','Finance','dtomek@deloitte.co.uk','https://www.linkedin.com/in/dominika-tomek-144b261','United Kingdom',null,'532324407'
where not exists (select 1 from public.contacts where lusha_contact_id='532324407');

-- MUFG (SP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('MUFG') limit 1), 'Guillaume','Rey','Managing Director, Corporate Solutions EMEA & Global Financial Solutions','Director','Finance','guillaume.rey@uk.mufg.jp','https://www.linkedin.com/in/guillaume-rey-481639','France',null,'327658022'
where not exists (select 1 from public.contacts where lusha_contact_id='327658022');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('MUFG') limit 1), 'Robert','Kilcullen','Managing Director, Head of Advisory','Director','Consulting','rkilcullen@us.mufg.jp','https://www.linkedin.com/in/robert-kilcullen-809b6830','United States','New York','550160035'
where not exists (select 1 from public.contacts where lusha_contact_id='550160035');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('MUFG') limit 1), 'Jayaram','Palli','Managing Director','Director','General Management','jayaram.palli@uk.mufg.jp','https://www.linkedin.com/in/jayaram-palli-8564584','United Kingdom','London','642810429'
where not exists (select 1 from public.contacts where lusha_contact_id='642810429');

-- Apex Group (SP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Apex Group') limit 1), 'Yuko','Shimizu','Director of Business Development','Director','Business Development','yuko.shimizu@apexgroup.com','https://www.linkedin.com/in/yuko-shimizu','United Kingdom','London','36082160'
where not exists (select 1 from public.contacts where lusha_contact_id='36082160');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Apex Group') limit 1), 'Bryan','Atkinson','Managing Director','Director','General Management','bryan.atkinson@apexgroup.com','https://www.linkedin.com/in/bryan-atkinson-64596097','Ireland',null,'11080732'
where not exists (select 1 from public.contacts where lusha_contact_id='11080732');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Apex Group') limit 1), 'Alyson','Yule','Managing Director','Director','General Management','alyson.yule@apexgroup.com','https://www.linkedin.com/in/alyson-yule-15281332','United Kingdom',null,'50569466'
where not exists (select 1 from public.contacts where lusha_contact_id='50569466');

-- Citco (SP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Citco') limit 1), 'Bocar','Kante','Head of Business Development','Director','Business Development','bkante@citco.com','https://www.linkedin.com/in/bocar-kante-24215514','United Kingdom','London','450743225'
where not exists (select 1 from public.contacts where lusha_contact_id='450743225');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Citco') limit 1), 'William','Daunt','Managing Director','Director','General Management','wdaunt@citco.com','https://www.linkedin.com/in/william-daunt-a10b4437','Ireland','Dublin','517053446'
where not exists (select 1 from public.contacts where lusha_contact_id='517053446');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Citco') limit 1), 'Eef','Verachtert','Managing Director','Director','General Management','everachtert@citco.com','https://www.linkedin.com/in/eef-verachtert-46399b12','Luxembourg','Luxembourg','88672271'
where not exists (select 1 from public.contacts where lusha_contact_id='88672271');

-- Kirkland & Ellis (SP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Kirkland & Ellis') limit 1), 'Sandipan','De','Partner, Debt and Fund Finance','Partner','Finance','sandipan.de@kirkland.com','https://www.linkedin.com/in/sandikirklandfundfinance','United Kingdom','London','765319642'
where not exists (select 1 from public.contacts where lusha_contact_id='765319642');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Kirkland & Ellis') limit 1), 'Rebecca','Perlman','Partner','Partner','General Management','rebecca.perlman@kirkland.com','https://www.linkedin.com/in/rebecca-perlman-9b61304a','United Kingdom','London','372203794'
where not exists (select 1 from public.contacts where lusha_contact_id='372203794');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Kirkland & Ellis') limit 1), 'Suril','Patel','Partner','Partner','General Management','suril.patel@kirkland.com','https://www.linkedin.com/in/surilp','United Kingdom','London','83665288'
where not exists (select 1 from public.contacts where lusha_contact_id='83665288');

-- Simpson Thacher & Bartlett (SP)
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Simpson Thacher & Bartlett') limit 1), 'Alan','Klein','Partner','Partner','General Management','aklein@stblaw.com','https://www.linkedin.com/in/alan-m-klein-esq','United States','New York','157939310'
where not exists (select 1 from public.contacts where lusha_contact_id='157939310');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Simpson Thacher & Bartlett') limit 1), 'Adam','Furber','Partner','Partner','General Management','afurber@stblaw.com','https://www.linkedin.com/in/adam-c-furber-17786611','Hong Kong',null,'918780889'
where not exists (select 1 from public.contacts where lusha_contact_id='918780889');
insert into public.contacts (company_id, first_name, last_name, job_title, seniority, department, email, linkedin_url, country, city, lusha_contact_id)
select (select id from public.companies where lower(name)=lower('Simpson Thacher & Bartlett') limit 1), 'Adam','Gallagher','Partner','Partner','General Management','adam.gallagher@stblaw.com','https://www.linkedin.com/in/adam-gallagher-745186','United Kingdom',null,'415333065'
where not exists (select 1 from public.contacts where lusha_contact_id='415333065');


-- ##################################################################
-- ## seed_funds.sql
-- ##################################################################

-- ===========================================================================
-- LPGP Connect CRM -- flagship funds (fund-level data per GP)
-- Run AFTER schema.sql (or 0004_funds.sql) and the company seeds.
-- Idempotent (de-dupes on fund name). Figures are approximate, public-domain
-- (press releases, manager disclosures) -- NOT pulled from Form ADV Schedule D,
-- which is blocked from this environment. Refine with the live filing.
-- ===========================================================================

insert into public.funds (company_id, name, vintage_year, fund_size_usd, target_size_usd, strategy, geography, status)
select c.id, v.name, v.vintage, v.size, v.target, v.strategy, v.geography, v.status
from (values
  -- Blackstone
  ('Blackstone', 'Blackstone Real Estate Partners X', 2023, 30400000000::numeric, null::numeric, 'Real Estate', 'Global', 'Investing'),
  ('Blackstone', 'Blackstone Capital Partners VIII', 2019, 26000000000, null, 'Private Equity', 'Global', 'Investing'),
  ('Blackstone', 'BREP Europe VII', 2023, 11400000000, null, 'Real Estate', 'Europe', 'Investing'),
  -- KKR
  ('KKR', 'KKR North America Fund XIII', 2021, 19000000000, null, 'Private Equity', 'North America', 'Investing'),
  ('KKR', 'KKR Global Infrastructure Investors IV', 2021, 17000000000, null, 'Infrastructure', 'Global', 'Investing'),
  ('KKR', 'KKR Asian Fund IV', 2021, 15000000000, null, 'Private Equity', 'Asia', 'Investing'),
  -- Apollo
  ('Apollo Global Management', 'Apollo Investment Fund X', 2023, 20000000000, null, 'Private Equity', 'Global', 'Investing'),
  ('Apollo Global Management', 'Apollo Hybrid Value Fund III', 2023, 5000000000, null, 'Hybrid Value', 'Global', 'Investing'),
  -- Ares
  ('Ares Management', 'Ares Corporate Opportunities Fund VI', 2021, 8000000000, null, 'Private Equity', 'Global', 'Investing'),
  ('Ares Management', 'Ares Capital Europe VI', 2023, 12000000000, null, 'Private Credit', 'Europe', 'Investing'),
  -- Carlyle
  ('The Carlyle Group', 'Carlyle Partners VIII', 2023, 14800000000, null, 'Private Equity', 'Global', 'Investing'),
  ('The Carlyle Group', 'Carlyle Realty Partners IX', 2021, 8000000000, null, 'Real Estate', 'North America', 'Investing'),
  -- EQT
  ('EQT', 'EQT X', 2023, 23800000000, null, 'Private Equity', 'Europe / North America', 'Investing'),
  ('EQT', 'EQT Infrastructure VI', 2023, 23500000000, null, 'Infrastructure', 'Global', 'Investing'),
  ('EQT', 'EQT IX', 2021, 16900000000, null, 'Private Equity', 'Europe', 'Closed'),
  -- TPG
  ('TPG', 'TPG Partners VIII', 2022, 13400000000, null, 'Private Equity', 'Global', 'Investing'),
  ('TPG', 'TPG Rise Climate', 2021, 7300000000, null, 'Impact / Climate', 'Global', 'Investing'),
  -- Vista
  ('Vista Equity Partners', 'Vista Equity Partners Fund VIII', 2022, 20000000000, null, 'Software Buyout', 'North America', 'Investing'),
  ('Vista Equity Partners', 'Vista Foundation Fund IV', 2020, 4000000000, null, 'Software (Mid-Market)', 'North America', 'Closed'),
  -- Thoma Bravo
  ('Thoma Bravo', 'Thoma Bravo Fund XV', 2022, 24300000000, null, 'Software Buyout', 'North America', 'Investing'),
  ('Thoma Bravo', 'Thoma Bravo Fund XIV', 2020, 17800000000, null, 'Software Buyout', 'North America', 'Closed'),
  ('Thoma Bravo', 'Thoma Bravo Discover Fund IV', 2022, 6200000000, null, 'Software (Mid-Market)', 'North America', 'Investing'),
  -- CVC
  ('CVC Capital Partners', 'CVC Capital Partners Fund IX', 2023, 28100000000, null, 'Private Equity', 'Europe / Americas', 'Investing'),
  ('CVC Capital Partners', 'CVC Capital Partners Fund VIII', 2020, 23000000000, null, 'Private Equity', 'Europe / Americas', 'Closed'),
  -- Bain Capital
  ('Bain Capital', 'Bain Capital Fund XII', 2017, 9400000000, null, 'Private Equity', 'Global', 'Closed'),
  ('Bain Capital', 'Bain Capital Asia Fund V', 2022, 7100000000, null, 'Private Equity', 'Asia', 'Investing'),
  -- Warburg Pincus
  ('Warburg Pincus', 'Warburg Pincus Global Growth 14', 2021, 16000000000, null, 'Growth Equity', 'Global', 'Investing'),
  -- General Atlantic
  ('General Atlantic', 'General Atlantic Investment Partners 2021', 2021, 7800000000, null, 'Growth Equity', 'Global', 'Investing'),
  -- Brookfield
  ('Brookfield Asset Management', 'Brookfield Infrastructure Fund V', 2023, 30000000000, null, 'Infrastructure', 'Global', 'Investing'),
  ('Brookfield Asset Management', 'Brookfield Global Transition Fund II', 2024, 10000000000, null, 'Energy Transition', 'Global', 'Investing'),
  ('Brookfield Asset Management', 'Brookfield Capital Partners VI', 2024, null, 12000000000, 'Private Equity', 'Global', 'Fundraising')
) as v(company, name, vintage, size, target, strategy, geography, status)
join public.companies c on lower(c.name) = lower(v.company)
where not exists (select 1 from public.funds f where f.name = v.name);


-- ##################################################################
-- ## seed_commitments.sql
-- ##################################################################

-- ===========================================================================
-- LPGP Connect CRM -- sample LP commitments to funds (LP -> Fund -> GP)
-- Run AFTER 0005_commitments.sql, the company seeds and seed_funds.sql.
-- Idempotent (one row per LP+fund pair).
--
-- NOTE: amounts here are ILLUSTRATIVE / approximate. The relationships are
-- directionally real (these LPs are known investors in these managers), but
-- exact commitment sizes should be replaced with figures from each LP's public
-- private-markets disclosure (e.g. CalPERS/CalSTRS/TRS PE program reports).
-- ===========================================================================

insert into public.commitments (lp_company_id, fund_id, amount_usd, commitment_date)
select lp.id, fn.id, v.amount, v.cdate
from (values
  ('CalPERS', 'Blackstone Real Estate Partners X', 500000000::numeric, date '2023-06-01'),
  ('CalPERS', 'KKR North America Fund XIII', 400000000, date '2021-09-01'),
  ('CalSTRS', 'Blackstone Capital Partners VIII', 300000000, date '2020-03-01'),
  ('CalSTRS', 'Thoma Bravo Fund XV', 250000000, date '2022-10-01'),
  ('Teacher Retirement System of Texas', 'KKR Asian Fund IV', 200000000, date '2021-05-01'),
  ('Teacher Retirement System of Texas', 'EQT X', 300000000, date '2023-04-01'),
  ('CPP Investments', 'Carlyle Partners VIII', 350000000, date '2023-02-01'),
  ('Ontario Teachers'' Pension Plan', 'CVC Capital Partners Fund IX', 270000000, date '2023-07-01'),
  ('AustralianSuper', 'Brookfield Infrastructure Fund V', 250000000, date '2023-08-01'),
  ('GIC', 'Vista Equity Partners Fund VIII', 300000000, date '2022-06-01'),
  ('Future Fund', 'Apollo Investment Fund X', 200000000, date '2023-09-01'),
  ('OMERS', 'Ares Corporate Opportunities Fund VI', 150000000, date '2021-11-01')
) as v(lp_name, fund_name, amount, cdate)
join public.companies lp on lower(lp.name) = lower(v.lp_name)
join public.funds fn on fn.name = v.fund_name
where not exists (
  select 1 from public.commitments c where c.lp_company_id = lp.id and c.fund_id = fn.id
);


-- ##################################################################
-- ## seed_service_relationships.sql
-- ##################################################################

-- ===========================================================================
-- LPGP Connect CRM -- sample service relationships (which SPs a GP uses)
-- Run AFTER 0006_service_relationships.sql and the company seeds. Idempotent.
--
-- NOTE: these mappings are ILLUSTRATIVE / directional. Service-provider
-- engagements (counsel, auditor, fund admin, fund finance) are disclosed
-- piecemeal in fund launches, LPAs and press; replace with verified
-- relationships as you confirm them.
-- ===========================================================================

insert into public.service_relationships (client_company_id, provider_company_id, role)
select cl.id, pr.id, v.role
from (values
  ('Blackstone', 'Simpson Thacher & Bartlett', 'Legal counsel'),
  ('Blackstone', 'Deloitte', 'Auditor'),
  ('Blackstone', 'State Street', 'Fund administrator'),
  ('KKR', 'Kirkland & Ellis', 'Legal counsel'),
  ('KKR', 'KPMG', 'Auditor'),
  ('KKR', 'Citco', 'Fund administrator'),
  ('Apollo Global Management', 'Simpson Thacher & Bartlett', 'Legal counsel'),
  ('Apollo Global Management', 'Deloitte', 'Auditor'),
  ('Apollo Global Management', 'SS&C Technologies', 'Fund administrator'),
  ('Ares Management', 'Kirkland & Ellis', 'Legal counsel'),
  ('Ares Management', 'EY', 'Auditor'),
  ('Ares Management', 'MUFG', 'Fund finance'),
  ('The Carlyle Group', 'Latham & Watkins', 'Legal counsel'),
  ('The Carlyle Group', 'EY', 'Auditor'),
  ('EQT', 'Clifford Chance', 'Legal counsel'),
  ('EQT', 'KPMG', 'Auditor'),
  ('EQT', 'Aztec Group', 'Fund administrator'),
  ('TPG', 'Kirkland & Ellis', 'Legal counsel'),
  ('TPG', 'Goldman Sachs', 'Placement agent'),
  ('Vista Equity Partners', 'Kirkland & Ellis', 'Legal counsel'),
  ('Vista Equity Partners', 'Apex Group', 'Fund administrator'),
  ('Thoma Bravo', 'Kirkland & Ellis', 'Legal counsel'),
  ('Thoma Bravo', 'PwC', 'Auditor'),
  ('Brookfield Asset Management', 'Latham & Watkins', 'Legal counsel'),
  ('Brookfield Asset Management', 'Morgan Stanley', 'Banking'),
  ('CVC Capital Partners', 'Simpson Thacher & Bartlett', 'Legal counsel'),
  ('CVC Capital Partners', 'Aztec Group', 'Fund administrator'),
  ('Bain Capital', 'Kirkland & Ellis', 'Legal counsel'),
  ('Bain Capital', 'PwC', 'Auditor'),
  ('Warburg Pincus', 'Kirkland & Ellis', 'Legal counsel'),
  ('Warburg Pincus', 'EY', 'Auditor'),
  ('General Atlantic', 'Clifford Chance', 'Legal counsel'),
  ('BlackRock', 'PwC', 'Auditor')
) as v(client_name, provider_name, role)
join public.companies cl on lower(cl.name) = lower(v.client_name)
join public.companies pr on lower(pr.name) = lower(v.provider_name)
where not exists (
  select 1 from public.service_relationships s
  where s.client_company_id = cl.id
    and s.provider_company_id = pr.id
    and coalesce(s.role, '') = coalesce(v.role, '')
);


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
