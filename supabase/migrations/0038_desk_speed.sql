-- 0038: the desks answer from stored figures.
--
-- Five reads sat at or past the API role's three-second statement limit:
-- offering_stats() over every Form D (7.6 s for all classes),
-- credit_book_summary() over the parsed loan books (4.3 s), deals_search()'s
-- first page (2.3 s), borrower_summary() (1.1 s) and the fund_performance
-- view (1.0 s, read a page at a time, so several seconds per visit). A read
-- that times out is never cached by the app, so those pages paid it on every
-- visit and showed the empty state besides.
--
-- The figures change when the EDGAR ingest or an LP loader writes, a few
-- times a day at most. So the database computes them once, on a schedule,
-- into public.desk_cache, and the public functions answer from there:
--
--   * offering_stats(p_class), credit_book_summary() and borrower_summary()
--     keep their names and shapes; the original bodies are renamed *_live
--     and are still what a missing cache row falls back to.
--   * deals_search() answers the unfiltered first page (per class) from the
--     cache and runs everything else live, now over stored `yr` and `hay`
--     columns with a trigram index, carrying only the columns it sorts and
--     facets by until the page of rows is chosen.
--   * fund_performance_mv is the fund_performance view, stored; the app reads
--     it. The view stays as the definition (0034 keeps replacing it).
--
-- public.desk_cache_refresh() rebuilds everything; pg_cron runs it every
-- half hour. Idempotent.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.desk_cache (
  key text primary key,
  value jsonb not null,
  refreshed_at timestamptz not null default now()
);
alter table public.desk_cache enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'desk_cache' and policyname = 'desk_cache_read') then
    create policy desk_cache_read on public.desk_cache for select using (true);
  end if;
end $$;
grant select on public.desk_cache to anon, authenticated;

-- --- The original bodies, kept as *_live -----------------------------------
do $$ begin
  if to_regprocedure('public.offering_stats_live(text)') is null and to_regprocedure('public.offering_stats(text)') is not null then
    alter function public.offering_stats(text) rename to offering_stats_live;
  end if;
  if to_regprocedure('public.credit_book_summary_live()') is null and to_regprocedure('public.credit_book_summary()') is not null then
    alter function public.credit_book_summary() rename to credit_book_summary_live;
  end if;
  if to_regprocedure('public.borrower_summary_live()') is null and to_regprocedure('public.borrower_summary()') is not null then
    alter function public.borrower_summary() rename to borrower_summary_live;
  end if;
end $$;

create or replace function public.offering_stats(p_class text default null) returns jsonb
language sql stable as $$
  select coalesce(
    (select value from public.desk_cache where key = 'offering_stats:' || coalesce(p_class, 'all')),
    public.offering_stats_live(p_class)
  );
$$;

create or replace function public.credit_book_summary() returns jsonb
language sql stable as $$
  select coalesce((select value from public.desk_cache where key = 'credit_book_summary'), public.credit_book_summary_live());
$$;

create or replace function public.borrower_summary() returns jsonb
language sql stable as $$
  select coalesce((select value from public.desk_cache where key = 'borrower_summary'), public.borrower_summary_live());
$$;

grant execute on function public.offering_stats(text), public.credit_book_summary(), public.borrower_summary() to anon, authenticated;

-- --- Deals: stored year and search text --------------------------------------
alter table public.deals add column if not exists yr integer
  generated always as (coalesce(extract(year from date)::integer, nullif(substring(date_text from '\m((?:19|20)\d{2})\M'), '')::integer)) stored;
alter table public.deals add column if not exists hay text
  generated always as (lower(
    coalesce(headline, '') || ' ' || coalesce(investor, '') || ' ' || coalesce(target, '') || ' ' ||
    coalesce(seller, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(target_country, ''))) stored;
create index if not exists deals_hay_trgm_idx on public.deals using gin (hay extensions.gin_trgm_ops);
create index if not exists deals_date_idx on public.deals (date desc nulls last, headline);
create index if not exists deals_kind_idx on public.deals (kind);
create index if not exists deals_yr_idx on public.deals (yr);

-- The search, live. Only the columns it filters, sorts and facets by travel
-- through the filtered set; the page's rows are joined back by id.
create or replace function public.deals_search_live(
  p_class text default null,
  p_kind text default null,
  p_year integer default null,
  p_q text default null,
  p_sort text default 'date',
  p_offset integer default 0,
  p_limit integer default 100
) returns jsonb
language sql stable as $$
  with words as (
    select w from unnest(string_to_array(lower(btrim(coalesce(p_q, ''))), ' ')) w where w <> ''
  ),
  filtered as materialized (
    select d.id, d.date, d.headline, d.amount, d.currency, d.valuation, d.valuation_currency,
           d.investor, d.investor_company_id, d.investor_id
      from public.deals d
     where (p_class is null or d.asset_class = p_class)
       and (p_kind is null or d.kind = p_kind)
       and (p_year is null or d.yr = p_year)
       and not exists (select 1 from words where d.hay not like '%' || replace(replace(replace(words.w, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ),
  ranked as (
    select f.id, row_number() over (order by
               case p_sort when 'amount' then (f.amount is null) when 'valuation' then (f.valuation is null) else false end,
               case when p_sort = 'amount' and f.amount is not null then coalesce(f.currency, '')
                    when p_sort = 'valuation' and f.valuation is not null then coalesce(f.valuation_currency, '') end,
               case when p_sort = 'amount' then -f.amount when p_sort = 'valuation' then -f.valuation end,
               f.date desc nulls last,
               f.headline,
               f.id) as rn
      from filtered f
  ),
  paged as (
    select id, rn from ranked
     where rn > greatest(p_offset, 0) and rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 500)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'date', d.date, 'date_text', d.date_text, 'kind', d.kind, 'asset_class', d.asset_class,
        'sport', d.sport, 'target', d.target, 'target_country', d.target_country, 'target_team_id', d.target_team_id,
        'target_company_id', d.target_company_id, 'investor', d.investor, 'investor_type', d.investor_type,
        'investor_company_id', d.investor_company_id, 'investor_id', d.investor_id, 'stake_pct', d.stake_pct,
        'amount', d.amount, 'currency', d.currency, 'valuation', d.valuation, 'valuation_currency', d.valuation_currency,
        'headline', d.headline, 'summary', left(d.summary, 220)
      ) order by p.rn) from paged p join public.deals d on d.id = p.id), '[]'::jsonb),
    'kinds', coalesce((select jsonb_agg(jsonb_build_array(k, n) order by n desc, k)
                         from (select kind k, count(*) n from public.deals where p_class is null or asset_class = p_class group by kind) x), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(jsonb_build_array(y, n) order by y desc)
                         from (select yr y, count(*) n from public.deals where yr is not null group by yr order by yr desc limit 8) x), '[]'::jsonb),
    'investors', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n, 'companyId', cid, 'investorId', iid) order by n desc, name)
                             from (select min(investor) as name, count(*) n, min(investor_company_id::text) as cid, min(investor_id::text) as iid
                                     from filtered group by lower(investor) order by count(*) desc, min(investor) limit 8) x), '[]'::jsonb)
  );
