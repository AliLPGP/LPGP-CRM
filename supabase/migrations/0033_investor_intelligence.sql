-- 0033: what an investor says about itself (profile), what it says it will do
-- next (plans), and what its disclosures say a fund earned (performance).
--
-- The directory already knows an LP's type, total assets and alternatives
-- allocation as the workbook states them, and `commitments` holds what the
-- LP's own disclosures name. The desk also expects the categories a research
-- product shows beside an investor: allocations per asset class, strategy,
-- region and industry preferences, ticket size, practices, whether it is
-- still investing in alternatives, and the twelve-month plan per class. Those
-- come from research over public pages (the investor's own annual report,
-- investment policy statement, board papers, RFPs, pension disclosure pages,
-- press), never from a licensed database. As with `fund_details`, a value
-- with no page behind it is never stored; the money fields need a primary or
-- press source. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Investor profile: one row per LP, every field with its source
-- ---------------------------------------------------------------------------
create table if not exists public.investor_profiles (
  company_id             uuid primary key references public.companies (id) on delete cascade,
  investor_type          text,              -- INVESTOR_TYPES code (lib/directory/taxonomy.ts); wins over the workbook's wording when set
  aum_usd                numeric,
  aum_as_of              date,
  allocations            jsonb,             -- [{ "class": <AssetClassKey>, "current_pct", "target_pct", "current_usd", "as_of" }], each only as a page states it
  strategy_prefs         text[],            -- strategy keys (strategies.ts)
  region_prefs           text[],            -- REGIONS codes
  industry_prefs         text[],            -- INDUSTRIES codes
  ticket_min_usd         numeric,
  ticket_max_usd         numeric,
  practices              text[],            -- INVESTOR_PRACTICES keys (co-investment, secondaries, direct, first-time funds ...)
  active_in_alternatives boolean,           -- false = the investor says it is no longer investing in alternatives
  overview               text,
  -- Provenance
  sources                jsonb not null default '{}'::jsonb,   -- { field: [ { url, name, kind, as_of } ] }
  research_state         text not null default 'pending' check (research_state in ('pending', 'done', 'no_public_data')),
  researched_at          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists investor_profiles_state_idx on public.investor_profiles (research_state);

alter table public.investor_profiles enable row level security;
drop policy if exists "investor_profiles_read" on public.investor_profiles;
create policy "investor_profiles_read" on public.investor_profiles for select using (true);

-- ---------------------------------------------------------------------------
-- Plans: what an investor itself says it will do over the next twelve months,
-- one row per asset class per statement. The statement (board paper, pacing
-- plan, interview) is the row's identity, so the same plan read twice lands on
-- the same row and a later statement sits beside the earlier one rather than
-- overwriting it: the desk shows the newest by `as_of`.
-- ---------------------------------------------------------------------------
create table if not exists public.investor_plans (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  asset_class          text not null,       -- AssetClassKey
  status               text not null check (status in ('investing', 'considering', 'not_investing')),
  plan_types           text[],              -- PLAN_TYPES keys (new commitments, re-ups, co-investments, secondaries ...)
  strategies           text[],              -- strategy keys
  regions              text[],              -- REGIONS codes
  ticket_min_usd       numeric,
  ticket_max_usd       numeric,
  new_gp_relationships boolean,             -- will it back managers it has not backed before
  funds_planned        integer,
  note                 text,                -- the sentence, as the investor words it
  source_url           text not null,
  source_name          text,
  source_kind          text,
  as_of                date,
  created_at           timestamptz not null default now(),
  unique (company_id, asset_class, source_url)
);
create index if not exists investor_plans_company_idx on public.investor_plans (company_id);
create index if not exists investor_plans_class_idx on public.investor_plans (asset_class, status);

alter table public.investor_plans enable row level security;
drop policy if exists "investor_plans_read" on public.investor_plans;
create policy "investor_plans_read" on public.investor_plans for select using (true);

-- ---------------------------------------------------------------------------
-- Fund profile: the taxonomy codes beside the prose. The research job names a
-- strategy, regions and industries as codes so the Funds page can facet on
-- them without reading the prose again.
-- ---------------------------------------------------------------------------
alter table public.fund_details
  add column if not exists strategy_code  text,      -- a strategy-axis key from strategies.ts
  add column if not exists region_codes   text[],    -- REGIONS codes
  add column if not exists industry_codes text[];    -- INDUSTRIES codes

-- ---------------------------------------------------------------------------
-- Fund performance, LP-reported. An LP's disclosure states the net IRR and
-- multiple of each fund it holds; several LPs may report the same fund at
-- different dates, so the view keeps the median with its range and names
-- every LP behind it. Nothing here is a market benchmark: it is only what the
-- disclosures on file say, which is why the sources ride along per row.
-- Dropped and recreated so a change to the column list re-runs cleanly.
-- ---------------------------------------------------------------------------
drop view if exists public.fund_performance;
create view public.fund_performance with (security_invoker = true) as
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
           order by c.as_of desc nulls last, coalesce(lc.name, c.lp_name))  as sources
    from public.commitments c
    join public.funds f on f.id = c.fund_id
    left join public.companies mc on mc.id = f.company_id
    left join public.companies lc on lc.id = c.lp_company_id
   where c.net_irr is not null or c.multiple is not null
   group by f.id, f.name, f.company_id, mc.name, f.manager_name, f.vintage_year;

