-- 0025: the portfolio-company profile a desk works from, one row per company
-- (portco_intel, keyed by borrower_key) and per holding (portfolio_companies),
-- with the source of every field and how credible that source is.
--
-- Credibility is enforced where the data enters, not left to the reader:
--   primary    a regulator's filing (SEC, Companies House, other registries),
--              the company's own site or report, the sponsor's own site or
--              release, or a wire release issued by either;
--   press      a major financial newsroom (Reuters, Bloomberg, FT, WSJ, ...);
--   secondary  data vendors, Wikipedia/Wikidata, aggregators, anything else.
-- Revenue, EBITDA, employees and the named executives are stored only from
-- primary or press sources. A secondary source can suggest a person (kept in
-- portco_intel.leaders with confirmed = false) but never fills a column.
-- Idempotent.

alter table public.portco_intel add column if not exists website text;
alter table public.portco_intel add column if not exists description text;
alter table public.portco_intel add column if not exists sector text;
alter table public.portco_intel add column if not exists subsector text;
alter table public.portco_intel add column if not exists business_model text;   -- B2B, B2C, B2B2C, B2G, marketplace, ...
alter table public.portco_intel add column if not exists email text;            -- as the company publishes it
alter table public.portco_intel add column if not exists email_type text;       -- generic | investor_relations | press | person
alter table public.portco_intel add column if not exists ceo text;
alter table public.portco_intel add column if not exists cfo text;
alter table public.portco_intel add column if not exists coo text;
alter table public.portco_intel add column if not exists managing_director text;
alter table public.portco_intel add column if not exists leaders jsonb not null default '[]'::jsonb; -- [{role, name, title, source_url, source_kind, confirmed}]
alter table public.portco_intel add column if not exists employees_as_of date;
alter table public.portco_intel add column if not exists employees_text text;    -- as stated: "more than 5,000"
alter table public.portco_intel add column if not exists revenue_stated numeric;
alter table public.portco_intel add column if not exists revenue_currency text;
alter table public.portco_intel add column if not exists revenue_period text;    -- "FY2025", "12 months to 2025-06-30"
alter table public.portco_intel add column if not exists ebitda_stated numeric;
alter table public.portco_intel add column if not exists ebitda_currency text;
alter table public.portco_intel add column if not exists ebitda_period text;
alter table public.portco_intel add column if not exists ebitda_basis text;      -- reported | adjusted | derived (operating profit + D&A)
alter table public.portco_intel add column if not exists founded_year integer;
alter table public.portco_intel add column if not exists sources jsonb not null default '{}'::jsonb; -- field -> [{url, name, kind, as_of}]
alter table public.portco_intel add column if not exists profile_at timestamptz;

alter table public.portfolio_companies add column if not exists status_note text;
alter table public.portfolio_companies add column if not exists asset_class text;          -- Private equity, Growth equity, Venture capital, Infrastructure, ...
alter table public.portfolio_companies add column if not exists deal_type text;            -- Buyout, Take-private, Growth investment, Minority stake, Venture round, Carve-out, ...
alter table public.portfolio_companies add column if not exists value_creation_plan text;  -- the sponsor's stated plan, in a sentence or two
alter table public.portfolio_companies add column if not exists value_creation_source_url text;
alter table public.portfolio_companies add column if not exists notes text;

-- The credibility tier of a source, from its kind as the researcher recorded it.
create or replace function public.source_tier(p_kind text) returns text
language sql immutable as $$
  select case lower(coalesce(p_kind, ''))
    when 'filing' then 'primary' when 'registry' then 'primary' when 'company' then 'primary'
    when 'sponsor' then 'primary' when 'wire' then 'primary' when 'annual_report' then 'primary'
    when 'press' then 'press'
    else 'secondary' end;
$$;

