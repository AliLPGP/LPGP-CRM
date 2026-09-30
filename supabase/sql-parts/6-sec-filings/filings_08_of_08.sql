-- filings: part 8 of 8
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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
