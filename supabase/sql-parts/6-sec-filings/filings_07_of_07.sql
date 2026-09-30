-- filings: part 7 of 7
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- A lender's loan book at its latest period, per position, totals excluded.
create or replace view public.credit_book with (security_invoker = true) as
select p.*, l.name as lender_name, l.ticker as lender_ticker, l.company_id as lender_company_id
from public.credit_positions p
join public.credit_lenders l on l.cik = p.lender_cik
where p.as_of = l.latest_period and not p.is_summary;

-- The seniority a tagged instrument states. Mirrors instrumentGroup() in
-- lib/directory/filings-types.ts; the two must agree.
create or replace function public.instrument_group(p text) returns text
language sql immutable as $$
  select case
    when p is null or btrim(p) = '' then 'Unspecified'
    when lower(p) ~ '(first[- ]lien|senior secured (loan|term|revolv|note)|unitranche|senior (secured )?term loan|senior loan|revolv)' then 'First lien / senior secured'
    when lower(p) ~ 'second[- ]lien' then 'Second lien'
    when lower(p) ~ '(subordinat|mezzanine|junior|pik note|unsecured (note|loan|debt)|holdco)' then 'Subordinated / mezzanine'
    when lower(p) ~ 'preferred' then 'Preferred equity'
    when lower(p) ~ '(equity|warrant|common|member|unit|share|interest|llc|l\.p\.)' then 'Equity & warrants'
    when lower(p) ~ '(note|bond|debenture)' then 'Notes & bonds'
    when lower(p) ~ '(clo|structured|certificate)' then 'Structured'
    else 'Other' end;
$$;

-- Everything the loan-book desk summarises, computed here in one pass. The
-- API roles carry a short statement timeout, and paging fifty thousand
-- positions through the API to add them up in the app ran past it.
create or replace function public.credit_book_summary() returns jsonb
language sql stable as $$
  with book as (
    select p.lender_cik, l.name as lender_name, l.ticker, p.borrower, p.instrument, p.spread, p.interest_rate, coalesce(p.fair_value, 0) as fv,
           lower(regexp_replace(regexp_replace(p.borrower, '[.,]', '', 'g'), '\s+(inc|llc|lp|ltd|corp|corporation|holdings?|co)$', '', 'g')) as bkey
    from public.credit_positions p join public.credit_lenders l on l.cik = p.lender_cik
    where p.as_of = l.latest_period and not p.is_summary
  )
  select jsonb_build_object(
    'lenders', (select count(distinct lender_cik) from book),
    'positions', (select count(*) from book),
    'fairValue', (select coalesce(sum(fv), 0) from book),
    'byInstrument', (select coalesce(jsonb_agg(jsonb_build_object('label', g, 'value', v, 'count', n) order by v desc), '[]'::jsonb)
                     from (select public.instrument_group(instrument) g, sum(fv) v, count(*) n from book group by 1) q),
    'spreadBins', (select coalesce(jsonb_agg(jsonb_build_object('label', case when b >= 12 then '1200+' else (b * 100)::text || '–' || (b * 100 + 99)::text end, 'count', n) order by b), '[]'::jsonb)
                   from (select least(12, floor(spread))::int b, count(*) n from book where spread > 0 and spread < 30 group by 1) q),
    'avgSpread', (select sum(spread * greatest(fv, 1)) / nullif(sum(greatest(fv, 1)), 0) from book where spread > 0 and spread < 30),
    'avgRate', (select sum(interest_rate * greatest(fv, 1)) / nullif(sum(greatest(fv, 1)), 0) from book where interest_rate > 0 and interest_rate < 40),
    'shared', (select coalesce(jsonb_agg(jsonb_build_object('borrower', name, 'lenders', n, 'fairValue', v) order by n desc, v desc), '[]'::jsonb)
               from (select min(borrower) name, count(distinct lender_cik) n, sum(fv) v from book group by bkey having count(distinct lender_cik) > 1 order by n desc, v desc limit 25) q),
    'byLender', (select coalesce(jsonb_agg(jsonb_build_object('cik', lender_cik, 'name', lender_name, 'ticker', ticker, 'positions', n, 'fairValue', v) order by v desc), '[]'::jsonb)
                 from (select lender_cik, min(lender_name) lender_name, min(ticker) ticker, count(*) n, sum(fv) v from book group by lender_cik) q)
  );
$$;

-- What the raises tab summarises for one class (or every class when null).
create or replace function public.offering_stats(p_class text default null) returns jsonb
language sql stable as $$
  with latest as (
    select * from public.fund_offerings_latest where is_pooled and (p_class is null or asset_class = p_class)
  )
  select jsonb_build_object(
    'filings', (select count(*) from latest),
    'raising', (select count(*) from latest where amount_sold > 0),
    'sold', (select coalesce(sum(amount_sold), 0) from latest where amount_sold > 0),
    'investors', (select coalesce(sum(investors_count), 0) from latest),
    'byMonth', (select coalesce(jsonb_agg(jsonb_build_object('label', to_char(m, 'Mon YY'), 'count', n, 'sold', s) order by m), '[]'::jsonb)
                from (select date_trunc('month', filing_date)::date m, count(*) n, coalesce(sum(case when amount_sold > 0 then amount_sold end), 0) s
                      from latest where filing_date is not null group by 1 order by 1 desc limit 12) q),
    'byType', (select coalesce(jsonb_agg(jsonb_build_object('label', t, 'count', n, 'sold', s) order by s desc), '[]'::jsonb)
               from (select coalesce(fund_type, 'Unstated') t, count(*) n, coalesce(sum(case when amount_sold > 0 then amount_sold end), 0) s from latest group by 1) q),
    'agents', (select coalesce(jsonb_agg(jsonb_build_object('name', a, 'funds', n) order by n desc), '[]'::jsonb)
               from (select btrim(coalesce(nullif(x->>'broker_dealer', ''), x->>'name')) a, count(distinct cik) n
                     from latest, jsonb_array_elements(placement_agents) x
                     where btrim(coalesce(nullif(x->>'broker_dealer', ''), x->>'name', '')) <> '' group by 1 order by n desc limit 12) q),
    'states', (select coalesce(jsonb_agg(jsonb_build_object('label', s, 'count', n) order by n desc), '[]'::jsonb)
               from (select state s, count(*) n from latest where state is not null group by 1 order by n desc limit 10) q)
  );
$$;

grant execute on function public.instrument_group(text), public.credit_book_summary(), public.offering_stats(text) to anon, authenticated;

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
