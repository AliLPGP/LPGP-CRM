-- schema: part 14 of 15
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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
