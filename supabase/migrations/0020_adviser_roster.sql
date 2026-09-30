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

-- Managers the directory lacks become GP records: every adviser that reports
-- advising private funds with gross assets of at least p_min_gav. Rows the
-- directory already holds (by CRD, then by exact name) get their Form ADV
-- facts filled where blank, and are never renamed or retyped.
create or replace function ingest.promote_advisers(p_min_gav numeric default 100000000) returns jsonb
language plpgsql as $$
declare n_new int := 0; n_linked int := 0; n_filled int := 0; a record; v_id uuid;
begin
  for a in
    select * from public.adv_advisers
     where private_funds and coalesce(private_fund_gav, 0) >= p_min_gav and company_id is null
     order by private_fund_gav desc
  loop
    select id into v_id from public.companies where lower(name) = lower(a.name) or lower(name) = lower(coalesce(a.legal_name, '')) order by (sec_crd is null) limit 1;
    if v_id is not null then
      update public.adv_advisers set company_id = v_id where crd = a.crd;
      n_linked := n_linked + 1;
      continue;
    end if;
    insert into public.companies (name, category, sub_type, website, domain, city, state, country, source, sec_crd, external_ids, adv_firm_type, adv_last_filed,
      adv_employee_count, private_fund_count, private_fund_gross_assets, regulatory_aum_usd, adv_source_url, description)
    values (
      ingest.nice_name(a.name), 'GP', ingest.adviser_type(a),
      nullif(lower(a.website), ''),
      nullif(regexp_replace(lower(coalesce(a.website, '')), '^https?://(www\.)?([^/]+).*$', '\2'), ''),
      ingest.nice_name(a.city), a.state, case when a.country = 'United States' then 'United States' else a.country end,
      'form_adv_roster', a.crd, array['crd:' || a.crd], case when a.firm_type = 'ERA' then 'ERA' else 'Registered' end, a.filed,
      a.employees, a.private_fund_count, a.private_fund_gav, a.regulatory_aum,
      'https://adviserinfo.sec.gov/firm/summary/' || a.crd,
      format('%s adviser to %s private fund%s with $%s gross assets, per Form ADV (%s).',
             case when a.firm_type = 'ERA' then 'Exempt reporting' else 'SEC-registered' end,
             coalesce(a.private_fund_count, 0), case when coalesce(a.private_fund_count, 0) = 1 then '' else 's' end,
             case when a.private_fund_gav >= 1e9 then round(a.private_fund_gav / 1e9, 1)::text || 'bn' else round(a.private_fund_gav / 1e6)::text || 'm' end,
             to_char(a.filed, 'Mon YYYY')))
    returning id into v_id;
    update public.adv_advisers set company_id = v_id where crd = a.crd;
    n_new := n_new + 1;
  end loop;

  -- Fill Form ADV blanks on firms the directory already had.
  with f as (
    update public.companies c
       set sec_crd = coalesce(c.sec_crd, a.crd),
           adv_firm_type = coalesce(c.adv_firm_type, case when a.firm_type = 'ERA' then 'ERA' else 'Registered' end),
           adv_last_filed = coalesce(c.adv_last_filed, a.filed),
           adv_employee_count = coalesce(c.adv_employee_count, a.employees),
           private_fund_count = coalesce(c.private_fund_count, a.private_fund_count),
           private_fund_gross_assets = coalesce(c.private_fund_gross_assets, a.private_fund_gav),
           regulatory_aum_usd = coalesce(c.regulatory_aum_usd, a.regulatory_aum),
           adv_source_url = coalesce(c.adv_source_url, 'https://adviserinfo.sec.gov/firm/summary/' || a.crd),
           website = coalesce(c.website, nullif(lower(a.website), ''))
      from public.adv_advisers a
     where a.company_id = c.id
       and (c.sec_crd is null or c.adv_last_filed is null or c.private_fund_count is null or c.private_fund_gross_assets is null or c.regulatory_aum_usd is null or c.website is null)
    returning 1
  ) select count(*) into n_filled from f;
  insert into ingest.log (what, detail) values ('promote_advisers', jsonb_build_object('new', n_new, 'linked', n_linked, 'filled', n_filled, 'min_gav', p_min_gav));
  return jsonb_build_object('new', n_new, 'linked', n_linked, 'filled', n_filled);
end $$;
