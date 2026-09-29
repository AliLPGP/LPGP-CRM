-- directory: part 4 of 8
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create policy "directory_lists_read" on public.directory_lists for select using (true);
drop policy if exists "directory_list_items_read" on public.directory_list_items;
create policy "directory_list_items_read" on public.directory_list_items for select using (true);
drop policy if exists "saved_searches_read" on public.saved_searches;
create policy "saved_searches_read" on public.saved_searches for select using (true);
drop policy if exists "directory_imports_read" on public.directory_imports;
create policy "directory_imports_read" on public.directory_imports for select using (true);
-- ===========================================================================
-- LPGP Connect CRM -- fund lineup
--
-- The private funds GPs name on Form ADV Schedule D, one row per vehicle, with
-- the auditor, administrator, custodian or prime broker the filing ties each
-- one to. Import -> Master directory loads them alongside the provider links,
-- keyed "advfund:GP-0014:<fund>", so the next edition updates in place.
--
-- A fund is only called a feeder, a co-investment vehicle or Luxembourg-
-- domiciled when its legal name says so; otherwise those columns stay empty.
--
-- Run AFTER 0013_directory_intelligence.sql. Safe to re-run.
-- ===========================================================================

alter table public.funds
  add column if not exists name_filed        text,  -- exactly as filed
  add column if not exists vehicle_kind      text,  -- from the name: Feeder, Co-investment, Master ...
  add column if not exists domicile          text,  -- only when the legal form fixes it (SCSp, ICAV)
  add column if not exists currency          text,  -- a currency class the name states
  add column if not exists service_providers jsonb not null default '[]'::jsonb, -- [{role, key, brand}]
  add column if not exists filed             text,  -- which ADV filings named it
  add column if not exists source_url        text;

create index if not exists funds_source_idx on public.funds (source);
-- ===========================================================================
-- LPGP Connect CRM -- portfolio companies
--
-- The companies a GP owns or has owned, each with where it was found: the
-- manager's own portfolio page, a press release, or someone on the team
-- adding it by hand. Operating partners need no table of their own -- they
-- are contacts at the GP, recognised by title and pulled from Lusha with
-- source = 'lusha' (see lib/directory/operating.ts).
--
-- Run AFTER 0014_fund_lineup.sql. Safe to re-run.
-- ===========================================================================

create table if not exists public.portfolio_companies (
  id            uuid primary key default gen_random_uuid(),
  gp_company_id uuid not null references public.companies (id) on delete cascade,
  external_key  text unique,          -- "<gp id>:<name slug>", one row per company per GP
  name          text not null,
  domain        text,
  description   text,
  sector        text,
  hq            text,
  status        text,                 -- 'current' | 'realized', only when the source says
  invested_year integer,
  exit_year     integer,
  fund_name     text,
  source        text not null default 'manual', -- 'web_research' | 'manual'
  source_url    text,
  added_by      uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