-- ---------------------------------------------------------------------------
-- Directory rollups: the index needs, per firm, counts it must not read a
-- table to get. Two more join funds and portfolio companies: how many
-- commitments an LP discloses, and which asset classes it says it is
-- investing in or considering.
-- ---------------------------------------------------------------------------
create or replace function public.directory_rollups() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'funds', (select coalesce(jsonb_object_agg(company_id::text, n), '{}'::jsonb) from (select company_id, count(*) n from public.funds where company_id is not null group by 1) f),
    'portcos', (select coalesce(jsonb_object_agg(gp_company_id::text, n), '{}'::jsonb) from (select gp_company_id, count(*) n from public.portfolio_companies group by 1) p),
    'commitments', (select coalesce(jsonb_object_agg(lp_company_id::text, n), '{}'::jsonb) from (select lp_company_id, count(*) n from public.commitments where lp_company_id is not null group by 1) c),
    'plans', (select coalesce(jsonb_object_agg(company_id::text, classes), '{}'::jsonb)
                from (select company_id, jsonb_agg(distinct asset_class) classes
                        from public.investor_plans where status in ('investing', 'considering') group by 1) q)
  );
$$;
grant execute on function public.directory_rollups() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Load researched profiles. p: an array of
--   { company_id, research_state?: 'done' | 'no_public_data',
--     fields: { <investor_profiles column>: value, ... },
--     plans:  [ { asset_class, status, plan_types, strategies, regions, ticket_min_usd, ticket_max_usd,
--                 new_gp_relationships, funds_planned, note, source_url, source_name, source_kind, as_of } ],
--     sources: { <column>: { url, name, kind, as_of } | [ ... ] } }
-- Same mechanics as fund_details_upsert: a field is kept only when it has a
-- source with an http(s) URL; the money fields and the active flag also need
-- that source to be primary or press (public.source_tier). A plan is kept only
-- with an http(s) source_url and a known status. Everything else is dropped
-- and counted. The AUM date rides with the AUM figure's source and the two
-- ends of a ticket range share theirs, because a page states those together.
-- ---------------------------------------------------------------------------
create or replace function public.investor_profile_upsert(p jsonb) returns jsonb
language plpgsql as $$
declare
  r jsonb; f jsonb; srcs jsonb; k text; v jsonb; sv jsonb; pl jsonb;
  accepted jsonb; accepted_src jsonb; cid uuid; ok boolean; f_count int;
  n_inv int := 0; n_fields int := 0; n_plans int := 0; n_dropped int := 0; n_missing int := 0;
  allowed text[] := array['investor_type','aum_usd','aum_as_of','allocations','strategy_prefs','region_prefs','industry_prefs',
    'ticket_min_usd','ticket_max_usd','practices','active_in_alternatives','overview'];
  strict_fields text[] := array['aum_usd','allocations','ticket_min_usd','ticket_max_usd','active_in_alternatives'];
  list_fields text[] := array['strategy_prefs','region_prefs','industry_prefs','practices'];
