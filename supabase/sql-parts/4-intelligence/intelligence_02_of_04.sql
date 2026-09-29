-- intelligence: part 2 of 4
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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
