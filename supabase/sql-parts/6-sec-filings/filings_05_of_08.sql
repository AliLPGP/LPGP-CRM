-- filings: part 5 of 8
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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
    'soi:' || v_cik || ':' || c.instant || ':' || md5(s.clean),
    v_cik, p_key, p_meta->>'form', c.instant, s.clean,
    s.borrower, s.instrument,
    (select ingest.humanize_member(d) from jsonb_array_elements_text(c.dims) d where d ~* 'industr' limit 1),
    (select ingest.humanize_member(d) from jsonb_array_elements_text(c.dims) d where d ~* '(sofr|libor|euribor|sonia|prime|basis|rate)' and d !~* 'industr' limit 1),
    f.rate * 100, f.spread * 100, f.pik * 100, f.maturity, f.principal, f.cost, f.fv, f.pct * 100, f.shares, c.dims,
    null, base
  from (
    -- A filer may tag one position on several contexts (an affiliation axis,
    -- a range); keep the plainest so the upsert sees each key once.
    select distinct on (identifier, instant) * from _ctx order by identifier, instant, jsonb_array_length(dims), id
  ) c
  cross join lateral ingest.split_identifier(c.identifier) s
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
