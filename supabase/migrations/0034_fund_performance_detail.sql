-- 0034: the Performance desk's full column set, from the LP-reported figures
-- already on file.
--
-- An LP's fund-by-fund review states, beside the net IRR and multiple, what
-- it committed (`amount`, in `currency`), what it has paid in (`contributed`),
-- what it has had back (`distributed`) and what is left (`remaining_value`).
-- From those the desk expects DPI, RVPI and the share called. Each is
-- arithmetic on one LP's own stated figures for one fund -- never on a null,
-- never across LPs or currencies -- and the view takes the median across the
-- LPs that state both terms. The UI labels them as arithmetic. Fund size
-- comes from `funds` (as filed, USD) and the fundraising status from the
-- researched fund profile (`fund_details`); a fund with no profile row has no
-- status, and nothing on file says whether a fund is liquidated or whether
-- it is commingled or a separate account, so the view does not pretend to.
--
-- One loader convention to respect: CalPERS's table (0019, `ingest.load_calpers`,
-- external_key 'lp:calpers-*') prints "Cash Out & Remaining Value" and the
-- loader stores that column as `remaining_value`, so for those rows the
-- residual value is `remaining_value - distributed` (both stated); every
-- other loader stores the residual value itself. RVPI reads each the way its
-- LP printed it.
--
-- `create or replace view` appends the new columns after 0033's, in order,
-- without dropping the view. Safe to re-run.
create or replace view public.fund_performance with (security_invoker = true) as
  select f.id                                                        as fund_id,
         f.name                                                      as fund_name,
         f.company_id,
         coalesce(mc.name, f.manager_name)                           as manager_name,
         f.vintage_year,
         count(distinct coalesce(c.lp_company_id::text, c.lp_name))::int as lps,
         (percentile_cont(0.5) within group (order by c.net_irr))::numeric  as net_irr_median,
         min(c.net_irr)                                              as net_irr_min,
         max(c.net_irr)                                              as net_irr_max,
         (percentile_cont(0.5) within group (order by c.multiple))::numeric as multiple_median,
         min(c.multiple)                                             as multiple_min,
         max(c.multiple)                                             as multiple_max,
         max(c.as_of)                                                as as_of,
         jsonb_agg(jsonb_build_object(
             'lp', coalesce(lc.name, c.lp_name), 'lp_id', c.lp_company_id,
             'url', c.source_url, 'as_of', c.as_of)
           order by c.as_of desc nulls last, coalesce(lc.name, c.lp_name))  as sources,
         -- Appended by 0034. Ratios of one LP's own stated figures, median
         -- across the LPs that state both terms; null when none does.
         (percentile_cont(0.5) within group (order by
             case when c.distributed is not null and c.contributed > 0 then c.distributed / c.contributed end))::numeric as dpi_median,
         (percentile_cont(0.5) within group (order by
             case when c.remaining_value is null or not (c.contributed > 0) then null
                  when c.external_key like 'lp:calpers-%' then
                       case when c.distributed is not null then (c.remaining_value - c.distributed) / c.contributed end
                  else c.remaining_value / c.contributed end))::numeric as rvpi_median,
         (percentile_cont(0.5) within group (order by
             case when c.contributed is not null and c.amount > 0 then c.contributed / c.amount * 100 end))::numeric as called_pct_median,
         f.fund_size_usd,
         fd.fundraising_status,
         count(c.contributed)::int                                   as lps_with_cash
    from public.commitments c
    join public.funds f on f.id = c.fund_id
    left join public.companies mc on mc.id = f.company_id
    left join public.companies lc on lc.id = c.lp_company_id
    left join public.fund_details fd on fd.fund_id = f.id
   where c.net_irr is not null or c.multiple is not null
   group by f.id, f.name, f.company_id, mc.name, f.manager_name, f.vintage_year, f.fund_size_usd, fd.fundraising_status;

comment on view public.fund_performance is
  'LP-reported fund performance: one row per fund, the median across the LPs that report it with the range and every source. dpi_median, rvpi_median and called_pct_median are arithmetic on each LP''s own stated figures (distributed/contributed, remaining_value/contributed, contributed/amount), never on a null, taken as the median across the LPs that state both terms. fund_size_usd is the fund''s size as filed; fundraising_status is the researched profile''s, null when no profile row.';
comment on column public.fund_performance.dpi_median is 'Median of distributed/contributed per LP row where both are stated and contributed > 0. Arithmetic, not a stated figure.';
comment on column public.fund_performance.rvpi_median is 'Median of remaining_value/contributed per LP row where both are stated and contributed > 0; for CalPERS rows (lp:calpers-*), whose remaining_value is printed as cash out plus remaining value, (remaining_value - distributed)/contributed. Arithmetic, not a stated figure.';
comment on column public.fund_performance.called_pct_median is 'Median of contributed/amount*100 per LP row where both are stated and amount > 0, in the LP''s own currency. Arithmetic, not a stated figure.';
comment on column public.fund_performance.fund_size_usd is 'funds.fund_size_usd: the size as filed, USD.';
comment on column public.fund_performance.fundraising_status is 'fund_details.fundraising_status (FUNDRAISING_STATUSES); null when the fund has no researched profile.';
comment on column public.fund_performance.lps_with_cash is 'LP rows for this fund that state a contributed figure.';