-- Load profiles: an array of {name, key?, website, description, sector, subsector, business_model,
-- email, email_type, employees, employees_text, employees_as_of, revenue, revenue_currency, revenue_period,
-- ebitda, ebitda_currency, ebitda_period, ebitda_basis, founded_year, country, notes,
-- leaders: [{role: ceo|cfo|coo|managing_director|other, name, title, source_url, source_kind}],
-- sources: {field: {url, name, kind, as_of}},
-- holding: {sponsor (directory name), status, status_note, asset_class, deal_type, value_creation_plan, value_creation_source_url, notes}}.
-- Fields whose source is not primary or press are dropped for revenue, EBITDA and employees;
-- people from such sources are kept as unconfirmed leads only.
create or replace function public.portco_profile_upsert(p_rows jsonb) returns jsonb
language plpgsql as $$
declare
  r jsonb; k text; src jsonb; srcs jsonb; ok_fin boolean; ok_emp boolean; n int := 0; dropped int := 0;
  l jsonb; leaders jsonb; role text; conf boolean; ceo text; cfo text; coo text; md text; gp uuid;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    k := coalesce(nullif(r->>'key', ''), public.borrower_key(r->>'name'));
    if k is null or k = '' or coalesce(r->>'name', '') = '' then continue; end if;
    srcs := coalesce(r->'sources', '{}'::jsonb);
    -- Each field's source as an array, so several sources can back one field.
    src := (select coalesce(jsonb_object_agg(f, case when jsonb_typeof(v) = 'array' then v else jsonb_build_array(v) end), '{}'::jsonb) from jsonb_each(srcs) e(f, v));
    ok_fin := exists (select 1 from jsonb_array_elements(coalesce(src->'revenue', '[]')) s where public.source_tier(s->>'kind') in ('primary', 'press'));
    ok_emp := exists (select 1 from jsonb_array_elements(coalesce(src->'employees', '[]')) s where public.source_tier(s->>'kind') in ('primary', 'press'));
    if r ? 'revenue' and not ok_fin then dropped := dropped + 1; end if;

    leaders := '[]'::jsonb; ceo := null; cfo := null; coo := null; md := null;
    for l in select * from jsonb_array_elements(coalesce(r->'leaders', '[]'::jsonb)) loop
      if coalesce(l->>'name', '') = '' then continue; end if;
      role := lower(coalesce(l->>'role', 'other'));
      conf := public.source_tier(l->>'source_kind') in ('primary', 'press') and coalesce(l->>'source_url', '') ~ '^https?://';
      leaders := leaders || jsonb_build_array(l || jsonb_build_object('confirmed', conf));
      if conf then
        if role = 'ceo' and ceo is null then ceo := l->>'name'; end if;
        if role = 'cfo' and cfo is null then cfo := l->>'name'; end if;
        if role = 'coo' and coo is null then coo := l->>'name'; end if;
        if role = 'managing_director' and md is null then md := l->>'name'; end if;
      end if;
    end loop;

    insert into public.portco_intel as pi (key, name, website, description, sector, subsector, business_model, email, email_type,
        ceo, cfo, coo, managing_director, leaders, employees, employees_text, employees_as_of,
        revenue_stated, revenue_currency, revenue_period, ebitda_stated, ebitda_currency, ebitda_period, ebitda_basis,
        founded_year, country, notes, sources, profile_at, updated_at)
    values (k, r->>'name', nullif(r->>'website', ''), nullif(r->>'description', ''), nullif(r->>'sector', ''), nullif(r->>'subsector', ''),
        nullif(r->>'business_model', ''), nullif(r->>'email', ''), nullif(r->>'email_type', ''),
        ceo, cfo, coo, md, leaders,
        case when ok_emp then (r->>'employees')::numeric::int end, case when ok_emp then nullif(r->>'employees_text', '') end,
        case when ok_emp then nullif(r->>'employees_as_of', '')::date end,
        case when ok_fin then (r->>'revenue')::numeric end, case when ok_fin then upper(nullif(r->>'revenue_currency', '')) end,
        case when ok_fin then nullif(r->>'revenue_period', '') end,
        case when ok_fin or exists (select 1 from jsonb_array_elements(coalesce(src->'ebitda', '[]')) s where public.source_tier(s->>'kind') in ('primary', 'press')) then (r->>'ebitda')::numeric end,
        upper(nullif(r->>'ebitda_currency', '')), nullif(r->>'ebitda_period', ''), nullif(r->>'ebitda_basis', ''),
        (r->>'founded_year')::int, nullif(r->>'country', ''), nullif(r->>'notes', ''), src, now(), now())
    on conflict (key) do update set
      website = coalesce(excluded.website, pi.website),
      description = coalesce(excluded.description, pi.description),
      sector = coalesce(excluded.sector, pi.sector),
      subsector = coalesce(excluded.subsector, pi.subsector),
      business_model = coalesce(excluded.business_model, pi.business_model),
      email = coalesce(excluded.email, pi.email),
      email_type = case when excluded.email is not null then excluded.email_type else pi.email_type end,
      ceo = coalesce(excluded.ceo, pi.ceo), cfo = coalesce(excluded.cfo, pi.cfo), coo = coalesce(excluded.coo, pi.coo),
      managing_director = coalesce(excluded.managing_director, pi.managing_director),
      leaders = case when jsonb_array_length(excluded.leaders) > 0 then excluded.leaders else pi.leaders end,
      employees = coalesce(excluded.employees, pi.employees),
      employees_text = case when excluded.employees is not null or excluded.employees_text is not null then excluded.employees_text else pi.employees_text end,
      employees_as_of = case when excluded.employees is not null or excluded.employees_text is not null then excluded.employees_as_of else pi.employees_as_of end,
      revenue_stated = coalesce(excluded.revenue_stated, pi.revenue_stated),
      revenue_currency = case when excluded.revenue_stated is not null then excluded.revenue_currency else pi.revenue_currency end,
      revenue_period = case when excluded.revenue_stated is not null then excluded.revenue_period else pi.revenue_period end,
      ebitda_stated = coalesce(excluded.ebitda_stated, pi.ebitda_stated),
      ebitda_currency = case when excluded.ebitda_stated is not null then excluded.ebitda_currency else pi.ebitda_currency end,
      ebitda_period = case when excluded.ebitda_stated is not null then excluded.ebitda_period else pi.ebitda_period end,
      ebitda_basis = case when excluded.ebitda_stated is not null then excluded.ebitda_basis else pi.ebitda_basis end,
      founded_year = coalesce(excluded.founded_year, pi.founded_year),
      country = coalesce(pi.country, excluded.country),
      notes = coalesce(excluded.notes, pi.notes),
      sources = pi.sources || excluded.sources,
      profile_at = now(), updated_at = now();

    if r ? 'holding' and coalesce(r->'holding'->>'sponsor', '') <> '' then
      select id into gp from public.companies where category = 'GP' and name = r->'holding'->>'sponsor'
        order by (source = 'master_directory') desc nulls last, created_at limit 1;
      if gp is not null then
        update public.portfolio_companies p set
          status = coalesce(nullif(r->'holding'->>'status', ''), p.status),
          status_note = coalesce(nullif(r->'holding'->>'status_note', ''), p.status_note),
          asset_class = coalesce(nullif(r->'holding'->>'asset_class', ''), p.asset_class),
          deal_type = coalesce(nullif(r->'holding'->>'deal_type', ''), p.deal_type),
          value_creation_plan = coalesce(nullif(r->'holding'->>'value_creation_plan', ''), p.value_creation_plan),
          value_creation_source_url = coalesce(nullif(r->'holding'->>'value_creation_source_url', ''), p.value_creation_source_url),
          notes = coalesce(nullif(r->'holding'->>'notes', ''), p.notes)
        where p.gp_company_id = gp and p.intel_key = k;
      end if;
    end if;
    n := n + 1;
  end loop;
  insert into ingest.log (what, detail) values ('portco_profile_upsert', jsonb_build_object('rows', n, 'revenue_dropped', dropped));
  return jsonb_build_object('rows', n, 'revenue_dropped', dropped);
