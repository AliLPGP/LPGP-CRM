-- ===========================================================================
-- LPGP Connect CRM — portfolio companies
--
-- The companies a GP owns or has owned, each with where it was found: the
-- manager's own portfolio page, a press release, or someone on the team
-- adding it by hand. Operating partners need no table of their own — they
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
create index if not exists portfolio_companies_gp_idx on public.portfolio_companies (gp_company_id);

alter table public.portfolio_companies enable row level security;
drop policy if exists "portfolio_companies_read" on public.portfolio_companies;
create policy "portfolio_companies_read" on public.portfolio_companies for select using (true);