begin
  for r in select * from jsonb_array_elements(p) loop
    cid := nullif(r->>'company_id', '')::uuid;
    if cid is null or not exists (select 1 from public.companies where id = cid) then n_missing := n_missing + 1; continue; end if;
    f := coalesce(r->'fields', '{}'::jsonb);
    srcs := coalesce(r->'sources', '{}'::jsonb);
    accepted := '{}'::jsonb; accepted_src := '{}'::jsonb; f_count := 0;

    for k, v in select * from jsonb_each(f) loop
      if not (k = any(allowed)) or v = 'null'::jsonb then continue; end if;
      -- a lone code for a list field is the list of one
      if k = any(list_fields) and jsonb_typeof(v) = 'string' then v := jsonb_build_array(v); end if;
      if k = any(list_fields) and jsonb_typeof(v) <> 'array' then n_dropped := n_dropped + 1; continue; end if;
      if k = 'allocations' and jsonb_typeof(v) <> 'array' then n_dropped := n_dropped + 1; continue; end if;
      sv := coalesce(srcs->k,
                     case when k = 'aum_as_of' then srcs->'aum_usd'
                          when k in ('ticket_min_usd', 'ticket_max_usd') then coalesce(srcs->'ticket_min_usd', srcs->'ticket_max_usd') end);
      if sv is null then n_dropped := n_dropped + 1; continue; end if;
      if jsonb_typeof(sv) <> 'array' then sv := jsonb_build_array(sv); end if;
      ok := exists (select 1 from jsonb_array_elements(sv) s
                     where coalesce(s->>'url', '') ~ '^https?://'
                       and (not (k = any(strict_fields)) or public.source_tier(s->>'kind') in ('primary', 'press')));
      if not ok then n_dropped := n_dropped + 1; continue; end if;
      accepted := accepted || jsonb_build_object(k, v);
      accepted_src := accepted_src || jsonb_build_object(k, sv);
    end loop;

    insert into public.investor_profiles (company_id) values (cid) on conflict (company_id) do nothing;
    for k in select * from jsonb_object_keys(accepted) loop
      execute format('update public.investor_profiles set %I = (select %I from jsonb_populate_record(null::public.investor_profiles, $1)) where company_id = $2', k, k)
        using accepted, cid;
      f_count := f_count + 1;
    end loop;

    -- plans: the statement's URL is the row's identity
    for pl in select * from jsonb_array_elements(coalesce(r->'plans', '[]'::jsonb)) loop
      if coalesce(pl->>'asset_class', '') = ''
         or coalesce(pl->>'status', '') not in ('investing', 'considering', 'not_investing')
         or coalesce(pl->>'source_url', '') !~ '^https?://' then
        n_dropped := n_dropped + 1; continue;
      end if;
      insert into public.investor_plans as ip (company_id, asset_class, status, plan_types, strategies, regions,
          ticket_min_usd, ticket_max_usd, new_gp_relationships, funds_planned, note, source_url, source_name, source_kind, as_of)
      values (cid, pl->>'asset_class', pl->>'status',
          case when jsonb_typeof(pl->'plan_types') = 'array' then array(select jsonb_array_elements_text(pl->'plan_types')) end,
          case when jsonb_typeof(pl->'strategies') = 'array' then array(select jsonb_array_elements_text(pl->'strategies')) end,
          case when jsonb_typeof(pl->'regions') = 'array' then array(select jsonb_array_elements_text(pl->'regions')) end,
          case when jsonb_typeof(pl->'ticket_min_usd') = 'number' then (pl->>'ticket_min_usd')::numeric end,
          case when jsonb_typeof(pl->'ticket_max_usd') = 'number' then (pl->>'ticket_max_usd')::numeric end,
          case when jsonb_typeof(pl->'new_gp_relationships') = 'boolean' then (pl->>'new_gp_relationships')::boolean end,
          case when jsonb_typeof(pl->'funds_planned') = 'number' then (pl->>'funds_planned')::numeric::int end,
          nullif(pl->>'note', ''), pl->>'source_url', nullif(pl->>'source_name', ''), nullif(pl->>'source_kind', ''),
          case when pl->>'as_of' ~ '^\d{4}-\d{2}-\d{2}$' then (pl->>'as_of')::date end)
      on conflict (company_id, asset_class, source_url) do update set
        status = excluded.status, plan_types = excluded.plan_types, strategies = excluded.strategies, regions = excluded.regions,
        ticket_min_usd = excluded.ticket_min_usd, ticket_max_usd = excluded.ticket_max_usd,
        new_gp_relationships = excluded.new_gp_relationships, funds_planned = excluded.funds_planned, note = excluded.note,
        source_name = excluded.source_name, source_kind = excluded.source_kind, as_of = excluded.as_of;
      n_plans := n_plans + 1;
    end loop;

    update public.investor_profiles set
        sources = sources || accepted_src,
        research_state = case when coalesce(r->>'research_state', 'done') = 'no_public_data' and f_count = 0
                                   and not exists (select 1 from public.investor_plans where company_id = cid)
                              then 'no_public_data' else 'done' end,
        researched_at = now(), updated_at = now()
      where company_id = cid;
    n_fields := n_fields + f_count;
    n_inv := n_inv + 1;
  end loop;
  return jsonb_build_object('investors', n_inv, 'fields', n_fields, 'plans', n_plans, 'dropped_no_source', n_dropped, 'unknown_company', n_missing);
