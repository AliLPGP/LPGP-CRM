-- filings: part 7 of 7
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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
