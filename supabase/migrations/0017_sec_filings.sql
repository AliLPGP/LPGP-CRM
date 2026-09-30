-- 0017: SEC filings as intelligence -- Form D fund raises and BDC loan books.
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

create table if not exists ingest.queue (
  id           bigserial primary key,
  kind         text not null,                 -- form_d | bdc_filing
  key          text not null unique,          -- accession number
  url          text not null,
  meta         jsonb not null default '{}'::jsonb,
  status       text not null default 'pending', -- pending | working | done | skipped | error
  attempts     integer not null default 0,
  note         text,
  enqueued_at  timestamptz not null default now(),
  done_at      timestamptz
);
create index if not exists ingest_queue_pending_idx on ingest.queue (id) where status = 'pending';

create table if not exists ingest.log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  what        text not null,
  detail      jsonb
);

-- --- Helpers ----------------------------------------------------------------

create or replace function ingest.http_text(p_url text) returns text
language plpgsql as $$
declare r record;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '180000');
  select * into r from extensions.http((
    'GET', p_url,
    array[extensions.http_header('User-Agent', 'LPGP Connect research info@worldhealth.ai'),
          extensions.http_header('Accept', '*/*')],
    null, null)::extensions.http_request);
  if r.status <> 200 then
    raise exception 'HTTP % for %', r.status, p_url;
  end if;
  return r.content;
end $$;

