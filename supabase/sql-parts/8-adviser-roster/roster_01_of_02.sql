-- roster: part 1 of 2
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- 0020: the SEC's adviser roster -- every registered investment adviser and
-- exempt reporting adviser, from the monthly "Information About Registered
-- Investment Advisers and Exempt Reporting Advisers" report the SEC publishes
-- (sec.gov/data-research/sec-markets-data/information-about-registered-
-- investment-advisers-exempt-reporting-advisers). Item 7B of Form ADV says
-- whether a firm advises private funds, how many, of what kinds, and their
-- gross assets: that is the universe of fund managers. Idempotent.

create table if not exists public.adv_advisers (
  crd                 text primary key,
  sec_number          text,
  firm_type           text not null,          -- Registered | ERA
  name                text not null,          -- primary business name
  legal_name          text,
  city                text,
  state               text,
  country             text,
  website             text,
  employees           integer,
  regulatory_aum      numeric,                -- Item 5F(2)(c), registered advisers only
  private_funds       boolean not null default false, -- Item 7B
  private_fund_count  integer,
  hedge_funds         boolean not null default false,
  pe_funds            boolean not null default false,
  real_estate_funds   boolean not null default false,
  vc_funds            boolean not null default false,
  securitized_funds   boolean not null default false,
  liquidity_funds     boolean not null default false,
  other_funds         boolean not null default false,
  private_fund_gav    numeric,                -- total gross assets of private funds
  filed               date,                   -- latest ADV filing date
  as_of               date,                   -- the roster's date
  source_url          text,
  company_id          uuid references public.companies (id) on delete set null,
  updated_at          timestamptz not null default now()
);
create index if not exists adv_advisers_company_idx on public.adv_advisers (company_id) where company_id is not null;
create index if not exists adv_advisers_name_idx on public.adv_advisers (lower(name));
alter table public.adv_advisers enable row level security;
drop policy if exists "adv_advisers_read" on public.adv_advisers;
create policy "adv_advisers_read" on public.adv_advisers for select using (true);

-- A cheap fingerprint of some tables for cache keys: the planner's row
-- statistics change on every insert, update and delete, and reading them
-- costs nothing, where an exact count of a large table is a full scan.
create or replace function public.table_versions(p_tables text[]) returns text
language sql stable as $$
  select string_agg(t || ':' || coalesce((select n_tup_ins + n_tup_upd + n_tup_del from pg_stat_user_tables where schemaname = 'public' and relname = t)::text, 'x'), '.' order by t)
  from unnest(p_tables) t;
$$;
grant execute on function public.table_versions(text[]) to anon, authenticated;

-- Run SQL files the database fetches itself (the generated LP-disclosure
-- loaders under supabase/lp-disclosures, for one). Each file runs on its
-- own; a failure is logged and the next file still runs.
create or replace function ingest.run_remote_sql(p_urls text[]) returns jsonb
language plpgsql as $$
declare u text; body text; ok int := 0; failed jsonb := '[]'::jsonb;
begin
  foreach u in array p_urls loop
    begin
      body := ingest.http_text(u);
      execute body;
      ok := ok + 1;
    exception when others then
      failed := failed || jsonb_build_object('url', u, 'error', left(sqlerrm, 300));
    end;
  end loop;
  insert into ingest.log (what, detail) values ('run_remote_sql', jsonb_build_object('ok', ok, 'failed', failed));
  return jsonb_build_object('ok', ok, 'failed', failed);
end $$;

-- Load a roster published as JSON (a list of the rows above, camel-free
-- keys as in the table) from a URL the database can reach.
create or replace function ingest.load_adviser_roster(p_url text, p_as_of date, p_source_url text) returns integer
language plpgsql as $$
declare j jsonb; n int;
begin
  j := ingest.http_text(p_url)::jsonb;
  with rows as (
    select * from jsonb_to_recordset(j) as r(
      crd text, sec_number text, firm_type text, name text, legal_name text, city text, state text, country text, website text,
      employees integer, regulatory_aum numeric, private_funds boolean, private_fund_count integer,
      hedge_funds boolean, pe_funds boolean, real_estate_funds boolean, vc_funds boolean, securitized_funds boolean, liquidity_funds boolean, other_funds boolean,
      private_fund_gav numeric, filed date)
  ), up as (
    insert into public.adv_advisers as a (crd, sec_number, firm_type, name, legal_name, city, state, country, website, employees, regulatory_aum, private_funds, private_fund_count,
      hedge_funds, pe_funds, real_estate_funds, vc_funds, securitized_funds, liquidity_funds, other_funds, private_fund_gav, filed, as_of, source_url)
    select crd, sec_number, firm_type, name, legal_name, city, state, country, website, employees, regulatory_aum, coalesce(private_funds, false), private_fund_count,
      coalesce(hedge_funds, false), coalesce(pe_funds, false), coalesce(real_estate_funds, false), coalesce(vc_funds, false), coalesce(securitized_funds, false), coalesce(liquidity_funds, false), coalesce(other_funds, false),
      private_fund_gav, filed, p_as_of, p_source_url
    from rows where crd is not null and name is not null
    on conflict (crd) do update set sec_number = excluded.sec_number, firm_type = excluded.firm_type, name = excluded.name, legal_name = excluded.legal_name,
      city = excluded.city, state = excluded.state, country = excluded.country, website = excluded.website, employees = excluded.employees, regulatory_aum = excluded.regulatory_aum,
      private_funds = excluded.private_funds, private_fund_count = excluded.private_fund_count, hedge_funds = excluded.hedge_funds, pe_funds = excluded.pe_funds,
      real_estate_funds = excluded.real_estate_funds, vc_funds = excluded.vc_funds, securitized_funds = excluded.securitized_funds, liquidity_funds = excluded.liquidity_funds,
      other_funds = excluded.other_funds, private_fund_gav = excluded.private_fund_gav, filed = excluded.filed, as_of = excluded.as_of, source_url = excluded.source_url, updated_at = now()
    returning 1
  )
  select count(*) into n from up;
  -- Advisers the directory already holds, by CRD.
  update public.adv_advisers a set company_id = c.id from public.companies c where a.company_id is null and c.sec_crd is not null and c.sec_crd = a.crd;
  insert into ingest.log (what, detail) values ('load_adviser_roster', jsonb_build_object('rows', n, 'as_of', p_as_of));
  return n;
end $$;

-- The directory type a roster row's fund kinds place it in. One firm may
-- advise several kinds; the first that applies names the book it sits in.
create or replace function ingest.adviser_type(a public.adv_advisers) returns text
language sql immutable as $$
  select case
    when a.pe_funds then 'Private equity'
    when a.vc_funds then 'Venture capital'
    when a.real_estate_funds then 'Real estate'
    when a.hedge_funds then 'Hedge fund'
    when a.securitized_funds then 'Private credit'
    else null end;
$$;
