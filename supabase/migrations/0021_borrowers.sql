-- 0021: borrowers -- the private companies behind the loan books, one row
-- per borrower across every lender's latest schedule of investments. What a
-- restructuring or operating adviser wants to know first: who lends to a
-- company, how much, at what spread, whether any of it is paid in kind, when
-- it matures, and how the lenders are marking it. All of it as the lenders
-- themselves tag it; nothing is estimated. Idempotent.

-- Borrower names as filers write them, folded so "Acme Holdings, Inc." and
-- "Acme Holdings Inc" are one borrower.
-- The index on this expression goes first: an index built by an earlier
-- edition of the fold keeps that edition's values, and a query planned over
-- it would group by stale keys beside fresh ones. It is rebuilt below.
drop index if exists public.credit_positions_borrower_key_idx;
create or replace function public.borrower_key(p text) returns text
language sql immutable as $$
  -- A filer's own numbering of tranches ("Acme, Inc. 1", "Acme, Inc. 2"), an
  -- XBRL member suffix ("Acme, Inc. [Member]") and a parenthesised instrument
  -- ("Acme, Inc. (Term Loan)") are not part of the name.
  select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p, '')), '\s*\[member\]\s*$', ''), '\s*\([^)]*\)', '', 'g'), '\s+\d{1,2}$', ''), '[.,''"()]', '', 'g'), '\s+(inc|incorporated|llc|l\.?l\.?c|lp|l\.?p\.?|ltd|limited|corp|corporation|co|company|holdings?|holdco|plc|sa|bv|gmbh|sarl|s\.?à\.?r\.?l\.?|pty|ag|intermediate|parent|buyer|bidco|midco|topco|acquisition|acquisitions)(\s|$)', ' ', 'g'), '\s+', ' ', 'g'));
$$;

create index if not exists credit_positions_borrower_key_idx on public.credit_positions (public.borrower_key(borrower));

-- Some filers tag a category where a name belongs ("First Lien Debt",
-- "Investments at Fair Value [Member]", "Sub Total Non-control/Non-affiliate
-- investments"). Those are a book's headings, not borrowers, and stay out of
-- the fold. Judged on the folded key, so suffixes and case do not matter.
create or replace function public.borrower_is_category(p text) returns boolean
language sql immutable as $$
  -- A member label with no legal form and no instrument in brackets is a
  -- heading (an industry, a control class), not a company.
  select (lower(coalesce(p, '')) like '%[member]%' and p !~ '\(' and p !~* '\m(inc|llc|l\.?p\.?|lp|ltd|limited|corp|corporation|co|company|holdings?|holdco|group|gmbh|sa|bv|plc|partners|capital|trust|fund|sarl|ag|pty|bidco|midco|topco|buyer|parent|acquisition|purchaser|international|systems|technologies|services|solutions|industries|enterprises|brands|products)\M')
      or public.borrower_key(p) ~ '^((sub ?)?total( .*)?|investments?( at fair value)?|debt investments?|(u ?s )?corporate debt|credit fund|(senior )?(secured )?(first|second|1st|2nd|third) lien( secured)?( (debt|loans?|notes?|term loans?))?|senior (secured )?(debt|loans?|notes?|term loans?)|(senior )?subordinated (debt|loans?|notes?)|unsecured (debt|loans?|notes?)|unitranche( loans?)?|equity( investments?| securities| interests?)?|preferred (equity|stock|securities)|common (equity|stock)|warrants?|structured (products?|finance|credit|notes?)|other investments?|non ?control(led)?[ /]?non ?affiliated?( investments?)?|control(led)?( investments?)?|affiliated?( investments?)?|cash( and cash)? equivalents?|money market funds?|short term investments?|joint ventures?|portfolio investments?|loans?|debt|notes?|bonds?|term loans?|revolvers?|delayed draw( term loans?)?)$';
$$;

-- One row per borrower at the lenders' latest periods. Materialised: the
-- fold runs over every position, and the API role has three seconds per
-- statement; pg_cron refreshes it every half hour, and the ingest's
-- derive job refreshes it after a queue run.
-- Derived, so rebuilt on every run and a changed fold takes effect. An
-- earlier edition was a plain view; either kind goes.
do $$
begin
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'borrowers') then execute 'drop view public.borrowers cascade'; end if;
  if exists (select 1 from pg_matviews where schemaname = 'public' and matviewname = 'borrowers') then execute 'drop materialized view public.borrowers cascade'; end if;
