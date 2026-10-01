-- 0029: the Deals page shipped every deal (20k rows, 24 MB of HTML) so the
-- browser could filter them. The database filters, sorts and pages instead:
-- one call returns a page of rows, the total, and the facets that go beside it.
--
-- Facets keep the meaning they had in the browser: kind counts are within the
-- chosen asset class, year counts are over the whole ledger, and "most active"
-- is over the rows the filters leave. Money sorts inside its own currency,
-- never across currencies. Safe to re-run.
create or replace function public.deals_search(
  p_class text default null,
  p_kind text default null,
  p_year integer default null,
  p_q text default null,
  p_sort text default 'date',
  p_offset integer default 0,
  p_limit integer default 100
) returns jsonb
language sql stable as $$
  with base as (
    select d.*,
           coalesce(extract(year from d.date)::int, nullif(substring(d.date_text from '\m((?:19|20)\d{2})\M'), '')::int) as yr,
           lower(concat_ws(' ', d.headline, d.investor, d.target, d.seller, d.summary, d.target_country)) as hay
      from public.deals d
  ),
  words as (
    select w from unnest(string_to_array(lower(btrim(coalesce(p_q, ''))), ' ')) w where w <> ''
  ),
  filtered as (
    select b.* from base b
     where (p_class is null or b.asset_class = p_class)
       and (p_kind is null or b.kind = p_kind)
       and (p_year is null or b.yr = p_year)
       and not exists (select 1 from words where b.hay not like '%' || replace(replace(replace(words.w, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ),
  paged as (
    select f.*
      from filtered f
     order by
       case p_sort when 'amount' then (f.amount is null) when 'valuation' then (f.valuation is null) else false end,
       case when p_sort = 'amount' and f.amount is not null then coalesce(f.currency, '')
            when p_sort = 'valuation' and f.valuation is not null then coalesce(f.valuation_currency, '') end,
       case when p_sort = 'amount' then -f.amount when p_sort = 'valuation' then -f.valuation end,
       f.date desc nulls last,
       f.headline
     offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'date', p.date, 'date_text', p.date_text, 'kind', p.kind, 'asset_class', p.asset_class,
        'sport', p.sport, 'target', p.target, 'target_country', p.target_country, 'target_team_id', p.target_team_id,
        'target_company_id', p.target_company_id, 'investor', p.investor, 'investor_type', p.investor_type,
        'investor_company_id', p.investor_company_id, 'investor_id', p.investor_id, 'stake_pct', p.stake_pct,
        'amount', p.amount, 'currency', p.currency, 'valuation', p.valuation, 'valuation_currency', p.valuation_currency,
        'headline', p.headline, 'summary', left(p.summary, 220)
      )) from (select * from paged) p), '[]'::jsonb),
    'kinds', coalesce((select jsonb_agg(jsonb_build_array(k, n) order by n desc, k)
                         from (select kind k, count(*) n from public.deals where p_class is null or asset_class = p_class group by kind) x), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(jsonb_build_array(y, n) order by y desc)
                         from (select yr y, count(*) n from base where yr is not null group by yr order by yr desc limit 8) x), '[]'::jsonb),
    'investors', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n, 'companyId', cid, 'investorId', iid) order by n desc, name)
                             from (select min(investor) as name, count(*) n, min(investor_company_id::text) as cid, min(investor_id::text) as iid
                                     from filtered group by lower(investor) order by count(*) desc, min(investor) limit 8) x), '[]'::jsonb)
  );
$$;

grant execute on function public.deals_search(text, text, integer, text, text, integer, integer) to anon, authenticated, service_role;
