-- borrowers: part 2 of 2
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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