$$;

create or replace function public.deals_search(
  p_class text default null,
  p_kind text default null,
  p_year integer default null,
  p_q text default null,
  p_sort text default 'date',
  p_offset integer default 0,
  p_limit integer default 100
) returns jsonb
language plpgsql stable as $$
declare
  v jsonb;
begin
  if coalesce(btrim(p_q), '') = '' and p_kind is null and p_year is null
     and coalesce(p_sort, 'date') = 'date' and coalesce(p_offset, 0) = 0 and coalesce(p_limit, 100) = 100 then
    select value into v from public.desk_cache where key = 'deals_search:' || coalesce(p_class, 'all');
    if v is not null then
      return v;
    end if;
  end if;
  return public.deals_search_live(p_class, p_kind, p_year, p_q, p_sort, p_offset, p_limit);
end $$;

grant execute on function public.deals_search(text, text, integer, text, text, integer, integer),
                          public.deals_search_live(text, text, integer, text, text, integer, integer) to anon, authenticated, service_role;

-- --- Fund performance, stored --------------------------------------------------
create materialized view if not exists public.fund_performance_mv as select * from public.fund_performance;
create unique index if not exists fund_performance_mv_fund_idx on public.fund_performance_mv (fund_id);
create index if not exists fund_performance_mv_lps_idx on public.fund_performance_mv (lps desc, fund_id);
grant select on public.fund_performance_mv to anon, authenticated;

-- --- The refresh -----------------------------------------------------------------
-- Each figure in its own block: one that fails keeps its last good value and
-- the rest still refresh.
create or replace function public.desk_cache_refresh() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  c text;
  done text[] := '{}';
  failed text[] := '{}';
  put constant text := 'insert into public.desk_cache (key, value, refreshed_at) values ($1, $2, now())
                        on conflict (key) do update set value = excluded.value, refreshed_at = excluded.refreshed_at';
begin
  begin
    execute put using 'offering_stats:all', public.offering_stats_live(null);
    done := done || 'offering_stats:all';
  exception when others then failed := failed || ('offering_stats:all ' || sqlerrm); end;
  for c in select distinct asset_class from public.fund_offerings where is_pooled and asset_class is not null loop
    begin
      execute put using 'offering_stats:' || c, public.offering_stats_live(c);
      done := done || ('offering_stats:' || c);
    exception when others then failed := failed || ('offering_stats:' || c || ' ' || sqlerrm); end;
  end loop;
  begin
    execute put using 'credit_book_summary', public.credit_book_summary_live();
    done := done || 'credit_book_summary'::text;
  exception when others then failed := failed || ('credit_book_summary ' || sqlerrm); end;
  begin
    execute put using 'borrower_summary', public.borrower_summary_live();
    done := done || 'borrower_summary'::text;
  exception when others then failed := failed || ('borrower_summary ' || sqlerrm); end;
  begin
    execute put using 'deals_search:all', public.deals_search_live(null, null, null, null, 'date', 0, 100);
    done := done || 'deals_search:all'::text;
  exception when others then failed := failed || ('deals_search:all ' || sqlerrm); end;
  for c in select distinct asset_class from public.deals where asset_class is not null loop
    begin
      execute put using 'deals_search:' || c, public.deals_search_live(c, null, null, null, 'date', 0, 100);
      done := done || ('deals_search:' || c);
    exception when others then failed := failed || ('deals_search:' || c || ' ' || sqlerrm); end;
  end loop;
  begin
    refresh materialized view concurrently public.fund_performance_mv;
    done := done || 'fund_performance_mv'::text;
  exception when others then
    begin
      refresh materialized view public.fund_performance_mv;
      done := done || 'fund_performance_mv'::text;
    exception when others then failed := failed || ('fund_performance_mv ' || sqlerrm); end;
  end;
  return jsonb_build_object('done', to_jsonb(done), 'failed', to_jsonb(failed));
end $$;

revoke all on function public.desk_cache_refresh() from public, anon, authenticated;

select public.desk_cache_refresh();

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  if not exists (select 1 from cron.job where jobname = 'lpgp-desk-cache') then
    perform cron.schedule('lpgp-desk-cache', '7,37 * * * *', $job$select public.desk_cache_refresh()$job$);
  end if;
end $$;
