-- 0037: a company's page in a few round trips.
--
-- Three things made a firm's profile slow. `fund_offerings_latest` is
-- "the latest Form D per issuer" over every filing, so asking it for one
-- manager's funds sorted all 48k filings first and ran into the API role's
-- three-second statement limit on every profile. Naming a limited partner's
-- commitments (880 for CalSTRS) took a dozen round trips, fund ids and
-- company ids in batches of 150, one after the other. And the tab bar's
-- counts needed every tab's rows before the header could draw.
--
-- `fund_offerings_for` finds the issuers a filing links to the firm (or
-- the fund) first, by the partial index, and only then takes each one's
-- latest filing, so it says exactly what the view says for that firm.
-- `company_commitments` returns a firm's commitments as LP and as manager
-- with the fund, LP and manager names joined in, in the shape
-- `nameCommitments` built in the app. `company_profile_counts` returns the
-- counts the header and tab bar show, each capped where the app capped the
-- list it used to count. Safe to re-run.

create index if not exists fund_offerings_fund_idx on public.fund_offerings (fund_id) where fund_id is not null;

-- The latest Form D per issuer, for the filings that name one manager or
-- one fund: the issuers first, then each one's latest filing, then the
-- same filters the view's readers apply.
create or replace function public.fund_offerings_for(p_gp uuid default null, p_fund uuid default null, p_pooled boolean default true, p_limit integer default 200)
returns setof public.fund_offerings
language sql stable as $$
  with ciks as (
    select distinct cik from public.fund_offerings
    where (p_gp is not null and gp_company_id = p_gp) or (p_fund is not null and fund_id = p_fund)
  ), latest as (
    select distinct on (f.cik) f.* from public.fund_offerings f join ciks on ciks.cik = f.cik
    order by f.cik, f.filing_date desc nulls last, f.accession_no desc
  )
  select l.* from latest l
  where (p_gp is null or l.gp_company_id = p_gp)
    and (p_fund is null or l.fund_id = p_fund)
    and (not p_pooled or l.is_pooled)
  order by l.filing_date desc nulls last, l.amount_sold desc nulls last
  limit p_limit;
$$;
grant execute on function public.fund_offerings_for(uuid, uuid, boolean, integer) to anon, authenticated;

-- A firm's commitments, named: `asLp` where it is the limited partner,
-- `asGp` where its own column names it as the manager. A fund's manager
-- stands in for a missing gp_company_id, a fund's name for a missing
-- fund_name, and a company's directory name for a missing lp_name or
-- gp_name -- the same fallbacks the app applied. Newest year first, then
-- the largest amount, blanks counting as zero, as the app sorted them.
create or replace function public.company_commitments(p_company uuid) returns jsonb
language sql stable as $$
  with named as (
    select
      c.id, c.lp_company_id, coalesce(c.gp_company_id, f.company_id) as gp_company_id, c.fund_id,
      c.lp_name, c.gp_name, c.fund_name, c.amount, c.amount_usd, c.currency, c.amount_text,
      c.commitment_date, c.commitment_date_text, c.commitment_year, c.disclosure_type, c.source, c.source_url,
      c.asset_class, c.contributed, c.distributed, c.remaining_value, c.net_irr, c.multiple, c.as_of,
      coalesce(c.fund_name, f.name) as fund_label,
      coalesce(c.lp_name, lp.name) as lp_label,
      coalesce(c.gp_name, gp.name) as gp_label,
      c.gp_company_id as filed_gp_company_id
    from public.commitments c
    left join public.funds f on f.id = c.fund_id
    left join public.companies lp on lp.id = c.lp_company_id
    left join public.companies gp on gp.id = coalesce(c.gp_company_id, f.company_id)
    where c.lp_company_id = p_company or c.gp_company_id = p_company
  )
  select jsonb_build_object(
    'asLp', coalesce((
      select jsonb_agg(to_jsonb(n) - 'filed_gp_company_id' order by coalesce(n.commitment_year, 0) desc, coalesce(n.amount, 0) desc, n.id)
      from named n where n.lp_company_id = p_company), '[]'::jsonb),
    'asGp', coalesce((
      select jsonb_agg(to_jsonb(n) - 'filed_gp_company_id' order by coalesce(n.commitment_year, 0) desc, coalesce(n.amount, 0) desc, n.id)
      from named n where n.filed_gp_company_id = p_company), '[]'::jsonb)
  );
$$;
grant execute on function public.company_commitments(uuid) to anon, authenticated;

-- What the profile's header and tab bar count, in one call. Each count is
-- capped where the app capped the list it used to count (300 deals, 100
-- signals, 2,000 funds, 1,000 portfolio companies, 200 Form D raises,
-- 200 sports stakes), so the figures read the same as before.
create or replace function public.company_profile_counts(p_company uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'contacts', (select count(*) from public.contacts where company_id = p_company),
    'connectable', (select count(*) from public.contacts where company_id = p_company and connectable),
    'funds', least((select count(*) from public.funds where company_id = p_company), 2000),
    'portcos', least((select count(*) from public.portfolio_companies where gp_company_id = p_company), 1000),
    'deals', least((select count(*) from public.deals where investor_company_id = p_company or target_company_id = p_company), 300),
    'signals', least((select count(*) from public.signals where company_ids @> array[p_company]), 100),
    'held', least((select count(*) from public.sports_team_owners o join public.sports_teams t on t.id = o.team_id where o.company_id = p_company), 200),
    'offerings', (select count(*) from public.fund_offerings_for(p_company, null, true, 200)),
    'lenders', (select count(*) from public.credit_lenders where company_id = p_company and latest_period is not null),
    'asLp', (select count(*) from public.commitments where lp_company_id = p_company),
    'asLpDisclosed', (select count(*) from public.commitments where lp_company_id = p_company and source is distinct from 'sample'),
    'asGp', (select count(*) from public.commitments where gp_company_id = p_company),
    'events', (select count(distinct event_name) from public.event_participants where company_id = p_company),
    'providers', (select count(*) from public.service_relationships where client_company_id = p_company),
    'clients', (select count(*) from public.service_relationships where provider_company_id = p_company),
    'notes', (select count(*) from public.notes where entity_type = 'company' and entity_id = p_company)
  );
$$;
grant execute on function public.company_profile_counts(uuid) to anon, authenticated;
