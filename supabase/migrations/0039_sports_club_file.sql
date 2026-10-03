-- 0039: the club file.
--
-- The sports desk listed 188 football clubs with most fields empty. The
-- research behind this migration fills every club from pages that state each
-- fact (the club's site and accounts, the registry, the league, Deloitte,
-- Forbes, the press) and adds the four North American major leagues, where
-- most of the institutional money in sport sits.
--
--   * sports_teams gains `facts`: the rest of a club's file, one key per
--     category, each value carrying the page that states it and the phrase
--     the page uses -- revenue_breakdown, wages, operating_result,
--     pretax_result, net_debt, attendance, shirt_sponsor, kit_supplier, chair,
--     chief_executive, legal_entity, stadium_owner, honours. A category no
--     page states is absent. `founded_source_url` sources the founding year;
--     `researched_at` says when the file was last built.
--   * sports_team_owners gains `current` and `evidence`. A new record retires
--     the rows it replaces (current = false) instead of erasing them, so a
--     stake that changed hands keeps its history. Readers ask for current.
--   * public.sports_stage takes research files as they land;
--     ingest.load_sports_stage() turns the newest per club into rows: the
--     club, its owners, its deals and the investors in sport they name.
--
-- Idempotent.

alter table public.sports_teams add column if not exists facts jsonb not null default '{}'::jsonb;
alter table public.sports_teams add column if not exists founded_source_url text;
alter table public.sports_teams add column if not exists researched_at timestamptz;

alter table public.sports_team_owners add column if not exists current boolean not null default true;
alter table public.sports_team_owners add column if not exists evidence text;
create index if not exists sports_team_owners_current_idx on public.sports_team_owners (team_id) where current;

