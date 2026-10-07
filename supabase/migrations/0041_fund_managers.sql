-- 0041 — every fund has a manager.
--
-- A fund row without company_id reads "Manager not on file". Almost every
-- such fund names its manager somewhere we already hold: the Form D's
-- related persons (the general partner, the management company, the
-- investment adviser), the fund row's own manager_name, or the LP document
-- that disclosed the commitment (commitments.gp_name). This links each fund
-- to that firm:
--
--   1. the stated name (or the stated name without its vehicle tail —
--      "Mederi Capital GP, LLC" → "Mederi Capital") equals a directory firm
--      or an SEC-roster adviser (firm_key: case, punctuation, legal forms);
--   2. else the longest directory manager name the stated name or the fund's
--      own name opens with ("Blue Owl Real Estate … Fund" → Blue Owl);
--   3. else the stated firm becomes a GP record of its own, sourced to the
--      filing or LP document that names it.
--
-- Service providers a filing lists (administrators, custodians, auditors,
-- counsel, placement agents) are never taken for the manager. Every link is
-- kept in ingest.fund_manager_links with its method, the name it read and
-- the page that states it, so any one can be audited or undone. Funds whose
-- documents name only individuals stay unlinked here; they are listed by
-- ingest.funds_without_manager for research.
--
-- Run: call ingest.link_fund_managers();  (idempotent; commits per step, so
-- schedule it with pg_cron rather than inside the API's statement limit.
-- The cron role's own statement limit covers the whole CALL, so a run that
-- hits it resumes with call ingest.link_fund_managers(n) from step n:
-- 1 candidates, 2 name tables, 3 name/stem, 4 roster, 5 prefix, 6 created,
-- 7 write.)

create table if not exists ingest.fund_manager_links (
  fund_id uuid primary key,
  company_id uuid not null,
  method text not null,      -- name | stem | roster | prefix | fund_prefix | created
  stated_name text,
  source text,               -- commitment_gp | fund_manager_name | form_d_related
  source_url text,
  linked_at timestamptz not null default now()
);

-- The firm a vehicle's name points at: legal form, fund number and the
-- GP/manager tail removed. Used to name a created firm and to match.
create or replace function ingest.fm_stem(p text) returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    coalesce(p, ''),
    '[,.]?\s+(llc|l\.l\.c\.?|lp|l\.p\.?|llp|ltd\.?|limited|inc\.?|s\.?a\.?r\.?l\.?|gmbh|plc|pty)\s*$', '', 'i'),
    '[,.]?\s+(llc|l\.l\.c\.?|lp|l\.p\.?|llp|ltd\.?|limited|inc\.?|s\.?a\.?r\.?l\.?|gmbh|plc|pty)\s*$', '', 'i'),
    '\s+((fund|funds)\s+)?([ivxlc]+|\d+)?\s*,?\s*(gp|g\.p\.|general partner|ultimate general partner)(\s+(i|ii|iii|iv|v|vi|\d+))?\s*$', '', 'i'),
    '[\s,\-]+$', '')), '')
$$;

-- The brand a manager entity trades as, for matching only: the stem with a
-- trailing "Management", "Advisors", "Capital Management", "Investment
-- Management", "Asset Management", "Partners" or "Company" removed.
create or replace function ingest.fm_brand(p text) returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(ingest.fm_stem(p),
    '\s+((capital|investment|asset|fund|investment fund|portfolio|wealth)\s+)?(management|managers?|advisors|advisers|advisory|partners|company|co\.?|group)(\s+(company|co\.?|group))?\s*$', '', 'i')), '')
$$;

drop procedure if exists ingest.link_fund_managers();
create or replace procedure ingest.link_fund_managers(p_from int default 1)
language plpgsql as $$
declare n_name int; n_stem int; n_roster int; n_prefix int; n_created int; n_left int;
  stop text[] := array['capital','global','private','partners','first','american','north','south','east','west','new','united','general','national','international','credit','equity','real','growth','venture','ventures','fund','funds','investment','investments','strategic','opportunity','opportunities','income','infrastructure','energy','digital','blue','green','black','white','silver','gold','summit','main','alpha','core','prime','crown','eagle','harbor','harbour','lake','river','park','bridge','stone','oak','pine','cedar','maple','atlas','apex','vista','one','two','three','the','series','spv','co','management','asset','assets','family','select','special','senior','secured','direct','diversified','opportunistic','value','partners','holdings','group','master','feeder','offshore','onshore','parallel','access','select'];
