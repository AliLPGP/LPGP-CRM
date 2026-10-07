-- 0046 — every private fund an adviser reports on Form ADV.
--
-- Schedule D 7.B.(1) is the one public record most private funds have beyond
-- a Form D: gross asset value, fund type, number of beneficial owners,
-- minimum investment, share held by non-US persons, whether it is audited,
-- and its auditor, administrator, custodians, prime brokers and marketers.
-- The SEC publishes every filing as data; supabase/tools/adv_private_funds.py
-- keeps each fund's latest report (its 805- identifier is permanent) and this
-- table holds it. A fund on file is linked by its legal name, folded, and its
-- manager; the link fills the fund's blank manager and blank provider list.

create table if not exists public.adv_private_funds (
  adv_fund_id         text primary key,            -- the SEC private fund identifier, 805-…
  name                text not null,
  adviser_crd         text,
  adviser_company_id  uuid references public.companies (id) on delete set null,
  book                text,                         -- IA (registered) | ERA (exempt reporting)
  filing_id           bigint,
  submitted           date,
  fund_type           text,
  fund_type_other     text,
  gross_asset_value   numeric,
  minimum_investment  numeric,
  owners              integer,
  pct_non_us          numeric,
  country             text,
  state               text,
  master_fund         text,
  is_feeder           boolean,
  is_fund_of_funds    boolean,
  annual_audit        boolean,
  providers           jsonb not null default '[]'::jsonb,  -- [{role, name, key, brand, city, country}]
  form_d_file_numbers text[] not null default '{}',
  fund_id             uuid references public.funds (id) on delete set null,
  name_key            text,
  updated_at          timestamptz not null default now()
);
create index if not exists adv_private_funds_fund_idx on public.adv_private_funds (fund_id) where fund_id is not null;
create index if not exists adv_private_funds_key_idx on public.adv_private_funds (name_key);
create index if not exists adv_private_funds_crd_idx on public.adv_private_funds (adviser_crd);
alter table public.adv_private_funds enable row level security;
drop policy if exists adv_private_funds_read on public.adv_private_funds;
create policy adv_private_funds_read on public.adv_private_funds for select using (true);
grant select on public.adv_private_funds to anon, authenticated;

-- A fund's legal name folded for an exact match across filings: case,
-- punctuation and legal form go; the fund's number and vehicle tags stay, so
-- a parallel vehicle never matches its main fund.
create or replace function public.fund_name_key(p text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(replace(coalesce(p, ''), '&', ' and ')),
    '[.,''"’]', '', 'g'),
    '\m(the|lp|llp|llc|ltd|limited|inc|scsp|scs|sca|sicav|raif|slp|sarl|sa|plc|gmbh|bv|nv|ag|co)\M', ' ', 'g'),
    '[^a-z0-9]+', ' ', 'g'),
    '\s+', ' ', 'g')), '')
$$;

