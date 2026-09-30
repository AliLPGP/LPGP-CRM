-- borrowers: part 1 of 2
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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
  select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p, '')), '\s*\[member\]\s*$', ''), '\s*\([^()]*\)', '', 'g'), '\s*\([^()]*\)', '', 'g'), '[\s()]+\d{1,2}[\s()]*$', ''), '[.,''"()]', '', 'g'), '\s+(inc|incorporated|llc|l\.?l\.?c|lp|l\.?p\.?|ltd|limited|corp|corporation|co|company|holdings?|holdco|plc|sa|bv|gmbh|sarl|s\.?à\.?r\.?l\.?|pty|ag|intermediate|parent|buyer|bidco|midco|topco|acquisition|acquisitions)(?=\s|$)', ' ', 'g'), '\s+', ' ', 'g'));
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
         -- Brackets go twice over, so one nested former name ("(f/k/a X (f/k/a Y))") goes whole.
         btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(p.borrower, '\s*\[Member\]\s*$', '', 'i'), '\s*\([^()]*\)', '', 'g'), '\s*\([^()]*\)', '', 'g'), '\s+\d{1,2}$', ''), ' ()') as shown
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
