-- schema: part 12 of 12
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- ##################################################################
-- ## Portfolio companies: what each GP owns or has owned, with the
-- ## source each one was found in (0015)
-- ##################################################################

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