end $$;

-- The export, one row per holding, columns as the desk's sheet names them.
-- Revenue and EBITDA prefer a stated figure; else the filed accounts (UK).
create or replace view public.portco_export with (security_invoker = true) as
select
  p.name as "Name",
  initcap(coalesce(p.status, '')) as "Status",
  coalesce(p.status_note, case when p.exit_year is not null then 'Exited ' || p.exit_year end) as "Status Note",
  coalesce(p.asset_class, c.sub_type) as "Class",
  coalesce(p.deal_type, ed.kind_label) as "Deal Type",
  coalesce(pi.sector, p.sector) as "Sector",
  pi.subsector as "Subsector",
  coalesce(pi.country, nullif(btrim(regexp_replace(p.hq, '^.*,', '')), '')) as "Country",
  coalesce(pi.website, case when p.domain is not null then 'https://' || p.domain end) as "Website",
  pi.email as "Email",
  pi.email_type as "Email Type",
  coalesce(pi.description, p.description) as "Description",
  pi.business_model as "Business Model",
  pi.ceo as "CEO",
  pi.cfo as "CFO",
  pi.coo as "COO",
  pi.managing_director as "Managing Director",
  coalesce(pi.employees_text, pi.employees::text) as "Employees",
  coalesce(pi.employees_as_of::text, case when pi.employees is not null and pi.accounts_period_end is not null then pi.accounts_period_end::text end) as "Employees As Of",
  coalesce(pi.revenue_stated, pi.revenue) as "Revenue",
  case when pi.revenue_stated is not null then pi.revenue_currency when pi.revenue is not null then pi.currency end as "Revenue Currency",
  case when pi.revenue_stated is not null then pi.revenue_period when pi.revenue is not null then 'Accounts to ' || pi.accounts_period_end end as "Revenue Period",
  coalesce(pi.ebitda_stated, pi.ebitda_derived) as "EBITDA",
  case when pi.ebitda_stated is not null then pi.ebitda_currency when pi.ebitda_derived is not null then pi.currency end as "EBITDA Currency",
  case when pi.ebitda_stated is not null then concat_ws(' · ', pi.ebitda_period, pi.ebitda_basis)
       when pi.ebitda_derived is not null then 'Accounts to ' || pi.accounts_period_end || ' · derived (operating profit + D&A)' end as "EBITDA Period",
  p.value_creation_plan as "Value Creation Plan",
  concat_ws(' | ', p.notes, pi.notes) as "Notes",
  (select string_agg(distinct u, ' ; ') from (
     select p.source_url u union select p.deal_source_url union select p.value_creation_source_url union select pi.accounts_url
     union select s->>'url' from jsonb_each(coalesce(pi.sources, '{}'::jsonb)) e(f, v), jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else jsonb_build_array(v) end) s
  ) q where u is not null) as "Sources",
  c.name as "Sponsor",
  p.gp_company_id as sponsor_id,
  p.intel_key as company_key
from public.portfolio_companies p
join public.companies c on c.id = p.gp_company_id
left join public.portco_intel pi on pi.key = p.intel_key
left join lateral (
  select case d.kind when 'company_acquisition' then 'Buyout' when 'minority_investment' then 'Minority investment' when 'funding_round' then 'Funding round'
                     when 'add_on_acquisition' then 'Add-on' else initcap(replace(d.kind, '_', ' ')) end as kind_label
  from public.deals d
  where d.target_key = p.intel_key and d.kind in ('company_acquisition', 'minority_investment', 'funding_round') and (d.investor_company_id = p.gp_company_id)
  order by d.date nulls last limit 1
) ed on true;

grant select on public.portco_export to anon, authenticated;
