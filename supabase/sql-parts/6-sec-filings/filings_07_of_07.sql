-- filings: part 7 of 7
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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
