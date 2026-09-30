-- portco: part 1 of 1
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- 0022: what is known about a portfolio company or borrower beyond its name --
-- the filed accounts and officers Companies House holds for a UK company
-- (turnover, operating profit, depreciation and amortisation, so an EBITDA
-- that is arithmetic on stated figures, headcount, net assets), and the
-- executives a people database previews for its domain. One row per
-- company key, shared by portfolio_companies and the borrowers view, so a
-- lender's borrower and a sponsor's portfolio company that are the same
-- firm read the same record. Idempotent.

create table if not exists public.portco_intel (
  key                 text primary key,           -- public.borrower_key(name)
  name                text not null,
  domain              text,
  country             text,
  -- Companies House
  ch_number           text,
  ch_name             text,
  ch_status           text,
  ch_type             text,
  sic_codes           text[] not null default '{}',
  incorporated_on     date,
  registered_address  text,
  officers            jsonb not null default '[]'::jsonb, -- [{name, role, occupation, appointed_on, resigned_on}]
  -- latest filed accounts, as the iXBRL states them
  accounts_period_end date,
  accounts_type       text,
  accounts_url        text,
  currency            text,
  revenue             numeric,
  gross_profit        numeric,
  operating_profit    numeric,
  profit_before_tax   numeric,
  depreciation        numeric,
  amortisation        numeric,
  ebitda_derived      numeric,      -- operating profit + depreciation + amortisation, only when all three are stated
  employees           integer,
  net_assets          numeric,
  cash                numeric,
  creditors_over_year numeric,
  -- people
  executives          jsonb not null default '[]'::jsonb, -- [{name, title, linkedin_url, has_email, source}]
  executives_at       timestamptz,
  ch_at               timestamptz,
  notes               text,
  updated_at          timestamptz not null default now()
);
create index if not exists portco_intel_ch_idx on public.portco_intel (ch_number) where ch_number is not null;
alter table public.portco_intel enable row level security;
drop policy if exists "portco_intel_read" on public.portco_intel;
create policy "portco_intel_read" on public.portco_intel for select using (true);

-- The key a portfolio company shares with the borrowers view, kept by the
-- database so a company the research job adds later carries it too.
alter table public.portfolio_companies add column if not exists intel_key text generated always as (public.borrower_key(name)) stored;
create index if not exists portfolio_companies_intel_idx on public.portfolio_companies (intel_key);

-- The borrowers a sponsor's portfolio company shows up as, and vice versa,
-- both keyed the same way.
create or replace view public.portco_debt with (security_invoker = true) as
select p.id as portfolio_company_id, p.gp_company_id, b.*
from public.portfolio_companies p
join public.borrowers b on b.key = p.intel_key;