end $$;

-- ---------------------------------------------------------------------------
-- The next investors to research, best-documented first: an LP that already
-- discloses commitments, states its assets and has a website is the one whose
-- own pages will answer. Carries what the directory and its disclosures
-- already say so a researcher starts from the record, not a blank. Skips
-- investors already researched. For the service role / SQL editor.
-- ---------------------------------------------------------------------------
create or replace function public.investor_research_batch(p_limit integer default 50, p_offset integer default 0) returns jsonb
language sql stable as $$
  with held as (select lp_company_id, count(*) n from public.commitments where lp_company_id is not null group by 1),
       todo as (
         select c.id, c.name, c.domain, c.country, c.sub_type, c.investor_type, c.total_assets_usd, c.alts_allocation_pct,
                coalesce(h.n, 0) commitments,
                (coalesce(h.n, 0) * 3 + (c.total_assets_usd is not null)::int * 2 + (c.domain is not null)::int
                 + (c.discloses_commitments is not null)::int) score
           from public.companies c
           left join held h on h.lp_company_id = c.id
           left join public.investor_profiles ip on ip.company_id = c.id
          where c.category = 'LP' and (ip.company_id is null or ip.research_state = 'pending')
       )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'domain', t.domain, 'country', t.country, 'sub_type', t.sub_type,
      'investor_type', t.investor_type, 'total_assets_usd', t.total_assets_usd, 'alts_allocation_pct', t.alts_allocation_pct,
      'commitments', t.commitments,
      'funds_named', (select coalesce(jsonb_agg(fn), '[]'::jsonb)
                        from (select distinct on (lower(coalesce(cm.fund_name, f.name))) coalesce(cm.fund_name, f.name) fn, cm.as_of
                                from public.commitments cm left join public.funds f on f.id = cm.fund_id
                               where cm.lp_company_id = t.id and coalesce(cm.fund_name, f.name) is not null
                               order by lower(coalesce(cm.fund_name, f.name)), cm.as_of desc nulls last
                               limit 8) n)
    ) order by t.score desc, t.id), '[]'::jsonb)
  from (select * from todo order by score desc, id offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)) t;
$$;

grant execute on function public.investor_profile_upsert(jsonb) to service_role;
grant execute on function public.investor_research_batch(integer, integer) to service_role;
