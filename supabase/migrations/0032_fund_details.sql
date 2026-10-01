-- 0032: the fund profile a desk expects (type, strategy, geography,
-- fundraising, structure, terms, sustainability, series), one row per fund,
-- every figure with the page that states it.
--
-- `funds` already carries what the filings give us (name as filed, manager,
-- vintage, size, vehicle kind, domicile, service providers); `fund_details`
-- holds the categories filings do not: they are filled by research from public
-- pages (the manager's own site and announcements, SEC filings, LP
-- disclosures, press). A fund with no row is simply "not yet researched".
-- Nothing is estimated: a value without a source URL is never stored, and the
-- fee, term and structure fields need a primary or press source (a filing, the
-- manager's own document, a wire). Safe to re-run.

create table if not exists public.fund_details (
  fund_id               uuid primary key references public.funds (id) on delete cascade,
  -- Overview / investment strategy
  overview              text,
  core_industry         text,
  industry_focus        text[],
  geographic_scope      text,              -- Global | Continental | Regional | Country, as the source words it
  core_geography        text,
  geographic_exposure   jsonb,             -- [{ "region": "North America", "pct": 100 }]
  -- Fundraising
  fundraising_status    text,              -- Pre-marketing | Raising | Final close | Closed ...
  fundraising_launch    date,
  target_size           numeric,           -- in target_currency, never converted
  target_currency       text,
  hard_cap              numeric,
  closes                jsonb,             -- [{ "label": "First close", "date": "2024-07-01", "amount": 790000000, "currency": "USD", "estimated": false }]
  co_investment_offered boolean,
  -- Structure and terms
  legal_structure       text,              -- LP, SCSp, SICAV-RAIF, Cayman exempted LP ...
  term_years            integer,
  investment_period_years integer,
  extension_years       integer,
  gp_commitment_pct     numeric,
  management_fee_pct    numeric,
  fee_basis             text,              -- committed capital | invested capital | NAV
  carried_interest_pct  numeric,
  hurdle_pct            numeric,
  -- Sustainability
  sfdr_article          text,              -- 6 | 8 | 9
  esg_policy            boolean,
  sustainability_note   text,
  -- Series
  series_name           text,
  series_sequence       integer,
  predecessor_fund_id   uuid references public.funds (id) on delete set null,
  -- Provenance
  sources               jsonb not null default '{}'::jsonb,   -- { field: { url, name, kind, as_of } }
  research_state        text not null default 'pending' check (research_state in ('pending', 'done', 'no_public_data')),
  researched_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists fund_details_state_idx on public.fund_details (research_state);

alter table public.fund_details enable row level security;
drop policy if exists "fund_details_read" on public.fund_details;
create policy "fund_details_read" on public.fund_details for select using (true);

-- Load researched details. p: an array of
--   { fund_id, research_state?: 'done' | 'no_public_data',
--     fields: { <column>: value, ... },
--     sources: { <column>: { url, name, kind, as_of } | [ ... ] } }
-- A field is kept only when it has a source with an http(s) URL; the fee, term
-- and structure fields also need that source to be primary or press
-- (public.source_tier). Everything else is dropped and counted.
create or replace function public.fund_details_upsert(p jsonb) returns jsonb
language plpgsql as $$
declare
  r jsonb; f jsonb; srcs jsonb; k text; v jsonb; sv jsonb;
  accepted jsonb; accepted_src jsonb; fid uuid; ok boolean;
  n_funds int := 0; n_fields int := 0; n_dropped int := 0; n_missing int := 0;
  allowed text[] := array['overview','core_industry','industry_focus','geographic_scope','core_geography','geographic_exposure',
    'fundraising_status','fundraising_launch','target_size','target_currency','hard_cap','closes','co_investment_offered',
    'legal_structure','term_years','investment_period_years','extension_years','gp_commitment_pct','management_fee_pct','fee_basis',
    'carried_interest_pct','hurdle_pct','sfdr_article','esg_policy','sustainability_note','series_name','series_sequence'];
  strict_fields text[] := array['legal_structure','term_years','investment_period_years','extension_years','gp_commitment_pct',
    'management_fee_pct','fee_basis','carried_interest_pct','hurdle_pct'];
begin
  for r in select * from jsonb_array_elements(p) loop
    fid := nullif(r->>'fund_id', '')::uuid;
    if fid is null or not exists (select 1 from public.funds where id = fid) then n_missing := n_missing + 1; continue; end if;
    f := coalesce(r->'fields', '{}'::jsonb);
    srcs := coalesce(r->'sources', '{}'::jsonb);
    accepted := '{}'::jsonb; accepted_src := '{}'::jsonb;

    for k, v in select * from jsonb_each(f) loop
      if not (k = any(allowed)) or v = 'null'::jsonb then continue; end if;
      -- the currency rides with the target figure's source
      sv := coalesce(srcs->k, case when k = 'target_currency' then srcs->'target_size' end);
      if sv is null then n_dropped := n_dropped + 1; continue; end if;
      if jsonb_typeof(sv) <> 'array' then sv := jsonb_build_array(sv); end if;
      ok := exists (select 1 from jsonb_array_elements(sv) s
                     where coalesce(s->>'url', '') ~ '^https?://'
                       and (not (k = any(strict_fields)) or public.source_tier(s->>'kind') in ('primary', 'press')));
      if not ok then n_dropped := n_dropped + 1; continue; end if;
      accepted := accepted || jsonb_build_object(k, v);
      accepted_src := accepted_src || jsonb_build_object(k, sv);
    end loop;

    insert into public.fund_details (fund_id) values (fid) on conflict (fund_id) do nothing;
    for k in select * from jsonb_object_keys(accepted) loop
      execute format('update public.fund_details set %I = (select %I from jsonb_populate_record(null::public.fund_details, $1)) where fund_id = $2', k, k)
        using accepted, fid;
      n_fields := n_fields + 1;
    end loop;
    update public.fund_details set
        sources = sources || accepted_src,
        research_state = case when coalesce(r->>'research_state', 'done') = 'no_public_data' and n_fields = 0 then 'no_public_data' else 'done' end,
        researched_at = now(), updated_at = now()
      where fund_id = fid;
    n_funds := n_funds + 1;
  end loop;
  return jsonb_build_object('funds', n_funds, 'fields', n_fields, 'dropped_no_source', n_dropped, 'unknown_fund', n_missing);
end $$;

-- The next funds to research, best-documented and most-held first, with what we
-- already know about each so a researcher starts from the filing rather than a
-- blank. Skips funds already researched. For the service role / SQL editor.
create or replace function public.fund_research_batch(p_limit integer default 50, p_offset integer default 0) returns jsonb
language sql stable as $$
  with held as (select fund_id, count(*) n from public.commitments where fund_id is not null group by fund_id),
       off as (select distinct on (fund_id) fund_id, first_sale_date, offering_amount, amount_sold, investors_count, min_investment, source_url
                 from public.fund_offerings where fund_id is not null order by fund_id, filing_date desc nulls last),
       todo as (
         select f.*, coalesce(h.n, 0) lp_commitments, o.first_sale_date, o.offering_amount, o.amount_sold, o.investors_count, o.min_investment, o.source_url form_d_url,
                (coalesce(h.n, 0) * 3 + (f.fund_size_usd is not null)::int * 2 + (o.fund_id is not null)::int * 2
                 + (f.vintage_year >= 2020)::int + (jsonb_array_length(coalesce(f.service_providers, '[]'::jsonb)) > 0)::int) score
           from public.funds f
           left join held h on h.fund_id = f.id
           left join off o on o.fund_id = f.id
           left join public.fund_details d on d.fund_id = f.id
          where d.fund_id is null or d.research_state = 'pending'
       )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'name_filed', t.name_filed,
      'manager', (select jsonb_build_object('name', c.name, 'domain', c.domain) from public.companies c where c.id = t.company_id),
      'size_usd', t.fund_size_usd, 'target_usd', t.target_size_usd, 'vintage', t.vintage_year, 'strategy', t.strategy,
      'vehicle_kind', t.vehicle_kind, 'domicile', t.domicile, 'lp_commitments', t.lp_commitments,
      'form_d', case when t.form_d_url is null then null else jsonb_build_object('first_sale', t.first_sale_date, 'offering', t.offering_amount, 'sold', t.amount_sold, 'investors', t.investors_count, 'min_investment', t.min_investment, 'url', t.form_d_url) end
    ) order by t.score desc, t.id), '[]'::jsonb)
  from (select * from todo order by score desc, id offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)) t;
$$;

grant execute on function public.fund_details_upsert(jsonb) to service_role;
grant execute on function public.fund_research_batch(integer, integer) to service_role;