begin

  -- 1. What each manager-less fund's documents name.
  if p_from <= 1 then
  drop table if exists ingest.fm_cand;
  create table ingest.fm_cand (fund_id uuid, cand text, rnk int, src text, source_url text, key text, skey text, bkey text);
  insert into ingest.fm_cand (fund_id, cand, rnk, src, source_url)
  select c.fund_id, c.gp_name, 0, 'commitment_gp', c.source_url
    from public.commitments c join public.funds f on f.id = c.fund_id
   where f.company_id is null and nullif(btrim(c.gp_name), '') is not null;
  insert into ingest.fm_cand (fund_id, cand, rnk, src, source_url)
  select f.id, f.manager_name, 2, 'fund_manager_name', f.source_url
    from public.funds f where f.company_id is null and nullif(btrim(f.manager_name), '') is not null;
  insert into ingest.fm_cand (fund_id, cand, rnk, src, source_url)
  select fund_id, cand,
         case when clar ~* 'investment (manager|advis)|management co|advis[eo]r|sponsor' then 1
              when clar ~* 'general partner|managing member|manager' then 2 else 3 end,
         'form_d_related', source_url
    from (select o.fund_id, o.source_url, coalesce(e->>'clarification', '') clar,
                 btrim(regexp_replace(e->>'name', '^(\s*(-+|n/?a)\s*)+', '', 'i')) cand
            from public.fund_offerings o join public.funds f on f.id = o.fund_id and f.company_id is null
            cross join lateral jsonb_array_elements(case when jsonb_typeof(o.related_persons) = 'array' then o.related_persons else '[]'::jsonb end) e) x
   where cand ~* '\m(llc|l\.l\.c|lp|l\.p|llp|ltd|limited|inc|corp|corporation|company|management|capital|partners|advisors|advisers|gp|group|trust|sarl|gmbh|ag|plc|holdings|ventures|investments|s\.a)\M'
     and clar !~* 'administrat|custodian|auditor|counsel|placement|broker|transfer agent|distributor|depositary|director of the|trustee of';
  delete from ingest.fm_cand where cand is null or length(btrim(cand)) < 3;
  update ingest.fm_cand set key = public.firm_key(cand), skey = public.firm_key(ingest.fm_stem(cand)), bkey = public.firm_key(ingest.fm_brand(cand));
  create index on ingest.fm_cand (fund_id);
  commit;
  end if;

  -- 2. Every name a directory firm or roster adviser goes by.
  if p_from <= 2 then
  drop table if exists ingest.fm_dir;
  create table ingest.fm_dir as
  select distinct on (key) key, company_id from (
    select public.firm_key(name) key, id company_id, case category::text when 'GP' then 0 when 'SP' then 2 when 'LP' then 3 else 1 end r from public.companies
    union all
    select public.firm_key(name), company_id, 1 from public.adv_advisers where company_id is not null
    union all
    select public.firm_key(legal_name), company_id, 1 from public.adv_advisers where company_id is not null and legal_name is not null
  ) d where length(key) >= 3 order by key, r;
  create unique index on ingest.fm_dir (key);
  drop table if exists ingest.fm_gpdir;
  create table ingest.fm_gpdir as
  select distinct on (public.firm_key(name)) public.firm_key(name) key, id company_id
    from public.companies where category = 'GP' and length(public.firm_key(name)) >= 4 order by public.firm_key(name), (sec_crd is null);
  create unique index on ingest.fm_gpdir (key);
  drop table if exists ingest.fm_pick;
  create table ingest.fm_pick (fund_id uuid primary key, company_id uuid, method text, cand text, src text, source_url text);
  drop table if exists ingest.fm_advkey;
  create table ingest.fm_advkey as
  select public.firm_key(name) key, crd, private_fund_gav gav from public.adv_advisers where company_id is null
  union
  select public.firm_key(legal_name), crd, private_fund_gav from public.adv_advisers where company_id is null and legal_name is not null;
  create index on ingest.fm_advkey (key);
  commit;
  end if;

  -- 3a. The stated name is a firm we hold.
  if p_from <= 3 then
  truncate ingest.fm_pick;
  insert into ingest.fm_pick
  select distinct on (c.fund_id) c.fund_id, d.company_id, 'name', c.cand, c.src, c.source_url
    from ingest.fm_cand c join ingest.fm_dir d on d.key = c.key
   order by c.fund_id, c.rnk;
  get diagnostics n_name = row_count;
  -- 3b. … once its vehicle tail ("Fund II GP, LLC") or trading tail ("Management") is off.
  insert into ingest.fm_pick
  select distinct on (c.fund_id) c.fund_id, d.company_id, 'stem', c.cand, c.src, c.source_url
    from ingest.fm_cand c join ingest.fm_dir d on d.key in (c.skey, c.bkey)
   where length(d.key) >= 4 and not (d.key = any (stop))
     and not exists (select 1 from ingest.fm_pick p where p.fund_id = c.fund_id)
   order by c.fund_id, c.rnk;
  get diagnostics n_stem = row_count;
  commit;
  end if;

  -- 3c. An SEC-registered or exempt reporting adviser not yet in the
  -- directory: promote it from the roster (same record promote_advisers makes).
  if p_from <= 4 then
  drop table if exists ingest.fm_adv;
  create table ingest.fm_adv as
  select distinct on (c.fund_id) c.fund_id, a.crd, c.cand, c.src, c.source_url
    from (select fund_id, cand, src, source_url, rnk, key k from ingest.fm_cand
          union all
          select fund_id, cand, src, source_url, rnk, skey from ingest.fm_cand where skey is distinct from key) c
    join ingest.fm_advkey a on a.key = c.k and length(c.k) >= 4
   where not exists (select 1 from ingest.fm_pick p where p.fund_id = c.fund_id)
   order by c.fund_id, c.rnk, a.gav desc nulls last;
  insert into public.companies (name, category, sub_type, website, domain, city, state, country, source, sec_crd, external_ids, adv_firm_type, adv_last_filed,
    adv_employee_count, private_fund_count, private_fund_gross_assets, regulatory_aum_usd, adv_source_url, description)
  select ingest.nice_name(a.name), 'GP', ingest.adviser_type(a),
         nullif(lower(a.website), ''),
         nullif(regexp_replace(lower(coalesce(a.website, '')), '^https?://(www\.)?([^/]+).*$', '\2'), ''),
         ingest.nice_name(a.city), a.state, a.country, 'form_adv_roster', a.crd, array['crd:' || a.crd],
         case when a.firm_type = 'ERA' then 'ERA' else 'Registered' end, a.filed,
         a.employees, a.private_fund_count, a.private_fund_gav, a.regulatory_aum,
         'https://adviserinfo.sec.gov/firm/summary/' || a.crd,
         format('%s adviser%s, per Form ADV (%s).',
                case when a.firm_type = 'ERA' then 'Exempt reporting' else 'SEC-registered' end,
                case when a.private_fund_count > 0 then format(' to %s private fund%s', a.private_fund_count, case when a.private_fund_count = 1 then '' else 's' end) else '' end,
                to_char(a.filed, 'Mon YYYY'))
    from public.adv_advisers a where a.crd in (select distinct crd from ingest.fm_adv) and a.company_id is null;
  update public.adv_advisers a set company_id = c.id
    from public.companies c where c.sec_crd = a.crd and c.source = 'form_adv_roster' and a.company_id is null and a.crd in (select crd from ingest.fm_adv);
  insert into ingest.fm_pick
  select f.fund_id, a.company_id, 'roster', f.cand, f.src, f.source_url
    from ingest.fm_adv f join public.adv_advisers a on a.crd = f.crd where a.company_id is not null
  on conflict (fund_id) do nothing;
  get diagnostics n_roster = row_count;
  commit;
  end if;

  -- 3d. The longest directory manager whose name opens the stated name, then
  -- the fund's own name ("Blue Owl Real Estate Net Lease … Fund" → Blue Owl).
  -- A one-word manager name counts only when it is not a common word.
  if p_from <= 5 then
  drop table if exists ingest.fm_pref;
  create table ingest.fm_pref as
  select x.fund_id, x.cand, x.src, x.source_url, x.rnk, public.firm_key(array_to_string(w[1:k], ' ')) key, k
    from (select fund_id, cand, src, source_url, rnk, regexp_split_to_array(btrim(regexp_replace(cand, '[,()]', ' ', 'g')), '\s+') w
            from ingest.fm_cand c where not exists (select 1 from ingest.fm_pick p where p.fund_id = c.fund_id)
          union all
          select f.id, f.name, 'fund_name', f.source_url, 5, regexp_split_to_array(btrim(regexp_replace(f.name, '[,()]', ' ', 'g')), '\s+')
            from public.funds f where f.company_id is null and not exists (select 1 from ingest.fm_pick p where p.fund_id = f.id)) x
    cross join lateral generate_series(1, least(array_length(x.w, 1) - 1, 6)) k;
  insert into ingest.fm_pick
  select distinct on (p.fund_id) p.fund_id, g.company_id, case when p.src = 'fund_name' then 'fund_prefix' else 'prefix' end, p.cand, p.src, p.source_url
    from ingest.fm_pref p join ingest.fm_gpdir g on g.key = p.key
   where (p.k > 1 or not (p.key = any (stop))) and length(p.key) >= 4
     and not exists (select 1 from ingest.fm_pick q where q.fund_id = p.fund_id)
   order by p.fund_id, p.rnk, p.k desc;
  get diagnostics n_prefix = row_count;
  commit;
  end if;

  -- 4. The stated firm is new to us: a GP record named as the filing or LP
  -- document names it (vehicle tail off), one per firm across all its funds.
  if p_from <= 6 then
  drop table if exists ingest.fm_new;
  create table ingest.fm_new as
  select distinct on (c.fund_id) c.fund_id, c.cand, c.src, c.source_url,
         coalesce(ingest.fm_stem(c.cand), c.cand) firm_name,
         public.firm_key(coalesce(ingest.fm_stem(c.cand), c.cand)) key
    from ingest.fm_cand c
   where not exists (select 1 from ingest.fm_pick p where p.fund_id = c.fund_id)
     and c.cand !~* '^(n/?a|none|not applicable|see )'
   order by c.fund_id, c.rnk, length(c.cand);
  delete from ingest.fm_new where length(key) < 3;
  insert into public.companies (name, category, source, sources, description, external_ids)
  select distinct on (n.key) ingest.nice_name(n.firm_name), 'GP',
         case when n.src = 'commitment_gp' then 'lp_disclosure' else 'sec_form_d' end,
         jsonb_build_array(jsonb_build_object('url', n.source_url, 'label',
           case when n.src = 'commitment_gp' then 'Named as the fund''s manager in an LP''s published commitments' else 'Named as manager or general partner in the fund''s Form D' end)),
         format('Manager of %s, as %s names it.', f.name, case when n.src = 'commitment_gp' then 'an LP''s published commitment list' else 'the fund''s SEC Form D' end),
         array['fundmgr:' || n.key]
    from ingest.fm_new n join public.funds f on f.id = n.fund_id
   where not exists (select 1 from ingest.fm_dir d where d.key = n.key)
     and not exists (select 1 from public.companies c where 'fundmgr:' || n.key = any (c.external_ids))
   order by n.key, (n.src = 'commitment_gp') desc;
  insert into ingest.fm_pick
  select n.fund_id, coalesce(d.company_id, c.id), 'created', n.cand, n.src, n.source_url
    from ingest.fm_new n
    left join ingest.fm_dir d on d.key = n.key
    left join public.companies c on d.key is null and ('fundmgr:' || n.key) = any (c.external_ids)
   where coalesce(d.company_id, c.id) is not null
  on conflict (fund_id) do nothing;
  get diagnostics n_created = row_count;
  commit;
  end if;

  -- 5. Write the links: the fund, its filings, and the commitments into it.
  update public.funds f set company_id = p.company_id, manager_name = coalesce(f.manager_name, p.cand)
    from ingest.fm_pick p where p.fund_id = f.id and f.company_id is null;
  update public.fund_offerings o set gp_company_id = p.company_id, gp_match = coalesce(o.gp_match, 'fund_manager:' || p.method)
    from ingest.fm_pick p where p.fund_id = o.fund_id and o.gp_company_id is null;
  update public.commitments c set gp_company_id = f.company_id
    from public.funds f where f.id = c.fund_id and c.gp_company_id is null and f.company_id is not null;
  insert into ingest.fund_manager_links (fund_id, company_id, method, stated_name, source, source_url)
  select fund_id, company_id, method, cand, src, source_url from ingest.fm_pick
  on conflict (fund_id) do update set company_id = excluded.company_id, method = excluded.method, stated_name = excluded.stated_name,
    source = excluded.source, source_url = excluded.source_url, linked_at = now();
  select count(*) into n_left from public.funds where company_id is null;
  insert into ingest.log (what, detail) values ('link_fund_managers', jsonb_build_object(
    'name', n_name, 'stem', n_stem, 'roster', n_roster, 'prefix', n_prefix, 'created', n_created, 'left', n_left));
  commit;
  drop table if exists ingest.fm_pref;
  drop table if exists ingest.fm_adv;
  commit;
end $$;

-- Funds still without a manager: their documents name only individuals (or
-- nothing), so the manager has to be read from somewhere else.
create or replace view ingest.funds_without_manager as
select f.id, f.name, f.source, f.vintage_year, f.fund_size_usd, f.source_url,
       (select count(*) from public.commitments c where c.fund_id = f.id) commitments
  from public.funds f where f.company_id is null;
