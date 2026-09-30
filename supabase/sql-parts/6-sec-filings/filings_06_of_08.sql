-- filings: part 6 of 8
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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
      if sqlerrm like 'HTTP 429%' then
        -- EDGAR asks for at most ten requests a second and answers 429 past
        -- that. The filing is not at fault: hand it back, wait, and end the
        -- run so the next one starts on a clean slate.
        update ingest.queue set status = 'pending', attempts = greatest(attempts - 1, 0), note = 'rate limited; retried later' where id = q.id;
        insert into ingest.log (what, detail) values ('rate_limited', jsonb_build_object('key', q.key));
        commit;
        perform pg_sleep(20);
        exit;
      end if;
      update ingest.queue set status = case when q.attempts + 1 >= 3 then 'error' else 'pending' end, note = left(sqlerrm, 500) where id = q.id;
      n_err := n_err + 1;
    end;
    commit;
    -- Stay well inside EDGAR's rate: one worker, a short pause per filing.
    perform pg_sleep(0.15);
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