-- A text node cast to text keeps its entities ("CD&amp;R"); undo them.
create or replace function ingest.unxml(p text) returns text
language sql immutable as $$
  select case when p is null then null else
    replace(replace(replace(replace(replace(
      regexp_replace(regexp_replace(p, '&#(\d+);', E'\\1', 'g'), '&#x([0-9a-fA-F]+);', E'\\1', 'g'),
      '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&apos;', ''''), '&amp;', '&')
  end;
$$;

-- A relative path is evaluated anywhere inside the fragment (Postgres evaluates
-- xpath against a document node, so 'cik' alone would only match a root).
create or replace function ingest.x1(p xml, p_path text) returns text
language sql immutable as $$
  select nullif(btrim(ingest.unxml((xpath(case when left(p_path, 1) = '/' then p_path else '//' || p_path end || '/text()', p))[1]::text)), '');
$$;

create or replace function ingest.num(p text) returns numeric
language sql immutable as $$
  select case when p ~ '^-?[0-9]+(\.[0-9]+)?$' then p::numeric end;
$$;

create or replace function ingest.bool(p text) returns boolean
language sql immutable as $$
  select case lower(p) when 'true' then true when 'false' then false end;
$$;

-- A directory firm for a filed name: exact, then the brand's first word when
-- that word names exactly one directory firm ("Ares Capital Europe VI" -> Ares).
create or replace function ingest.match_firm(p_name text, out company_id uuid, out method text)
language plpgsql stable as $$
declare w text; n int;
begin
  if p_name is null then return; end if;
  select id into company_id from public.companies where lower(name) = lower(btrim(p_name)) limit 1;
  if company_id is not null then method := 'exact'; return; end if;
  w := lower(split_part(regexp_replace(btrim(p_name), '^(the)\s+', '', 'i'), ' ', 1));
  w := regexp_replace(w, '[^a-z0-9&]', '', 'g');
  if length(w) < 3 or w = any (array['capital','global','private','partners','first','american','north','south','east','west','new','united','general','national','international','credit','equity','real','growth','venture','ventures','fund','funds','investment','investments','strategic','opportunity','opportunities','income','infrastructure','energy','digital','blue','green','black','white','silver','gold','summit','main','alpha','core','prime','crown','eagle','harbor','harbour','lake','river','park','bridge','stone','oak','pine','cedar','maple','atlas','apex','vista','one','two','three','1','2','3']) then
    return;
  end if;
  select count(*), (array_agg(id))[1] into n, company_id
    from public.companies
   where lower(split_part(regexp_replace(name, '^(the)\s+', '', 'i'), ' ', 1)) = w
     and category in ('GP', 'SP', 'LP');
  if n = 1 then method := 'brand'; else company_id := null; end if;
end $$;

-- Asset class from the fund's own name and its Form D fund type.
create or replace function ingest.classify_fund(p_name text, p_fund_type text, p_industry text) returns text
language plpgsql immutable as $$
declare n text := lower(coalesce(p_name, ''));
begin
  if coalesce(p_industry, '') <> 'Pooled Investment Fund' then return null; end if;
  if n ~ 'secondar' then return 'secondaries'; end if;
  if p_fund_type = 'Venture Capital Fund' or n ~ '\m(venture|ventures|seed|early[- ]stage|pre[- ]seed)\M' then return 'venture_capital'; end if;
  if n ~ '\m(infrastructure|infra|energy transition|renewable|renewables|power|utility|utilities|transport|transit|fiber|fibre|solar|wind|climate|decarboni|sustainab|clean energy|midstream|data ?cent)\M' then return 'infrastructure'; end if;
  if n ~ '\m(real estate|realty|property|properties|reit|housing|multifamily|multi-family|industrial|logistics|office|residential|apartment|self[- ]storage|hospitality|hotel|land)\M' then return 'real_estate'; end if;
  if n ~ '\m(credit|lending|loan|loans|debt|mezzanine|mezz|clo|clos|senior secured|income|yield|bdc|capital solutions|special situations|asset[- ]based|structured|receivables|nav finance|royalt)\M' then return 'private_credit'; end if;
  if p_fund_type = 'Hedge Fund' then return 'hedge_funds'; end if;
  if p_fund_type = 'Private Equity Fund' or n ~ '\m(buyout|growth equity|private equity|equity partners|acquisition|co-?invest)\M' then return 'private_equity'; end if;
  return 'other';
end $$;

-- --- Form D -----------------------------------------------------------------

-- Queue every Form D (and amendment) in one EDGAR quarter, plus the 10-Q/10-K
-- filings whose filer name reads like a lender, so the BDC parser can look.
create or replace function ingest.enqueue_quarter(p_year integer, p_qtr integer) returns jsonb
language plpgsql as $$
declare idx text; l text; m text[]; n_d int := 0; n_b int := 0;
begin
  idx := ingest.http_text(format('https://www.sec.gov/Archives/edgar/full-index/%s/QTR%s/form.idx', p_year, p_qtr));
  for l in select * from regexp_split_to_table(idx, E'\n') loop
    if l like 'D %' or l like 'D/A %' then
      m := regexp_match(l, '^(D|D/A)\s+(.*?)\s+(\d+)\s+(\d{4}-\d\d-\d\d)\s+edgar/data/\d+/(\d{10}-\d\d-\d{6})\.txt');
      if m is null then continue; end if;
      insert into ingest.queue (kind, key, url, meta)
      values ('form_d', m[5],
              format('https://www.sec.gov/Archives/edgar/data/%s/%s/primary_doc.xml', m[3], replace(m[5], '-', '')),
              jsonb_build_object('form', m[1], 'name', m[2], 'cik', m[3], 'filing_date', m[4]))
      on conflict (key) do nothing;
      if found then n_d := n_d + 1; end if;
    elsif (l like '10-Q %' or l like '10-K %')
          and l ~* '(\mbdc\M|business development|lending|private credit|credit fund|credit corp|capital corp|income fund|income corp|specialty finance|direct lend|senior loan|debt fund|private capital|investment corp|secured lending|finance corp|capital solutions|credit income|middle market|strategic credit|private debt|credit partners)' then
      m := regexp_match(l, '^(10-Q|10-K)\s+(.*?)\s+(\d+)\s+(\d{4}-\d\d-\d\d)\s+edgar/data/\d+/(\d{10}-\d\d-\d{6})\.txt');
      if m is null then continue; end if;
      insert into ingest.queue (kind, key, url, meta)
      values ('bdc_filing', m[5],
              format('https://www.sec.gov/Archives/edgar/data/%s/%s/index.json', m[3], replace(m[5], '-', '')),
              jsonb_build_object('form', m[1], 'name', m[2], 'cik', m[3], 'filing_date', m[4]))
      on conflict (key) do nothing;
      if found then n_b := n_b + 1; end if;
    end if;
  end loop;
  insert into ingest.log (what, detail) values ('enqueue_quarter', jsonb_build_object('year', p_year, 'qtr', p_qtr, 'form_d', n_d, 'bdc', n_b));
  return jsonb_build_object('form_d', n_d, 'bdc_filings', n_b);
end $$;

-- Queue a specific filer's latest 10-Q/10-K (for lenders whose names give
-- nothing away), from the submissions API.
create or replace function ingest.enqueue_filer(p_cik text, p_limit integer default 1) returns integer
language plpgsql as $$
declare j jsonb; forms jsonb; accs jsonb; dates jsonb; i int; n int := 0; cik10 text := lpad(p_cik, 10, '0');
begin
  j := ingest.http_text('https://data.sec.gov/submissions/CIK' || cik10 || '.json')::jsonb;
  forms := j->'filings'->'recent'->'form'; accs := j->'filings'->'recent'->'accessionNumber'; dates := j->'filings'->'recent'->'filingDate';
  for i in 0 .. jsonb_array_length(forms) - 1 loop
    exit when n >= p_limit;
    if forms->>i in ('10-Q', '10-K') then
      insert into ingest.queue (kind, key, url, meta)
      values ('bdc_filing', accs->>i,
              format('https://www.sec.gov/Archives/edgar/data/%s/%s/index.json', p_cik, replace(accs->>i, '-', '')),
              jsonb_build_object('form', forms->>i, 'name', j->>'name', 'cik', p_cik, 'filing_date', dates->>i, 'ticker', j->'tickers'->>0))
      on conflict (key) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function ingest.parse_form_d(p_key text, p_url text, p_meta jsonb, p_body text) returns text
language plpgsql as $$
declare
  x xml; p xml; rp xml; rec xml;
  v_related jsonb := '[]'::jsonb; v_agents jsonb := '[]'::jsonb;
  v_gp text; v_gp_weak boolean := false; v_name text; v_first text; v_last text; v_clar text; v_rels text[];
  v_industry text; v_fund_type text; v_offering text; v_class text;
  v_match record; v_cik text; v_issuer text; v_fund_id uuid; v_id uuid;
begin
  x := xmlparse(document p_body);
  p := (xpath('/edgarSubmission/primaryIssuer', x))[1];
  v_cik := ltrim(ingest.x1(p, 'cik'), '0');
  v_issuer := ingest.x1(p, 'entityName');
  if v_issuer is null then return 'skipped: no issuer'; end if;

  for rp in select unnest(xpath('/edgarSubmission/relatedPersonsList/relatedPersonInfo', x)) loop
    v_first := ingest.x1(rp, 'relatedPersonName/firstName');
    v_last  := ingest.x1(rp, 'relatedPersonName/lastName');
    v_clar  := ingest.x1(rp, 'relationshipClarification');
    select array_agg(btrim(r::text)) into v_rels from unnest(xpath('//relatedPersonRelationshipList/relationship/text()', rp)) r;
    v_name := btrim(concat_ws(' ', nullif(nullif(v_first, 'N/A'), ''), nullif(nullif(ingest.x1(rp, 'relatedPersonName/middleName'), 'N/A'), ''), v_last));
    v_related := v_related || jsonb_build_object('name', v_name, 'relationships', coalesce(to_jsonb(v_rels), '[]'::jsonb), 'clarification', v_clar);
    -- The GP is an entity (no first name), never one of the individuals the
    -- form lists beside it. An entity the filer calls the general partner,
    -- manager, adviser or sponsor wins over one that merely reads like a firm.
    if coalesce(v_first, 'N/A') in ('N/A', '') and v_last is not null then
      if coalesce(v_clar, '') ~* '(general partner|managing member|manager of the|investment (adviser|advisor|manager)|sponsor|\mgp\M)' then
        if v_gp is null or v_gp_weak then v_gp := v_name; v_gp_weak := false; end if;
      elsif v_gp is null and v_last ~* '(\mgp\M|general partner|partners|management|manager|advisors|advisers|capital|llc|l\.?l\.?c|l\.?p\.?|ltd|limited|inc|sas|sarl|gmbh|ag\M)' then
        v_gp := v_name; v_gp_weak := true;
      end if;
    end if;
  end loop;

  for rec in select unnest(xpath('/edgarSubmission/offeringData/salesCompensationList/recipient', x)) loop
    v_agents := v_agents || jsonb_build_object(
      'name', ingest.x1(rec, 'recipientName'), 'crd', ingest.x1(rec, 'recipientCRDNumber'),
      'broker_dealer', ingest.x1(rec, 'associatedBDName'), 'bd_crd', ingest.x1(rec, 'associatedBDCRDNumber'),
      'states', (select coalesce(jsonb_agg(btrim(s::text)), '[]'::jsonb) from unnest(xpath('//statesOfSolicitationList/state/text()', rec)) s));
  end loop;

  v_industry  := ingest.x1(x, '/edgarSubmission/offeringData/industryGroup/industryGroupType');
  v_fund_type := ingest.x1(x, '/edgarSubmission/offeringData/industryGroup/investmentFundInfo/investmentFundType');
  v_offering  := ingest.x1(x, '/edgarSubmission/offeringData/offeringSalesAmounts/totalOfferingAmount');
  v_class     := ingest.classify_fund(v_issuer, v_fund_type, v_industry);
  select * into v_match from ingest.match_firm(coalesce(v_gp, v_issuer));
  if v_match.company_id is null and v_gp is not null then select * into v_match from ingest.match_firm(v_issuer); end if;

  insert into public.fund_offerings as fo (
    accession_no, cik, issuer_name, entity_type, jurisdiction, state, year_of_inc, form, is_amendment, filing_date,
    first_sale_date, first_sale_pending, industry_group, fund_type, is_40_act, is_pooled,
    offering_amount, offering_indefinite, amount_sold, amount_remaining, investors_count, min_investment,
    has_non_accredited, more_than_one_year, exemptions, security_types, general_partner, related_persons, placement_agents,
    sales_commissions, finders_fees, asset_class, gp_company_id, gp_match, source_url)
  values (
    p_key, v_cik, v_issuer, ingest.x1(p, 'entityType'), ingest.x1(p, 'jurisdictionOfInc'), ingest.x1(p, 'issuerAddress/stateOrCountry'),
    ingest.num(ingest.x1(p, 'yearOfInc/value'))::integer, p_meta->>'form',
    ingest.bool(ingest.x1(x, '/edgarSubmission/offeringData/typeOfFiling/newOrAmendment/isAmendment')),
    (p_meta->>'filing_date')::date,
    (ingest.x1(x, '/edgarSubmission/offeringData/typeOfFiling/dateOfFirstSale/value'))::date,
    ingest.bool(ingest.x1(x, '/edgarSubmission/offeringData/typeOfFiling/dateOfFirstSale/yetToOccur')),
    v_industry, v_fund_type,
    ingest.bool(ingest.x1(x, '/edgarSubmission/offeringData/industryGroup/investmentFundInfo/is40Act')),
    coalesce(v_industry = 'Pooled Investment Fund', false),
    ingest.num(v_offering), coalesce(v_offering ilike 'indefinite', false),
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/offeringSalesAmounts/totalAmountSold')),
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/offeringSalesAmounts/totalRemaining')),
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/investors/totalNumberAlreadyInvested'))::integer,
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/minimumInvestmentAccepted')),
    ingest.bool(ingest.x1(x, '/edgarSubmission/offeringData/investors/hasNonAccreditedInvestors')),
    ingest.bool(ingest.x1(x, '/edgarSubmission/offeringData/durationOfOffering/moreThanOneYear')),
    coalesce((select array_agg(btrim(e::text)) from unnest(xpath('/edgarSubmission/offeringData/federalExemptionsExclusions/item/text()', x)) e), '{}'),
    coalesce((select array_agg(regexp_replace((regexp_match(n::text, '^<([A-Za-z]+)'))[1], '^is|Type$', '', 'g')) from unnest(xpath('/edgarSubmission/offeringData/typesOfSecuritiesOffered/*[text()="true"]', x)) n), '{}'),
    v_gp, v_related, v_agents,
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/salesCommissionsFindersFees/salesCommissions/dollarAmount')),
    ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/salesCommissionsFindersFees/findersFees/dollarAmount')),
    v_class, v_match.company_id, v_match.method,
    format('https://www.sec.gov/Archives/edgar/data/%s/%s/', v_cik, replace(p_key, '-', '')))
  on conflict (accession_no) do update set
    issuer_name = excluded.issuer_name, entity_type = excluded.entity_type, jurisdiction = excluded.jurisdiction, state = excluded.state,
    year_of_inc = excluded.year_of_inc, form = excluded.form, is_amendment = excluded.is_amendment, filing_date = excluded.filing_date,
    first_sale_date = excluded.first_sale_date, first_sale_pending = excluded.first_sale_pending, industry_group = excluded.industry_group,
    fund_type = excluded.fund_type, is_40_act = excluded.is_40_act, is_pooled = excluded.is_pooled, offering_amount = excluded.offering_amount,
    offering_indefinite = excluded.offering_indefinite, amount_sold = excluded.amount_sold, amount_remaining = excluded.amount_remaining,
    investors_count = excluded.investors_count, min_investment = excluded.min_investment, has_non_accredited = excluded.has_non_accredited,
    more_than_one_year = excluded.more_than_one_year, exemptions = excluded.exemptions, security_types = excluded.security_types,
    general_partner = excluded.general_partner, related_persons = excluded.related_persons, placement_agents = excluded.placement_agents,
    sales_commissions = excluded.sales_commissions, finders_fees = excluded.finders_fees, asset_class = excluded.asset_class,
    gp_company_id = excluded.gp_company_id, gp_match = excluded.gp_match, updated_at = now()
  returning id into v_id;

  -- A pooled fund is a fund record too, keyed by the issuer so amendments
  -- refresh the same row.
  if v_industry = 'Pooled Investment Fund' then
    insert into public.funds as f (external_key, company_id, name, manager_name, vintage_year, fund_size_usd, target_size_usd, strategy, status, source)
    values ('formd:' || v_cik, v_match.company_id, v_issuer, v_gp,
            coalesce(extract(year from (ingest.x1(x, '/edgarSubmission/offeringData/typeOfFiling/dateOfFirstSale/value'))::date)::integer, ingest.num(ingest.x1(p, 'yearOfInc/value'))::integer),
            nullif(ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/offeringSalesAmounts/totalAmountSold')), 0),
            ingest.num(v_offering), v_class,
            case when ingest.num(ingest.x1(x, '/edgarSubmission/offeringData/offeringSalesAmounts/totalRemaining')) = 0 then 'closed' else 'raising' end,
            'sec_form_d')
    on conflict (external_key) do update set
      company_id = coalesce(excluded.company_id, f.company_id), manager_name = coalesce(excluded.manager_name, f.manager_name),
      vintage_year = coalesce(f.vintage_year, excluded.vintage_year),
      fund_size_usd = greatest(coalesce(excluded.fund_size_usd, 0), coalesce(f.fund_size_usd, 0)),
      target_size_usd = coalesce(excluded.target_size_usd, f.target_size_usd), strategy = coalesce(excluded.strategy, f.strategy),
      status = excluded.status
    where f.source = 'sec_form_d'
    returning id into v_fund_id;
    if v_fund_id is null then select id into v_fund_id from public.funds where external_key = 'formd:' || v_cik; end if;
    update public.fund_offerings set fund_id = v_fund_id where id = v_id;
  end if;
  return 'done';
end $$;

-- --- BDC schedule of investments -------------------------------------------

create or replace function ingest.humanize_member(p text) returns text
language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(split_part(p, ':', 2), 'Member$', ''), '([a-z])([A-Z])', '\1 \2', 'g'), '([A-Z]+)([A-Z][a-z])', '\1 \2', 'g'));
$$;

create or replace function ingest.parse_bdc(p_key text, p_url text, p_meta jsonb) returns text
language plpgsql as $$
declare
  idx jsonb; inst text; doc text; base text; v_cik text := ltrim(p_meta->>'cik', '0'); v_name text := p_meta->>'name';
  n_ctx int; n_pos int := 0; v_period date; v_fv numeric;
begin
  idx := ingest.http_text(p_url)::jsonb;
  select e->>'name' into inst from jsonb_array_elements(idx->'directory'->'item') e where e->>'name' ~ '_htm\.xml$' limit 1;
  if inst is null then return 'skipped: no xbrl instance'; end if;
  base := regexp_replace(p_url, 'index\.json$', '');
  doc := ingest.http_text(base || inst);
  if position('InvestmentIdentifierAxis' in doc) = 0 then return 'skipped: no schedule of investments tagging'; end if;

  create temp table if not exists _ctx (id text, identifier text, instant date, dims jsonb) on commit drop;
  create temp table if not exists _fact (ctx text, name text, value text) on commit drop;
  truncate _ctx; truncate _fact;

  -- Contexts: one per tagged position and instant.
  insert into _ctx (id, identifier, instant, dims)
  select split_part(piece, '"', 1),
         (regexp_match(piece, 'InvestmentIdentifierAxis"[^>]*>\s*<[^>]+>([^<]+)<'))[1],
         (regexp_match(piece, '<instant>(\d{4}-\d\d-\d\d)</instant>'))[1]::date,
         coalesce((select jsonb_agg(m[1]) from regexp_matches(piece, '<xbrldi:explicitMember[^>]*>([^<]+)<', 'g') m), '[]'::jsonb)
  from regexp_split_to_table(doc, '<context id="') piece
  where piece like '%InvestmentIdentifierAxis%' and position('</context>' in piece) > 0
    and position('InvestmentIdentifierAxis' in piece) < position('</context>' in piece);
  delete from _ctx where identifier is null or instant is null;
  get diagnostics n_ctx = row_count;

  insert into _fact (ctx, name, value)
  select (regexp_match(m[2], 'contextRef="([^"]+)"'))[1], m[1], btrim(m[3])
  from regexp_matches(doc, '<us-gaap:(InvestmentOwnedAtFairValue|InvestmentOwnedAtCost|InvestmentOwnedBalancePrincipalAmount|InvestmentInterestRate|InvestmentBasisSpreadVariableRate|InvestmentInterestRatePaidInKind|InvestmentMaturityDate|InvestmentOwnedPercentOfNetAssets|InvestmentOwnedBalanceShares)\s+([^>]*)>([^<]*)<', 'g') m;

  select max(instant) into v_period from _ctx;
  if v_period is null then return 'skipped: no dated positions'; end if;

  insert into public.credit_lenders (cik, name, ticker, company_id, source_url)
  values (v_cik, v_name, p_meta->>'ticker', (select company_id from ingest.match_firm(v_name)), base)
  on conflict (cik) do update set name = excluded.name, ticker = coalesce(excluded.ticker, credit_lenders.ticker),
    company_id = coalesce(credit_lenders.company_id, excluded.company_id), updated_at = now();

  insert into public.credit_positions as cp (
    external_key, lender_cik, accession_no, filing_form, as_of, identifier, borrower, instrument, industry, reference_rate,
    interest_rate, spread, pik_rate, maturity, principal, cost, fair_value, pct_net_assets, shares, dims, borrower_company_id, source_url)
  select
    'soi:' || v_cik || ':' || c.instant || ':' || md5(c.identifier),
    v_cik, p_key, p_meta->>'form', c.instant, c.identifier,
    btrim(case when c.identifier like '% | %' then split_part(c.identifier, ' | ', 1) else c.identifier end),
    nullif(btrim(case when c.identifier like '% | %' then substr(c.identifier, position(' | ' in c.identifier) + 3) end), ''),
    (select ingest.humanize_member(d) from jsonb_array_elements_text(c.dims) d where d ~* 'industr' limit 1),
    (select ingest.humanize_member(d) from jsonb_array_elements_text(c.dims) d where d ~* '(sofr|libor|euribor|sonia|prime|basis|rate)' and d !~* 'industr' limit 1),
    f.rate * 100, f.spread * 100, f.pik * 100, f.maturity, f.principal, f.cost, f.fv, f.pct * 100, f.shares, c.dims,
    null, base
  from (
    -- A filer may tag one position on several contexts (an affiliation axis,
    -- a range); keep the plainest so the upsert sees each key once.
    select distinct on (identifier, instant) * from _ctx order by identifier, instant, jsonb_array_length(dims), id
  ) c
  join lateral (
    select
      max(case when name = 'InvestmentOwnedAtFairValue' then ingest.num(value) end) as fv,
      max(case when name = 'InvestmentOwnedAtCost' then ingest.num(value) end) as cost,
      max(case when name = 'InvestmentOwnedBalancePrincipalAmount' then ingest.num(value) end) as principal,
      max(case when name = 'InvestmentInterestRate' then ingest.num(value) end) as rate,
      max(case when name = 'InvestmentBasisSpreadVariableRate' then ingest.num(value) end) as spread,
      max(case when name = 'InvestmentInterestRatePaidInKind' then ingest.num(value) end) as pik,
      max(case when name = 'InvestmentMaturityDate' and value ~ '^\d{4}-\d\d-\d\d' then left(value, 10)::date end) as maturity,
      max(case when name = 'InvestmentOwnedPercentOfNetAssets' then ingest.num(value) end) as pct,
      max(case when name = 'InvestmentOwnedBalanceShares' then ingest.num(value) end) as shares
    from _fact where ctx = c.id
  ) f on true
  where f.fv is not null or f.principal is not null or f.cost is not null
  on conflict (external_key) do update set
    accession_no = excluded.accession_no, filing_form = excluded.filing_form, instrument = excluded.instrument,
    industry = coalesce(excluded.industry, cp.industry), reference_rate = coalesce(excluded.reference_rate, cp.reference_rate),
    interest_rate = coalesce(excluded.interest_rate, cp.interest_rate), spread = coalesce(excluded.spread, cp.spread),
    pik_rate = coalesce(excluded.pik_rate, cp.pik_rate), maturity = coalesce(excluded.maturity, cp.maturity),
    principal = coalesce(excluded.principal, cp.principal), cost = coalesce(excluded.cost, cp.cost), fair_value = coalesce(excluded.fair_value, cp.fair_value),
    pct_net_assets = coalesce(excluded.pct_net_assets, cp.pct_net_assets), shares = coalesce(excluded.shares, cp.shares), dims = excluded.dims, source_url = excluded.source_url;
  get diagnostics n_pos = row_count;

  -- Some filers also tag a total per borrower (no instrument in the
  -- identifier) beside the instruments it sums; mark those so nothing counts
  -- a loan twice.
  update public.credit_positions p
     set is_summary = (p.instrument is null and exists (
           select 1 from public.credit_positions q
            where q.lender_cik = p.lender_cik and q.as_of = p.as_of and q.instrument is not null
              and lower(q.borrower) = lower(p.borrower) and q.id <> p.id))
   where p.lender_cik = v_cik and p.accession_no = p_key;

  select count(*), sum(fair_value) into n_pos, v_fv from public.credit_positions
   where lender_cik = v_cik and not is_summary and as_of = (select max(as_of) from public.credit_positions where lender_cik = v_cik);
  update public.credit_lenders l
     set latest_accession = case when v_period >= coalesce(l.latest_period, '1900-01-01') then p_key else l.latest_accession end,
         latest_form = case when v_period >= coalesce(l.latest_period, '1900-01-01') then p_meta->>'form' else l.latest_form end,
         latest_period = greatest(coalesce(l.latest_period, v_period), v_period),
         positions_count = n_pos, fair_value_total = v_fv, updated_at = now()
   where cik = v_cik;
  return format('done: %s contexts, %s positions as of %s', n_ctx, n_pos, v_period);
end $$;

-- --- Draining the queue -----------------------------------------------------

-- A procedure, not a function, so each filing commits on its own: the
-- session's statement timeout (two minutes on a hosted project) can end a
-- run without undoing the filings before it. Time-boxed under that limit.
drop function if exists ingest.process_queue(integer);
create or replace procedure ingest.run_queue(p_limit integer default 80, p_seconds integer default 50)
language plpgsql as $$
declare q record; res text; n_done int := 0; n_err int := 0; n_skip int := 0; t0 timestamptz := clock_timestamp();
begin
  for q in select id, kind, key, url, meta, attempts from ingest.queue where status = 'pending' order by id limit p_limit loop
    exit when clock_timestamp() - t0 > make_interval(secs => p_seconds);
    update ingest.queue set status = 'working', attempts = attempts + 1 where id = q.id and status = 'pending';
    if not found then continue; end if;
    commit;
    begin
      if q.kind = 'form_d' then
        res := ingest.parse_form_d(q.key, q.url, q.meta, ingest.http_text(q.url));
      elsif q.kind = 'bdc_filing' then
        res := ingest.parse_bdc(q.key, q.url, q.meta);
      else
        res := 'skipped: unknown kind';
      end if;
      update ingest.queue set status = case when res like 'skipped%' then 'skipped' else 'done' end, note = res, done_at = now() where id = q.id;
      if res like 'skipped%' then n_skip := n_skip + 1; else n_done := n_done + 1; end if;
    exception when others then
      update ingest.queue set status = case when q.attempts + 1 >= 3 then 'error' else 'pending' end, note = left(sqlerrm, 500) where id = q.id;
      n_err := n_err + 1;
    end;
    commit;
  end loop;
  if n_done + n_err + n_skip > 0 then
    insert into ingest.log (what, detail) values ('run_queue', jsonb_build_object('done', n_done, 'skipped', n_skip, 'errors', n_err, 'seconds', round(extract(epoch from clock_timestamp() - t0))));
    commit;
  end if;
end $$;

-- Deals derived from the latest Form D per pooled fund: what the fund has
-- raised, per the filing. Re-runnable; rows are keyed by issuer.
create or replace function ingest.derive_deals() returns integer
language plpgsql as $$
declare n int;
begin
  with latest as (
    select distinct on (cik) * from public.fund_offerings
     where is_pooled and coalesce(amount_sold, 0) > 0
     order by cik, filing_date desc, accession_no desc
  ), up as (
    insert into public.deals as d (
      external_key, date, date_text, kind, asset_class, target, target_kind, target_country, target_fund_id,
      investor, investor_type, investor_company_id, amount, currency, headline, summary, source_name, source_url, source)
    select
      'formd:' || l.cik,
      coalesce(l.first_sale_date, l.filing_date), to_char(coalesce(l.first_sale_date, l.filing_date), 'Mon YYYY'),
      case when l.amount_remaining = 0 and not l.offering_indefinite then 'fund_close' else 'fundraise' end,
      coalesce(l.asset_class, 'other'),
      l.issuer_name, 'fund', case when l.state ~ '^[A-Z]{2}$' and l.jurisdiction is not null then 'United States' end, l.fund_id,
      coalesce(l.general_partner, l.issuer_name), 'general_partner', l.gp_company_id,
      l.amount_sold, 'USD',
      format('%s has raised $%s%s', l.issuer_name,
             case when l.amount_sold >= 1e9 then round(l.amount_sold / 1e9, 2)::text || 'bn' when l.amount_sold >= 1e6 then round(l.amount_sold / 1e6, 1)::text || 'm' else to_char(l.amount_sold, 'FM999,999,999') end,
             case when l.amount_remaining = 0 and not l.offering_indefinite then ' (final close)' else '' end),
      format('Form %s filed %s: $%s sold%s to %s investor%s%s%s.',
             l.form, to_char(l.filing_date, 'DD Mon YYYY'), to_char(l.amount_sold, 'FM999,999,999,999'),
             case when l.offering_indefinite then ' of an indefinite offering' when l.offering_amount is not null then ' of a $' || to_char(l.offering_amount, 'FM999,999,999,999') || ' offering' else '' end,
             coalesce(l.investors_count, 0), case when coalesce(l.investors_count, 0) = 1 then '' else 's' end,
             case when l.first_sale_date is not null then '; first sale ' || to_char(l.first_sale_date, 'DD Mon YYYY') else '' end,
             case when l.general_partner is not null then '; general partner ' || l.general_partner else '' end),
      'SEC EDGAR Form D', l.source_url, 'sec_edgar'
    from latest l
    on conflict (external_key) do update set
      date = excluded.date, date_text = excluded.date_text, kind = excluded.kind, asset_class = excluded.asset_class,
      target = excluded.target, target_fund_id = excluded.target_fund_id, investor = excluded.investor,
      investor_company_id = coalesce(excluded.investor_company_id, d.investor_company_id), amount = excluded.amount,
      headline = excluded.headline, summary = excluded.summary, source_url = excluded.source_url
    where d.source = 'sec_edgar'
    returning 1
  )
  select count(*) into n from up;
  return n;
end $$;

-- Placement agents named on Form D are service providers to the fund's GP.
create or replace function ingest.derive_placement_agents() returns integer
language plpgsql as $$
declare n int;
begin
  with agents as (
    select fo.gp_company_id, a->>'name' as agent, coalesce(nullif(a->>'broker_dealer', ''), a->>'name') as bd, fo.issuer_name, fo.source_url, fo.filing_date
    from public.fund_offerings fo, jsonb_array_elements(fo.placement_agents) a
    where fo.is_pooled and fo.gp_company_id is not null and coalesce(a->>'name', '') <> ''
  ), grouped as (
    select gp_company_id, bd, min(agent) as agent, count(distinct issuer_name) as fund_count,
           (array_agg(distinct issuer_name))[1:5] as examples, max(source_url) as source_url, max(filing_date) as filed
    from agents group by gp_company_id, bd
  ), up as (
    insert into public.service_relationships as sr (client_company_id, provider_company_id, role, external_key, provider_key, provider_brand, fund_count, fund_examples, source, source_url, filed)
    select g.gp_company_id, (select company_id from ingest.match_firm(g.bd)), 'placement_agent',
           'formd:' || g.gp_company_id || ':placement_agent:' || md5(lower(g.bd)),
           regexp_replace(lower(g.bd), '[^a-z0-9]+', '-', 'g'), g.bd, g.fund_count, g.examples, 'sec_form_d', g.source_url, g.filed::text
    from grouped g
    on conflict (external_key) do update set fund_count = excluded.fund_count, fund_examples = excluded.fund_examples,
      provider_company_id = coalesce(excluded.provider_company_id, sr.provider_company_id), source_url = excluded.source_url, filed = excluded.filed
    returning 1
  )
  select count(*) into n from up;
  return n;
end $$;

-- The latest filing per fund: an amendment supersedes the original.
create or replace view public.fund_offerings_latest with (security_invoker = true) as
select distinct on (cik) *
from public.fund_offerings
order by cik, filing_date desc nulls last, accession_no desc;

-- A lender's loan book at its latest period, per position, totals excluded.
create or replace view public.credit_book with (security_invoker = true) as
select p.*, l.name as lender_name, l.ticker as lender_ticker, l.company_id as lender_company_id
from public.credit_positions p
join public.credit_lenders l on l.cik = p.lender_cik
where p.as_of = l.latest_period and not p.is_summary;

-- What the queue looks like, for the setup panel and for a terminal.
create or replace view ingest.status as
select kind, status, count(*) as n, min(enqueued_at) as first_enqueued, max(done_at) as last_done
from ingest.queue group by kind, status order by kind, status;

-- --- Schedule ---------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; skipping the ingest schedule';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'lpgp-ingest-queue' and command not like 'call ingest.run_queue%') then
    perform cron.unschedule('lpgp-ingest-queue');
  end if;
  if not exists (select 1 from cron.job where jobname = 'lpgp-ingest-queue') then
    perform cron.schedule('lpgp-ingest-queue', '* * * * *', $job$call ingest.run_queue(80, 50)$job$);
  end if;
  if not exists (select 1 from cron.job where jobname = 'lpgp-ingest-derive') then
    perform cron.schedule('lpgp-ingest-derive', '17 * * * *', $job$select ingest.derive_deals(), ingest.derive_placement_agents()$job$);
  end if;
end $$;