create or replace function ingest.load_adv_private_funds(p jsonb) returns integer
language plpgsql as $$
declare n int;
begin
  with src as (select * from jsonb_to_recordset(p) as x(
      adv_fund_id text, name text, adviser_crd text, book text, filing_id bigint, submitted date,
      fund_type text, fund_type_other text, gross_asset_value numeric, minimum_investment numeric, owners numeric,
      pct_non_us numeric, country text, state text, master_fund text, is_feeder boolean, is_fund_of_funds boolean,
      annual_audit boolean, providers jsonb, form_d_file_numbers text[])
  ), up as (
    insert into public.adv_private_funds as a (adv_fund_id, name, adviser_crd, book, filing_id, submitted, fund_type, fund_type_other,
      gross_asset_value, minimum_investment, owners, pct_non_us, country, state, master_fund, is_feeder, is_fund_of_funds,
      annual_audit, providers, form_d_file_numbers, name_key, updated_at)
    select adv_fund_id, name, adviser_crd, book, filing_id, submitted, fund_type, fund_type_other,
      gross_asset_value, minimum_investment, owners::int, pct_non_us, country, state, master_fund, is_feeder, is_fund_of_funds,
      annual_audit, coalesce(providers, '[]'::jsonb), coalesce(form_d_file_numbers, '{}'), public.fund_name_key(name), now()
    from src where adv_fund_id is not null and name is not null
    on conflict (adv_fund_id) do update set
      name = excluded.name, adviser_crd = excluded.adviser_crd, book = excluded.book, filing_id = excluded.filing_id,
      submitted = excluded.submitted, fund_type = excluded.fund_type, fund_type_other = excluded.fund_type_other,
      gross_asset_value = excluded.gross_asset_value, minimum_investment = excluded.minimum_investment, owners = excluded.owners,
      pct_non_us = excluded.pct_non_us, country = excluded.country, state = excluded.state, master_fund = excluded.master_fund,
      is_feeder = excluded.is_feeder, is_fund_of_funds = excluded.is_fund_of_funds, annual_audit = excluded.annual_audit,
      providers = excluded.providers, form_d_file_numbers = excluded.form_d_file_numbers, name_key = excluded.name_key, updated_at = now()
     where a.filing_id is null or excluded.filing_id >= a.filing_id
    returning 1
  )
  select count(*) into n from up;
  return n;
end $$;

-- Link ADV funds to the directory: the adviser by CRD; the fund by its folded
-- legal name, the adviser's own fund first, else the one fund on file with
-- that name. Then fill what the link gives: a manager where the fund has
-- none, providers where it lists none.
create or replace procedure ingest.link_adv_private_funds()
language plpgsql as $$
begin
  update public.adv_private_funds a set adviser_company_id = coalesce(v.company_id, c.id)
    from public.adv_private_funds a0
    left join public.adv_advisers v on v.crd = a0.adviser_crd
    left join lateral (select id from public.companies where sec_crd = a0.adviser_crd limit 1) c on true
   where a0.adv_fund_id = a.adv_fund_id and a.adviser_company_id is null and coalesce(v.company_id, c.id) is not null;
  commit;

  drop table if exists ingest.adv_fkeys;
  create table ingest.adv_fkeys as
  select id, company_id, public.fund_name_key(name) k from public.funds
  union
  select id, company_id, public.fund_name_key(name_filed) from public.funds where name_filed is not null;
  delete from ingest.adv_fkeys where k is null or length(k) < 6;
  create index on ingest.adv_fkeys (k);
  commit;

  update public.adv_private_funds a set fund_id = m.id
    from (
      select distinct on (a1.adv_fund_id) a1.adv_fund_id, f.id
        from public.adv_private_funds a1
        join ingest.adv_fkeys f on f.k = a1.name_key
       where a1.fund_id is null
         and (f.company_id = a1.adviser_company_id
              or (select count(distinct f2.id) from ingest.adv_fkeys f2 where f2.k = a1.name_key) = 1)
       order by a1.adv_fund_id, (f.company_id = a1.adviser_company_id) desc nulls last
    ) m
   where a.adv_fund_id = m.adv_fund_id;
  commit;

  update public.funds f set company_id = a.adviser_company_id
    from public.adv_private_funds a
   where a.fund_id = f.id and f.company_id is null and a.adviser_company_id is not null;
  update public.funds f set service_providers = (
           select coalesce(jsonb_agg(jsonb_build_object('role', p->>'role', 'key', p->>'key', 'brand', p->>'brand')), '[]'::jsonb)
             from jsonb_array_elements(a.providers) p where p->>'key' is not null)
    from public.adv_private_funds a
   where a.fund_id = f.id and jsonb_array_length(coalesce(f.service_providers, '[]'::jsonb)) = 0
     and jsonb_array_length(a.providers) > 0;
  update public.commitments c set gp_company_id = f.company_id
    from public.funds f where f.id = c.fund_id and c.gp_company_id is null and f.company_id is not null;
  commit;
  drop table if exists ingest.adv_fkeys;
  commit;
end $$;
