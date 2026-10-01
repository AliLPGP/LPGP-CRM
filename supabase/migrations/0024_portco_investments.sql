-- 0024: the investments behind the portfolio companies, as the press
-- releases state them. One ledger: these are rows in public.deals, so the
-- Deals desk, a deal's own page and the workflows show them with everything
-- else. What a release adds that the ledger lacked: every named co-investor,
-- the round, what the amount is (enterprise value, equity value, a round's
-- size, the price of a stake, a debt facility, or unspecified), the sentence
-- on the page that states it, and whether the figure was re-read against the
-- page before it was stored. A figure no page states is null. Idempotent.

alter table public.deals add column if not exists co_investors text[] not null default '{}';
alter table public.deals add column if not exists round text;
alter table public.deals add column if not exists amount_basis text;     -- enterprise_value | equity_value | round_size | stake_price | debt | unspecified
alter table public.deals add column if not exists evidence text;         -- the verbatim sentence on the source page
alter table public.deals add column if not exists verified boolean;      -- true: re-read against its page; false: page unreachable at check; null: not checked
alter table public.deals add column if not exists target_website text;

-- The company a deal is about, keyed the way portfolio_companies.intel_key
-- and the borrowers view are (public.borrower_key), so a sponsor's portfolio
-- company, a lender's borrower and the deals naming either read as one. A
-- loader that knows the portfolio company a release means sets the key
-- itself (a release may spell the name differently); otherwise it is the
-- fold of the target as written.
alter table public.deals add column if not exists target_key text;

create or replace function public.deals_target_key() returns trigger
language plpgsql as $$
begin
  if new.target_key is null
     or (tg_op = 'UPDATE' and new.target is distinct from old.target and new.target_key is not distinct from old.target_key) then
    new.target_key := public.borrower_key(new.target);
  end if;
  return new;
end $$;

drop trigger if exists deals_target_key on public.deals;
create trigger deals_target_key before insert or update on public.deals
  for each row execute function public.deals_target_key();

update public.deals set target_key = public.borrower_key(target) where target_key is null;
create index if not exists deals_target_key_idx on public.deals (target_key);
create index if not exists deals_amount_idx on public.deals (amount desc nulls last) where amount is not null;

-- The portfolio desk in one call, inside the API role's statement limit.
-- Money stays in its own currency: totals are per currency, never summed
-- across, and every total says how many deals it covers.
create or replace function public.portco_summary() returns jsonb
language sql stable as $$
  with p as (
    select pc.*, c.name as gp_name, c.domain as gp_domain
    from public.portfolio_companies pc join public.companies c on c.id = pc.gp_company_id
  ),
  d as (
    select d.* from public.deals d
    where d.target_key in (select intel_key from public.portfolio_companies where intel_key is not null)
  )
  select jsonb_build_object(
    'holdings', (select count(*) from p),
    'companies', (select count(distinct intel_key) from p),
    'sponsors', (select count(distinct gp_company_id) from p),
    'current', (select count(*) from p where status = 'current'),
    'realized', (select count(*) from p where status = 'realized'),
    'deals', (select count(*) from d),
    'dealsWithAmount', (select count(*) from d where amount is not null),
    'verifiedDeals', (select count(*) from d where verified),
    'byYear', (select coalesce(jsonb_agg(jsonb_build_object('year', y, 'investments', n) order by y), '[]'::jsonb)
               from (select invested_year y, count(*) n from p where invested_year between 2000 and extract(year from now())::int group by 1) q),
    'dealsByYear', (select coalesce(jsonb_agg(jsonb_build_object('year', y, 'deals', n, 'withAmount', a) order by y), '[]'::jsonb)
                    from (select extract(year from date)::int y, count(*) n, count(*) filter (where amount is not null) a from d where date is not null group by 1) q),
    'amountByCurrency', (select coalesce(jsonb_agg(jsonb_build_object('currency', currency, 'total', t, 'deals', n) order by n desc), '[]'::jsonb)
                         from (select currency, sum(amount) t, count(*) n from d where amount is not null and currency is not null and kind <> 'debt_financing' group by 1) q),
    'byKind', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'deals', n) order by n desc), '[]'::jsonb)
               from (select kind, count(*) n from d group by 1) q),
    'bySponsor', (select coalesce(jsonb_agg(jsonb_build_object('id', gp_company_id, 'name', gp_name, 'domain', gp_domain, 'companies', n, 'current', cur) order by n desc), '[]'::jsonb)
                  from (select gp_company_id, gp_name, gp_domain, count(*) n, count(*) filter (where status = 'current') cur from p group by 1, 2, 3 order by 4 desc limit 30) q),
    'bySector', (select coalesce(jsonb_agg(jsonb_build_object('sector', s, 'companies', n) order by n desc), '[]'::jsonb)
                 from (select initcap(btrim(sector)) s, count(*) n from p where coalesce(btrim(sector), '') <> '' group by 1 order by 2 desc limit 16) q),
    'byCountry', (select coalesce(jsonb_agg(jsonb_build_object('country', s, 'companies', n) order by n desc), '[]'::jsonb)
                  from (select btrim(regexp_replace(hq, '^.*,', '')) s, count(*) n from p where coalesce(btrim(hq), '') <> '' group by 1 order by 2 desc limit 16) q),
    'largest', (select coalesce(jsonb_agg(to_jsonb(q) order by q.currency, q.amount desc), '[]'::jsonb)
                from (select * from (
                        select d.id, d.target, d.target_key, d.kind, d.date, d.investor, d.co_investors, d.amount, d.currency, d.amount_basis, d.source_name, d.source_url, d.verified,
                               row_number() over (partition by d.currency order by d.amount desc) rn
                        from d where d.amount is not null and d.currency in ('USD', 'EUR', 'GBP') and d.kind <> 'debt_financing') r
                      where rn <= 12) q)
  );
$$;

grant execute on function public.portco_summary() to anon, authenticated;
