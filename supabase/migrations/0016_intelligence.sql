-- ===========================================================================
-- LPGP Connect CRM — deals, signals and sports
--
-- The intelligence layer on top of the directory:
--   deals            transactions across every asset class — fund closes,
--                    acquisitions, stake sales, financings — each with the
--                    article or announcement that states it
--   signals          dated market news per asset class, each with its source
--   sports_teams     football clubs (and other teams) with ownership, revenue,
--                    valuation and following, every figure with its source
--   sports_team_owners  who owns or has invested in a team, with stakes
--   sports_investors the funds and groups that invest in sport
--   benchmarks       published market figures per asset class and strategy
--                    (fundraising, dry powder, returns, spreads), each with
--                    its publisher, period and page
--
-- Loaded from data/intelligence/*.json (Import -> Master directory -> Load the
-- intelligence dataset) and refreshed by the signals job. Rows carry their
-- source URL and an as-of; a figure no source states is null.
--
-- Run AFTER 0015_portfolio_companies.sql. Safe to re-run.
-- ===========================================================================

create table if not exists public.sports_investors (
  id             uuid primary key default gen_random_uuid(),
  external_key   text unique,
  name           text not null,
  investor_type  text,                -- private_equity | sovereign_wealth | family_office | consortium | corporate | individual | ...
  hq             text,
  domain         text,
  aum            numeric,             -- fund size or AUM as a source states it
  aum_currency   text,
  aum_as_of      text,
  aum_source_url text,
  summary        text,
  holdings       jsonb not null default '[]'::jsonb, -- [{target, sport, stake_pct, since_year, source_url}]
  company_id     uuid references public.companies (id) on delete set null, -- the directory firm, when it is one
  source_url     text,
  source         text not null default 'web_research',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.sports_teams (
  id                          uuid primary key default gen_random_uuid(),
  external_key                text unique,    -- "<league slug>--<team slug>"
  name                        text not null,
  short_name                  text,
  sport                       text not null default 'football',
  league                      text,
  country                     text,
  city                        text,
  stadium                     text,
  stadium_capacity            integer,
  stadium_capacity_source_url text,
  founded_year                integer,
  domain                      text,
  ownership_type              text,           -- individual_family | consortium | private_equity | sovereign_state | corporate | member_owned | public_listed | municipal | other | unknown
  ownership_summary           text,
  ownership_source_url        text,
  revenue                     numeric,
  revenue_currency            text,
  revenue_season              text,
  revenue_source_name         text,
  revenue_source_url          text,
  valuation                   numeric,
  valuation_currency          text,
  valuation_year              integer,
  valuation_source_name       text,
  valuation_source_url        text,
  social_followers            bigint,
  social_as_of                text,
  social_source_url           text,
  social_platforms            jsonb not null default '[]'::jsonb, -- [{platform, followers, as_of, source_url}]
  notes                       text,
  sources                     jsonb not null default '[]'::jsonb, -- [url]
  verification                jsonb not null default '[]'::jsonb, -- [{field, verdict, claimed, found, note, source_url}]
  source                      text not null default 'web_research',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists sports_teams_league_idx on public.sports_teams (league);

create table if not exists public.sports_team_owners (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.sports_teams (id) on delete cascade,
  name               text not null,
  kind               text,               -- individual | family | fund | company | state | members | other
  institutional      boolean not null default false, -- a fund, sovereign or corporate investor rather than a founder-owner
  investor_type      text,               -- private_equity | private_credit | sovereign_wealth | family_office | corporate | institutional
  stake_pct          numeric,
  since_year         integer,
  amount             numeric,
  currency           text,
  valuation_at_entry numeric,
  investor_id        uuid references public.sports_investors (id) on delete set null,
  company_id         uuid references public.companies (id) on delete set null,
  source_url         text,
  created_at         timestamptz not null default now()
);
create index if not exists sports_team_owners_team_idx on public.sports_team_owners (team_id);
create index if not exists sports_team_owners_company_idx on public.sports_team_owners (company_id);
create index if not exists sports_team_owners_investor_idx on public.sports_team_owners (investor_id);

create table if not exists public.deals (
  id                  uuid primary key default gen_random_uuid(),
  external_key        text unique,
  date                date,
  date_text           text,
  kind                text not null,      -- stake_sale | acquisition | minority_investment | debt_financing | stadium_financing | league_media_rights | league_stake | expansion_fee | fund_close | fundraise | company_acquisition | company_exit | secondary | other
  asset_class         text not null,      -- sports | private_equity | private_credit | venture_capital | real_estate | infrastructure | secondaries | hedge_funds | other
  sport               text,
  target              text not null,
  target_kind         text,               -- club | team | league | competition | company | fund | asset | other
  target_country      text,
  target_team_id      uuid references public.sports_teams (id) on delete set null,
  target_company_id   uuid references public.companies (id) on delete set null,
  target_fund_id      uuid references public.funds (id) on delete set null,
  investor            text not null,
  investor_type       text,
  investor_company_id uuid references public.companies (id) on delete set null,
  investor_id         uuid references public.sports_investors (id) on delete set null,
  seller              text,
  stake_pct           numeric,
  amount              numeric,
  currency            text,
  valuation           numeric,
  valuation_currency  text,
  headline            text not null,
  summary             text,
  source_name         text,
  source_url          text,
  source              text not null default 'web_research', -- web_research | manual
  added_by            uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists deals_class_date_idx on public.deals (asset_class, date desc);
create index if not exists deals_investor_company_idx on public.deals (investor_company_id);
create index if not exists deals_target_company_idx on public.deals (target_company_id);
create index if not exists deals_target_team_idx on public.deals (target_team_id);
create index if not exists deals_investor_idx on public.deals (investor_id);

create table if not exists public.signals (
  id           uuid primary key default gen_random_uuid(),
  external_key text unique,          -- the source URL, normalised
  date         date,
  asset_class  text not null,
  kind         text not null,        -- deal | fund_close | fundraise | people | regulatory | performance | news
  headline     text not null,
  summary      text,
  entities     text[] not null default '{}',
  company_ids  uuid[] not null default '{}', -- directory firms the headline names
  source_name  text,
  source_url   text,
  source       text not null default 'web_research', -- web_research | refresh
  created_at   timestamptz not null default now()
);
create index if not exists signals_class_date_idx on public.signals (asset_class, date desc);
-- A profile asks "which signals name this firm": company_ids @> '{id}' needs GIN.
create index if not exists signals_company_ids_idx on public.signals using gin (company_ids);

create table if not exists public.benchmarks (
  id           uuid primary key default gen_random_uuid(),
  external_key text unique,          -- class:strategy:metric:period:publisher
  asset_class  text not null,
  strategy     text,                 -- strategy key (lib/directory/strategies.ts) or null for the whole class
  metric       text not null,        -- fundraising_total | dry_powder | aum | median_net_irr | index_return | default_rate | spread_bps | deal_volume | fund_count | other
  label        text not null,        -- as the publisher words it
  value        numeric,
  unit         text,                 -- USD | EUR | GBP | pct | bps | x | count
  period       text,                 -- "2025", "Q2 2026", "vintage 2019", "12m to Jun 2026"
  geography    text,
  publisher    text,
  published_on date,
  source_url   text not null,
  note         text,
  source       text not null default 'web_research',
  created_at   timestamptz not null default now()
);
create index if not exists benchmarks_class_idx on public.benchmarks (asset_class, strategy);

drop trigger if exists sports_teams_set_updated_at on public.sports_teams;
create trigger sports_teams_set_updated_at
  before update on public.sports_teams
  for each row execute function public.set_updated_at();
drop trigger if exists sports_investors_set_updated_at on public.sports_investors;
create trigger sports_investors_set_updated_at
  before update on public.sports_investors
  for each row execute function public.set_updated_at();

alter table public.sports_investors   enable row level security;
alter table public.sports_teams       enable row level security;
alter table public.sports_team_owners enable row level security;
alter table public.deals              enable row level security;
alter table public.signals            enable row level security;
alter table public.benchmarks         enable row level security;

drop policy if exists "sports_investors_read" on public.sports_investors;
create policy "sports_investors_read" on public.sports_investors for select using (true);
drop policy if exists "sports_teams_read" on public.sports_teams;
create policy "sports_teams_read" on public.sports_teams for select using (true);
drop policy if exists "sports_team_owners_read" on public.sports_team_owners;
create policy "sports_team_owners_read" on public.sports_team_owners for select using (true);
drop policy if exists "deals_read" on public.deals;
create policy "deals_read" on public.deals for select using (true);
drop policy if exists "signals_read" on public.signals;
create policy "signals_read" on public.signals for select using (true);
drop policy if exists "benchmarks_read" on public.benchmarks;
create policy "benchmarks_read" on public.benchmarks for select using (true);
