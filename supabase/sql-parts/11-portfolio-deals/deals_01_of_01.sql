-- deals: part 1 of 1
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- 0023: what a sponsor paid for a portfolio company, as the press states it.
-- The equity cheque itself is almost never disclosed; what a page states is
-- the transaction value (usually enterprise value), sometimes the stake, and
-- sometimes the equity invested. Each figure is recorded with its basis and
-- the page that states it, in the currency the page used; a figure no page
-- states is null. Idempotent.

alter table public.portfolio_companies add column if not exists deal_value numeric;          -- the transaction value as stated
alter table public.portfolio_companies add column if not exists deal_currency text;          -- ISO code, as stated
alter table public.portfolio_companies add column if not exists deal_value_basis text;       -- 'enterprise_value' | 'equity_value' | 'stake_price' | 'unspecified'
alter table public.portfolio_companies add column if not exists equity_invested numeric;     -- the sponsor's own equity, only when a page states it
alter table public.portfolio_companies add column if not exists stake_pct numeric;           -- the sponsor's stake, only when a page states it
alter table public.portfolio_companies add column if not exists co_investors text[] not null default '{}';
alter table public.portfolio_companies add column if not exists deal_source_url text;        -- the page that states the money
alter table public.portfolio_companies add column if not exists researched_at timestamptz;   -- when the research job last wrote the row

create index if not exists portfolio_companies_deal_value_idx on public.portfolio_companies (deal_value desc nulls last);

-- A note per GP from the research job ("site lists current holdings only",
-- "no public portfolio page"), so the desk says why a list is short.
alter table public.companies add column if not exists portfolio_note text;
alter table public.companies add column if not exists portfolio_researched_at timestamptz;