create table if not exists public.sports_stage (
  id bigserial primary key,
  key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists sports_stage_key_idx on public.sports_stage (key, id desc);
alter table public.sports_stage enable row level security;
-- No policy: only the service role and the database itself read or write it.
-- A load session grants anon insert for its duration and revokes it after.

create schema if not exists ingest;

create or replace function ingest.sports_num(v jsonb) returns numeric
language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
              when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v #>> '{}')::numeric
              else null end;
$$;

create or replace function ingest.sports_txt(v jsonb) returns text
language sql immutable as $$
  select case when jsonb_typeof(v) = 'string' and btrim(v #>> '{}') <> '' then btrim(v #>> '{}') else null end;
$$;

-- Only an http(s) page counts as a source.
create or replace function ingest.sports_url(v jsonb) returns text
language sql immutable as $$
  select case when ingest.sports_txt(v) ~* '^https?://' then ingest.sports_txt(v) else null end;
$$;

create or replace function ingest.sports_slug(t text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function ingest.load_sports_stage() returns jsonb
language plpgsql security definer set search_path = public, ingest, extensions as $$
declare
  r record;
  p jsonb;
  o jsonb;
  d jsonb;
  tid uuid;
  iid uuid;
  cid uuid;
  teams int := 0;
  owners int := 0;
  deals int := 0;
  investors int := 0;
  skipped text[] := '{}';
  dkey text;
begin
  for r in select distinct on (key) key, payload from public.sports_stage order by key, id desc loop
    p := r.payload;
    if ingest.sports_txt(p->'name') is null or ingest.sports_txt(p->'league') is null then
      skipped := skipped || r.key;
      continue;
    end if;

    insert into public.sports_teams as t (
      external_key, name, short_name, sport, league, country, city, stadium, stadium_capacity, stadium_capacity_source_url,
      founded_year, founded_source_url, domain, ownership_type, ownership_summary, ownership_source_url,
      revenue, revenue_currency, revenue_season, revenue_source_name, revenue_source_url,
      valuation, valuation_currency, valuation_year, valuation_source_name, valuation_source_url,
      social_followers, social_as_of, social_source_url, social_platforms, notes, sources, facts, source, researched_at, updated_at)
    values (
      r.key, ingest.sports_txt(p->'name'), ingest.sports_txt(p->'short_name'), coalesce(ingest.sports_txt(p->'sport'), 'football'),
      ingest.sports_txt(p->'league'), ingest.sports_txt(p->'country'), ingest.sports_txt(p->'city'),
      ingest.sports_txt(p->'stadium'), ingest.sports_num(p->'stadium_capacity')::int, ingest.sports_url(p->'stadium_capacity_source_url'),
      ingest.sports_num(p->'founded_year')::int, ingest.sports_url(p->'founded_source_url'), ingest.sports_txt(p->'domain'),
      coalesce(ingest.sports_txt(p->'ownership_type'), 'unknown'), ingest.sports_txt(p->'ownership_summary'), ingest.sports_url(p->'ownership_source_url'),
      ingest.sports_num(p->'revenue'), ingest.sports_txt(p->'revenue_currency'), ingest.sports_txt(p->'revenue_season'),
      ingest.sports_txt(p->'revenue_source_name'), ingest.sports_url(p->'revenue_source_url'),
      ingest.sports_num(p->'valuation'), ingest.sports_txt(p->'valuation_currency'), ingest.sports_num(p->'valuation_year')::int,
      ingest.sports_txt(p->'valuation_source_name'), ingest.sports_url(p->'valuation_source_url'),
      ingest.sports_num(p->'social_followers')::bigint, ingest.sports_txt(p->'social_as_of'), ingest.sports_url(p->'social_source_url'),
      coalesce(p->'social_platforms', '[]'::jsonb), ingest.sports_txt(p->'notes'), coalesce(p->'sources', '[]'::jsonb),
      coalesce(p->'facts', '{}'::jsonb), 'web_research', now(), now())
    on conflict (external_key) do update set
      name = excluded.name, short_name = excluded.short_name, sport = excluded.sport, league = excluded.league,
      country = excluded.country, city = coalesce(excluded.city, t.city), stadium = excluded.stadium,
      stadium_capacity = excluded.stadium_capacity, stadium_capacity_source_url = excluded.stadium_capacity_source_url,
      founded_year = excluded.founded_year, founded_source_url = excluded.founded_source_url, domain = coalesce(excluded.domain, t.domain),
      ownership_type = excluded.ownership_type, ownership_summary = excluded.ownership_summary, ownership_source_url = excluded.ownership_source_url,
      revenue = excluded.revenue, revenue_currency = excluded.revenue_currency, revenue_season = excluded.revenue_season,
      revenue_source_name = excluded.revenue_source_name, revenue_source_url = excluded.revenue_source_url,
      valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, valuation_year = excluded.valuation_year,
      valuation_source_name = excluded.valuation_source_name, valuation_source_url = excluded.valuation_source_url,
      social_followers = excluded.social_followers, social_as_of = excluded.social_as_of, social_source_url = excluded.social_source_url,
      social_platforms = excluded.social_platforms, notes = excluded.notes, sources = excluded.sources, facts = excluded.facts,
      source = 'web_research', researched_at = now(), updated_at = now()
    returning id into tid;
    teams := teams + 1;

    -- The record's owners replace the current ones; the replaced stay as history.
    update public.sports_team_owners set current = false where team_id = tid and current;
    for o in select * from jsonb_array_elements(coalesce(p->'owners', '[]'::jsonb)) loop
      if ingest.sports_txt(o->'name') is null then continue; end if;
      iid := null;
      cid := null;
      if coalesce((o->>'institutional')::boolean, false) then
        insert into public.sports_investors as si (external_key, name, investor_type, source_url, source, holdings)
        values (ingest.sports_slug(o->>'name'), ingest.sports_txt(o->'name'), ingest.sports_txt(o->'investor_type'),
                ingest.sports_url(o->'source_url'), 'web_research', '[]'::jsonb)
        on conflict (external_key) do update set investor_type = coalesce(si.investor_type, excluded.investor_type), updated_at = now()
        returning id, company_id into iid, cid;
        investors := investors + 1;
      end if;
      insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency,
                                             valuation_at_entry, investor_id, company_id, source_url, evidence, current)
      values (tid, ingest.sports_txt(o->'name'), ingest.sports_txt(o->'kind'), coalesce((o->>'institutional')::boolean, false),
              ingest.sports_txt(o->'investor_type'), ingest.sports_num(o->'stake_pct'), ingest.sports_num(o->'since_year')::int,
              ingest.sports_num(o->'amount'), ingest.sports_txt(o->'currency'), ingest.sports_num(o->'valuation_at_entry'),
              iid, cid, ingest.sports_url(o->'source_url'), left(ingest.sports_txt(o->'evidence'), 400), true);
      owners := owners + 1;
    end loop;

    for d in select * from jsonb_array_elements(coalesce(p->'deals', '[]'::jsonb)) loop
      if ingest.sports_txt(d->'headline') is null or ingest.sports_url(d->'source_url') is null or ingest.sports_txt(d->'investor') is null then continue; end if;
      dkey := 'deal:' || ingest.sports_slug(p->>'name') || ':' || ingest.sports_slug(d->>'investor') || ':' ||
              coalesce(ingest.sports_txt(d->'date'), ingest.sports_slug(coalesce(ingest.sports_txt(d->'date_text'), 'undated')));
      insert into public.deals as x (external_key, date, date_text, kind, asset_class, sport, target, target_kind, target_country, target_team_id,
                                     investor, investor_type, seller, stake_pct, amount, currency, valuation, valuation_currency,
                                     headline, summary, source_name, source_url, source, evidence, verified)
      values (dkey,
              case when ingest.sports_txt(d->'date') ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'date')::date else null end,
              ingest.sports_txt(d->'date_text'), coalesce(ingest.sports_txt(d->'kind'), 'other'), 'sports', coalesce(ingest.sports_txt(p->'sport'), 'football'),
              ingest.sports_txt(p->'name'), 'club', ingest.sports_txt(p->'country'), tid,
              ingest.sports_txt(d->'investor'), ingest.sports_txt(d->'investor_type'), ingest.sports_txt(d->'seller'),
              ingest.sports_num(d->'stake_pct'), ingest.sports_num(d->'amount'), ingest.sports_txt(d->'currency'),
              ingest.sports_num(d->'valuation'), ingest.sports_txt(d->'valuation_currency'),
              left(ingest.sports_txt(d->'headline'), 300), left(ingest.sports_txt(d->'summary'), 600),
              ingest.sports_txt(d->'source_name'), ingest.sports_url(d->'source_url'), 'web_research',
              left(ingest.sports_txt(d->'evidence'), 400), coalesce((d->>'verified')::boolean, false))
      on conflict (external_key) do update set
        date = excluded.date, date_text = excluded.date_text, kind = excluded.kind, target_team_id = excluded.target_team_id,
        investor_type = excluded.investor_type, seller = excluded.seller, stake_pct = excluded.stake_pct, amount = excluded.amount,
        currency = excluded.currency, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency,
        headline = excluded.headline, summary = excluded.summary, source_name = excluded.source_name, source_url = excluded.source_url,
        evidence = excluded.evidence, verified = excluded.verified;
      deals := deals + 1;
    end loop;
  end loop;

  -- Each investor in sport carries its current holdings, from the owner rows.
  update public.sports_investors si set holdings = h.holdings, updated_at = now()
    from (select o.investor_id, jsonb_agg(jsonb_build_object('target', coalesce(t.short_name, t.name), 'team_id', t.id, 'sport', t.sport,
                                                             'stake_pct', o.stake_pct, 'since_year', o.since_year, 'source_url', o.source_url)
                                          order by o.stake_pct desc nulls last) as holdings
            from public.sports_team_owners o join public.sports_teams t on t.id = o.team_id
           where o.current and o.investor_id is not null group by o.investor_id) h
   where h.investor_id = si.id;

  return jsonb_build_object('teams', teams, 'owners', owners, 'deals', deals, 'investor_links', investors, 'skipped', to_jsonb(skipped));
end $$;

revoke all on function ingest.load_sports_stage() from public, anon, authenticated;
