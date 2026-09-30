-- filings: part 1 of 8
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- 0018: SEC filings as intelligence -- Form D fund raises and BDC loan books.
--
-- Two public-record sources, read straight from EDGAR by the database itself
-- (the http extension), so nothing depends on an API key or a deployed app:
--
--   * Form D  -- every exempt offering. For pooled funds that is the fund's own
--               statement of what it has raised so far (amount sold, investors,
--               first sale, GP, placement agents). ~10k new filings a quarter.
--   * BDC schedules of investments -- each business development company tags
--               every loan it holds in its 10-Q/10-K XBRL (borrower, instrument,
--               rate, spread, principal, cost, fair value). That is the private
--               credit deal book, position by position.
--
-- The `ingest` schema is the fetch queue and the parsers; pg_cron drains the
-- queue a batch a minute. Everything lands in public tables the app reads:
-- fund_offerings, credit_positions, credit_lenders, and rows derived into
-- funds and deals. Idempotent; safe to re-run.

-- Both extensions ship with hosted Supabase. A local Postgres without them
-- still gets the tables and views (the app reads those); only the fetching
-- needs them, and the queue simply never runs there.
do $$
begin
  create extension if not exists http with schema extensions;
exception when others then
  raise notice 'http extension not available here (%); the ingest queue will not run', sqlerrm;
end $$;
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron not available here (%); the ingest queue will not run', sqlerrm;
end $$;

-- --- Public tables ----------------------------------------------------------

create table if not exists public.fund_offerings (
  id                    uuid primary key default gen_random_uuid(),
  accession_no          text not null unique,
  cik                   text not null,
  issuer_name           text not null,
  entity_type           text,
  jurisdiction          text,
  state                 text,                 -- issuer address state / country code
  year_of_inc           integer,
  form                  text not null,        -- D | D/A
  is_amendment          boolean,
  filing_date           date,
  first_sale_date       date,
  first_sale_pending    boolean,
  industry_group        text,                 -- 'Pooled Investment Fund', 'Real Estate', ...
  fund_type             text,                 -- Private Equity Fund | Hedge Fund | Venture Capital Fund | Other Investment Fund
  is_40_act             boolean,
  is_pooled             boolean not null default false,
  offering_amount       numeric,
  offering_indefinite   boolean not null default false,
  amount_sold           numeric,
  amount_remaining      numeric,
  investors_count       integer,
  min_investment        numeric,
  has_non_accredited    boolean,
  more_than_one_year    boolean,
  exemptions            text[] not null default '{}',
  security_types        text[] not null default '{}',
  general_partner       text,                 -- the related person clarified as GP / manager
  related_persons       jsonb not null default '[]'::jsonb, -- [{name, relationships[], clarification}]
  placement_agents      jsonb not null default '[]'::jsonb, -- [{name, crd, broker_dealer, bd_crd, states[]}]
  sales_commissions     numeric,
  finders_fees          numeric,
  asset_class           text,                 -- derived: private_equity | private_credit | venture_capital | real_estate | infrastructure | secondaries | hedge_funds | other
  gp_company_id         uuid references public.companies (id) on delete set null,
  gp_match              text,                 -- exact | brand
  fund_id               uuid references public.funds (id) on delete set null,
  source_url            text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists fund_offerings_cik_idx on public.fund_offerings (cik, filing_date desc);
create index if not exists fund_offerings_class_idx on public.fund_offerings (asset_class) where is_pooled;
create index if not exists fund_offerings_gp_idx on public.fund_offerings (gp_company_id) where gp_company_id is not null;

create table if not exists public.credit_lenders (
  cik                 text primary key,
  name                text not null,
  ticker              text,
  company_id          uuid references public.companies (id) on delete set null,
  latest_accession    text,
  latest_form         text,
  latest_period       date,
  positions_count     integer,
  fair_value_total    numeric,
  source_url          text,
  updated_at          timestamptz not null default now()
);

create table if not exists public.credit_positions (
  id                  uuid primary key default gen_random_uuid(),
  external_key        text not null unique,   -- soi:<cik>:<as_of>:<md5 of identifier>
  lender_cik          text not null references public.credit_lenders (cik) on delete cascade,
  accession_no        text not null,
  filing_form         text,
  as_of               date not null,
  identifier          text not null,          -- as tagged: "Borrower | instrument"
  borrower            text not null,
  instrument          text,
  industry            text,
  reference_rate      text,                   -- SOFR, EURIBOR, Prime ... when tagged
  interest_rate       numeric,                -- percent
  spread              numeric,                -- percent over the reference rate
  pik_rate            numeric,                -- percent paid in kind
  maturity            date,
  principal           numeric,
  cost                numeric,
  fair_value          numeric,
  pct_net_assets      numeric,
  shares              numeric,
  currency            text not null default 'USD',
  dims                jsonb not null default '[]'::jsonb, -- every explicit dimension member on the context
  is_summary          boolean not null default false,  -- a filer's per-borrower total, beside the positions it sums
  borrower_company_id uuid references public.companies (id) on delete set null,
  source_url          text not null,
  created_at          timestamptz not null default now()
);
alter table public.credit_positions add column if not exists is_summary boolean not null default false;
create index if not exists credit_positions_lender_idx on public.credit_positions (lender_cik, as_of desc);
create index if not exists credit_positions_borrower_idx on public.credit_positions (lower(borrower));
create index if not exists credit_positions_asof_idx on public.credit_positions (as_of desc);

alter table public.fund_offerings  enable row level security;
alter table public.credit_lenders  enable row level security;
alter table public.credit_positions enable row level security;
drop policy if exists "fund_offerings_read" on public.fund_offerings;
create policy "fund_offerings_read" on public.fund_offerings for select using (true);
drop policy if exists "credit_lenders_read" on public.credit_lenders;
create policy "credit_lenders_read" on public.credit_lenders for select using (true);
drop policy if exists "credit_positions_read" on public.credit_positions;
create policy "credit_positions_read" on public.credit_positions for select using (true);

-- --- The queue --------------------------------------------------------------

create schema if not exists ingest;
