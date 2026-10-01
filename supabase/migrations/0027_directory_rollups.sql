-- 0027: the directory index needs two counts per manager (funds, portfolio
-- companies). Reading every fund (30k+) and portfolio company (13k+) row a
-- page at a time to count them made a cold page take ten seconds; the
-- database counts them in one call.
create or replace function public.directory_rollups() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'funds', (select coalesce(jsonb_object_agg(company_id::text, n), '{}'::jsonb) from (select company_id, count(*) n from public.funds where company_id is not null group by 1) f),
    'portcos', (select coalesce(jsonb_object_agg(gp_company_id::text, n), '{}'::jsonb) from (select gp_company_id, count(*) n from public.portfolio_companies group by 1) p)
  );
$$;
grant execute on function public.directory_rollups() to anon, authenticated;
