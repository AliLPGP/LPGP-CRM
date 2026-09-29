-- directory: part 5 of 8
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create index if not exists portfolio_companies_gp_idx on public.portfolio_companies (gp_company_id);

alter table public.portfolio_companies enable row level security;
drop policy if exists "portfolio_companies_read" on public.portfolio_companies;
create policy "portfolio_companies_read" on public.portfolio_companies for select using (true);
-- ===========================================================================
-- LPGP Connect CRM -- deals, signals and sports
--
-- The intelligence layer on top of the directory:
--   deals            transactions across every asset class -- fund closes,
--                    acquisitions, stake sales, financings -- each with the
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