end $$;
create materialized view public.borrowers as
with book as (
  select p.*, l.name as lender_name, public.borrower_key(p.borrower) as bkey,
         -- The name as shown: the filer's spelling without its tranche number, member suffix or bracketed instrument.
         btrim(regexp_replace(regexp_replace(regexp_replace(p.borrower, '\s*\[Member\]\s*$', '', 'i'), '\s*\([^)]*\)', '', 'g'), '\s+\d{1,2}$', '')) as shown
  from public.credit_positions p join public.credit_lenders l on l.cik = p.lender_cik
  where p.as_of = l.latest_period and not p.is_summary and not public.borrower_is_category(p.borrower)
)
select
  bkey as key,
  (array_agg(shown order by length(shown) desc))[1] as borrower,
  count(distinct lender_cik) as lenders,
  count(*) as positions,
  sum(coalesce(fair_value, 0)) as fair_value,
  sum(coalesce(principal, 0)) as principal,
  sum(coalesce(cost, 0)) as cost,
  case when sum(case when cost > 0 and fair_value is not null then cost end) > 0
       then sum(case when cost > 0 and fair_value is not null then fair_value end) / sum(case when cost > 0 and fair_value is not null then cost end) end as mark,
  case when sum(case when spread is not null then greatest(coalesce(fair_value, 0), 1) end) > 0
       then sum(case when spread is not null then spread * greatest(coalesce(fair_value, 0), 1) end) / sum(case when spread is not null then greatest(coalesce(fair_value, 0), 1) end) end as spread,
  case when sum(case when interest_rate is not null then greatest(coalesce(fair_value, 0), 1) end) > 0
       then sum(case when interest_rate is not null then interest_rate * greatest(coalesce(fair_value, 0), 1) end) / sum(case when interest_rate is not null then greatest(coalesce(fair_value, 0), 1) end) end as rate,
  max(pik_rate) as pik_rate,
  min(maturity) as next_maturity,
  max(as_of) as as_of,
  string_agg(distinct public.instrument_group(coalesce(instrument, identifier)), ', ') as instruments,
  (array_agg(distinct lender_name))[1:6] as lender_names,
  max(industry) as industry
from book
group by bkey;

create unique index if not exists borrowers_key_idx on public.borrowers (key);
create index if not exists borrowers_fair_value_idx on public.borrowers (fair_value desc nulls last);
create index if not exists borrowers_name_idx on public.borrowers (lower(borrower));
grant select on public.borrowers to anon, authenticated;

-- The cascade above takes 0022's portco_debt with it; put it back on a
-- database that has 0022, so re-running this file never leaves a hole.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'portfolio_companies' and column_name = 'intel_key') then
    execute $v$create or replace view public.portco_debt with (security_invoker = true) as
      select p.id as portfolio_company_id, p.gp_company_id, b.*
      from public.portfolio_companies p
      join public.borrowers b on b.key = p.intel_key$v$;
  end if;
end $$;

create or replace function ingest.refresh_borrowers() returns void
language sql as $$
  refresh materialized view concurrently public.borrowers;
$$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  if not exists (select 1 from cron.job where jobname = 'lpgp-borrowers-refresh') then
    perform cron.schedule('lpgp-borrowers-refresh', '*/30 * * * *', $job$select ingest.refresh_borrowers()$job$);
  end if;
end $$;

-- The desk's summary in one call, and a search, both cheap enough for the
-- API role's statement limit.
create or replace function public.borrower_summary() returns jsonb
language sql stable as $$
  with b as (select * from public.borrowers)
  select jsonb_build_object(
    'borrowers', (select count(*) from b),
    'fairValue', (select coalesce(sum(fair_value), 0) from b),
    'clubbed', (select count(*) from b where lenders > 1),
    'stressed', (select count(*) from b where mark is not null and mark < 0.9),
    'pik', (select count(*) from b where pik_rate > 0),
    'maturing', (select count(*) from b where next_maturity between current_date and current_date + interval '18 months'),
    'markBins', (select coalesce(jsonb_agg(jsonb_build_object('label', lbl, 'count', n) order by lo), '[]'::jsonb)
                 from (select case when mark < 0.5 then 0 when mark < 0.7 then 1 when mark < 0.8 then 2 when mark < 0.9 then 3 when mark < 0.97 then 4 when mark <= 1.03 then 5 else 6 end lo,
                              case when mark < 0.5 then 'under 50' when mark < 0.7 then '50–69' when mark < 0.8 then '70–79' when mark < 0.9 then '80–89' when mark < 0.97 then '90–96' when mark <= 1.03 then '97–103' else 'over 103' end lbl,
                              count(*) n from b where mark is not null group by 1, 2) q),
    'largest', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'borrower', borrower, 'lenders', lenders, 'fairValue', fair_value, 'mark', mark, 'spread', spread) order by fair_value desc), '[]'::jsonb)
                from (select * from b order by fair_value desc limit 15) q),
    'mostLenders', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'borrower', borrower, 'lenders', lenders, 'fairValue', fair_value, 'mark', mark) order by lenders desc, fair_value desc), '[]'::jsonb)
                    from (select * from b order by lenders desc, fair_value desc limit 15) q)
  );
$$;

create or replace function public.borrower_search(p_q text default null, p_filter text default null, p_limit integer default 200) returns setof public.borrowers
language sql stable as $$
  select * from public.borrowers b
  where (p_q is null or btrim(p_q) = '' or b.borrower ilike '%' || btrim(p_q) || '%')
    and (p_filter is null or p_filter = ''
         or (p_filter = 'stressed' and b.mark is not null and b.mark < 0.9)
         or (p_filter = 'pik' and b.pik_rate > 0)
         or (p_filter = 'maturing' and b.next_maturity between current_date and current_date + interval '18 months')
         or (p_filter = 'clubbed' and b.lenders > 1))
  order by b.fair_value desc nulls last
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;

grant execute on function public.borrower_key(text), public.borrower_is_category(text), public.borrower_summary(), public.borrower_search(text, text, integer) to anon, authenticated;
