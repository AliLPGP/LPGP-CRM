-- 0041 — every fund has a manager.
--
-- A fund row without company_id reads "Manager not on file". Almost every
-- such fund names its manager somewhere we already hold: the Form D's
-- related persons (the general partner, the management company, the
-- investment adviser), the fund row's own manager_name, or the LP document
-- that disclosed the commitment (commitments.gp_name). This links each fund
-- to that firm:
--
--   0. the same fund already linked under another filing or an LP's list,
--      or a GP entity that also files for a manager we hold;
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
-- the page that states it, so any one can be audited or undone. A person's
-- name never becomes a firm: funds whose documents name only individuals
-- stay unlinked here, listed by ingest.funds_without_manager for research.
--
-- Run: call ingest.link_fund_managers();  (idempotent; commits per step, so
-- schedule it with pg_cron rather than inside the API's statement limit.
-- The cron role's statement limit covers a whole CALL, so on a large backlog
-- run it in slices with call ingest.link_fund_managers(from, to): 1 what the
-- documents name, 2 directory names, 3 what linked funds say, 4 name picks,
-- 5 roster, 6 prefix, 7 created firms, 8 write.)

create table if not exists ingest.fund_manager_links (
  fund_id uuid primary key,
  company_id uuid not null,
  method text not null,      -- same_fund | name | sibling | stem | roster | prefix | fund_prefix | created
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
drop procedure if exists ingest.link_fund_managers(int);
create or replace procedure ingest.link_fund_managers(p_from int default 1, p_to int default 99)
language plpgsql as $$
declare n int; stats jsonb := '{}';
  ent text := '\m(llc|l\.l\.c|lp|l\.p|llp|ltd|limited|inc|corp|corporation|company|management|capital|partners|advisors|advisers|gp|genpar|group|trust|sarl|s\.a\.r\.l|sas|gmbh|ag|plc|holdings|ventures|investments|asset|associates|s\.a|bv|b\.v|ab|as|kg|nv|pte|pty|fund)\M';
  stop text[] := array['capital','global','private','partners','first','american','north','south','east','west','new','united','general','national','international','credit','equity','real','growth','venture','ventures','fund','funds','investment','investments','strategic','opportunity','opportunities','income','infrastructure','energy','digital','blue','green','black','white','silver','gold','summit','main','alpha','core','prime','crown','eagle','harbor','harbour','lake','river','park','bridge','stone','oak','pine','cedar','maple','atlas','apex','vista','one','two','three','the','series','spv','co','management','asset','assets','family','select','special','senior','secured','direct','diversified','opportunistic','value','holdings','group','master','feeder','offshore','onshore','parallel','access'];
begin
  -- 1. What each manager-less fund's documents name. A name with no
  -- firm word ("Jane Smith") is a person: it may match a firm we hold,
  -- but never becomes one.
  if p_from <= 1 and p_to >= 1 then
  drop table if exists ingest.fm_cand;
  create table ingest.fm_cand (fund_id uuid, cand text, rnk int, src text, source_url text, is_firm boolean, key text, skey text, bkey text);
  insert into ingest.fm_cand (fund_id, cand, rnk, src, source_url, is_firm)
  select c.fund_id, c.gp_name, 0, 'commitment_gp', c.source_url, true
    from public.commitments c join public.funds f on f.id = c.fund_id
   where f.company_id is null and nullif(btrim(c.gp_name), '') is not null;
  insert into ingest.fm_cand (fund_id, cand, rnk, src, source_url, is_firm)
  select f.id, f.manager_name, 2, 'fund_manager_name', f.source_url, f.manager_name ~* ent
    from public.funds f where f.company_id is null and nullif(btrim(f.manager_name), '') is not null;
  insert into ingest.fm_cand (fund_id, cand, rnk, src, source_url, is_firm)
  select fund_id, cand,
         case when clar ~* 'investment (manager|advis)|management co|advis[eo]r|sponsor' then 1
              when clar ~* 'general partner|managing member|manager' then 2 else 3 end,
         'form_d_related', source_url, true
    from (select o.fund_id, o.source_url, coalesce(e->>'clarification', '') clar, e->>'name' cand
            from public.fund_offerings o join public.funds f on f.id = o.fund_id and f.company_id is null
            cross join lateral jsonb_array_elements(case when jsonb_typeof(o.related_persons) = 'array' then o.related_persons else '[]'::jsonb end) e) x
   where cand ~* ent
     and clar !~* 'administrat|custodian|auditor|counsel|placement|broker|transfer agent|distributor|depositary|director of the|trustee of';
  -- Filers' fillers before the name: "- ", "n/a ", "[none] ", a stray "LLC ".
  update ingest.fm_cand set cand = btrim(regexp_replace(cand, '^(\s*(-+|n/?a|\[none\]|none|llc|l\.l\.c\.|lp|inc\.?)\s+)+', '', 'i'));
  delete from ingest.fm_cand where cand is null or length(btrim(cand)) < 3 or cand ~* '^(n/?a|none|not applicable|see )';
  update ingest.fm_cand set key = public.firm_key(cand), skey = public.firm_key(ingest.fm_stem(cand)), bkey = public.firm_key(ingest.fm_brand(cand));
  create index on ingest.fm_cand (fund_id);
  commit;
  end if;

  -- 2. Every name a directory firm or roster adviser goes by.
  if p_from <= 2 and p_to >= 2 then
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
  drop table if exists ingest.fm_advkey;
  create table ingest.fm_advkey as
  select public.firm_key(name) key, crd, private_fund_gav gav from public.adv_advisers where company_id is null
  union
  select public.firm_key(legal_name), crd, private_fund_gav from public.adv_advisers where company_id is null and legal_name is not null;
  create index on ingest.fm_advkey (key);
  commit;
  end if;

  -- 3. What linked funds already tell us: a fund's name (the same fund filed
  -- again, or listed by an LP, under a manager we hold) and the GP entities
  -- its filings name ("Ares CIP Management II LLC" files for Ares funds).
  -- A key counts only when every linked fund carrying it has one manager.
  if p_from <= 3 and p_to >= 3 then
  drop table if exists ingest.fm_fundkey;
  create table ingest.fm_fundkey as
  select key, min(company_id::text)::uuid company_id from (
    select public.firm_key(name) key, company_id from public.funds where company_id is not null
  ) x where length(key) >= 8 group by key having count(distinct company_id) = 1;
  create unique index on ingest.fm_fundkey (key);
  drop table if exists ingest.fm_sib;
  create table ingest.fm_sib as
  select key, min(company_id::text)::uuid company_id from (
    select public.firm_key(btrim(regexp_replace(e->>'name', '^(\s*(-+|n/?a|\[none\])\s*)+', '', 'i'))) key, f.company_id
      from public.fund_offerings o join public.funds f on f.id = o.fund_id and f.company_id is not null
      cross join lateral jsonb_array_elements(case when jsonb_typeof(o.related_persons) = 'array' then o.related_persons else '[]'::jsonb end) e
     where (e->>'name') ~* ent and coalesce(e->>'clarification', '') !~* 'administrat|custodian|auditor|counsel|placement|broker|transfer agent|distributor|depositary|director of the|trustee of'
    union all
    select public.firm_key(manager_name), company_id from public.funds where company_id is not null and manager_name ~* ent
  ) x where length(key) >= 6 group by key having count(distinct company_id) = 1;
  create unique index on ingest.fm_sib (key);
  commit;
  end if;

  -- 4. Picks that rest on a name we hold.
  if p_from <= 4 and p_to >= 4 then
  drop table if exists ingest.fm_pick;
  create table ingest.fm_pick (fund_id uuid primary key, company_id uuid, method text, cand text, src text, source_url text);
  -- 4a. The same fund, already linked under another filing or LP list.
  insert into ingest.fm_pick
  select f.id, k.company_id, 'same_fund', f.name, 'fund_name', f.source_url
    from public.funds f join ingest.fm_fundkey k on k.key = public.firm_key(f.name) where f.company_id is null;
  get diagnostics n = row_count; stats := stats || jsonb_build_object('same_fund', n);
  -- 4b. The stated name is a firm we hold.
  insert into ingest.fm_pick
  select distinct on (c.fund_id) c.fund_id, d.company_id, 'name', c.cand, c.src, c.source_url
    from ingest.fm_cand c join ingest.fm_dir d on d.key = c.key
   where not exists (select 1 from ingest.fm_pick p where p.fund_id = c.fund_id)
   order by c.fund_id, c.rnk;
  get diagnostics n = row_count; stats := stats || jsonb_build_object('name', n);
  -- 4c. The stated GP entity also files for funds of a manager we hold.
  insert into ingest.fm_pick
  select distinct on (c.fund_id) c.fund_id, s.company_id, 'sibling', c.cand, c.src, c.source_url
    from ingest.fm_cand c join ingest.fm_sib s on s.key = c.key
   where length(coalesce(c.skey, '')) >= 4 and not (c.skey = any (stop))  -- not a bare "Fund GP, LLC"
     and not exists (select 1 from ingest.fm_pick p where p.fund_id = c.fund_id)
   order by c.fund_id, c.rnk;
  get diagnostics n = row_count; stats := stats || jsonb_build_object('sibling', n);
  -- 4d. … once its vehicle tail ("Fund II GP, LLC") or trading tail ("Management") is off.
  insert into ingest.fm_pick
  select distinct on (c.fund_id) c.fund_id, d.company_id, 'stem', c.cand, c.src, c.source_url
    from ingest.fm_cand c join ingest.fm_dir d on d.key in (c.skey, c.bkey)
   where length(d.key) >= 4 and not (d.key = any (stop))
     and not exists (select 1 from ingest.fm_pick p where p.fund_id = c.fund_id)
   order by c.fund_id, c.rnk;
  get diagnostics n = row_count; stats := stats || jsonb_build_object('stem', n);
  commit;
  end if;

  -- 5. An SEC-registered or exempt reporting adviser not yet in the
  -- directory: promote it from the roster (same record promote_advisers makes).
  if p_from <= 5 and p_to >= 5 then
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
  get diagnostics n = row_count; stats := stats || jsonb_build_object('roster', n);
  commit;
  end if;

  -- 6. The longest directory manager whose name opens the stated name, then
  -- the fund's own name ("Blue Owl Real Estate Net Lease … Fund" → Blue Owl).
  -- A one-word manager name counts only when it is not a common word, and
  -- off the fund's own title only when its filing names nobody.
  if p_from <= 6 and p_to >= 6 then
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
     and (p.k > 1 or p.src <> 'fund_name' or not exists (select 1 from ingest.fm_cand c where c.fund_id = p.fund_id))
     and not exists (select 1 from ingest.fm_pick q where q.fund_id = p.fund_id)
   order by p.fund_id, p.rnk, p.k desc;
  get diagnostics n = row_count; stats := stats || jsonb_build_object('prefix', n);
  commit;
  end if;

  -- 7. The stated firm is new to us: a GP record named as the filing or LP
  -- document names it (vehicle tail off), one per firm across all its funds.
  -- A person is never made a firm.
  if p_from <= 7 and p_to >= 7 then
  drop table if exists ingest.fm_new;
  create table ingest.fm_new as
  select distinct on (c.fund_id) c.fund_id, c.cand, c.src, c.source_url,
         coalesce(ingest.fm_stem(c.cand), c.cand) firm_name,
         public.firm_key(coalesce(ingest.fm_stem(c.cand), c.cand)) key
    from ingest.fm_cand c
   where c.is_firm and not exists (select 1 from ingest.fm_pick p where p.fund_id = c.fund_id)
   order by c.fund_id, c.rnk, length(c.cand);
  delete from ingest.fm_new where length(key) < 3 or key = any (stop);
  create index on ingest.fm_new (key);
  drop table if exists ingest.fm_mgr;
  create table ingest.fm_mgr as
  select e eid, id from public.companies, unnest(external_ids) e where e like 'fundmgr:%';
  create index on ingest.fm_mgr (eid);
  insert into public.companies (name, category, source, sources, description, external_ids)
  select distinct on (n.key) ingest.nice_name(n.firm_name), 'GP',
         case when n.src = 'commitment_gp' then 'lp_disclosure' else 'sec_form_d' end,
         jsonb_build_array(jsonb_build_object('url', n.source_url, 'label',
           case when n.src = 'commitment_gp' then 'Named as the fund''s manager in an LP''s published commitments' else 'Named as manager or general partner in the fund''s Form D' end)),
         format('Manager of %s, as %s names it.', f.name, case when n.src = 'commitment_gp' then 'an LP''s published commitment list' else 'the fund''s SEC Form D' end),
         array['fundmgr:' || n.key]
    from ingest.fm_new n join public.funds f on f.id = n.fund_id
   where not exists (select 1 from ingest.fm_dir d where d.key = n.key)
     and not exists (select 1 from ingest.fm_mgr m where m.eid = 'fundmgr:' || n.key)
   order by n.key, (n.src = 'commitment_gp') desc;
  insert into ingest.fm_mgr
  select e, id from public.companies, unnest(external_ids) e
   where e like 'fundmgr:%' and created_at > now() - interval '1 minute' and not exists (select 1 from ingest.fm_mgr m where m.eid = e);
  insert into ingest.fm_pick
  select n.fund_id, coalesce(d.company_id, c.id), 'created', n.cand, n.src, n.source_url
    from ingest.fm_new n
    left join ingest.fm_dir d on d.key = n.key
    left join ingest.fm_mgr c on d.key is null and c.eid = 'fundmgr:' || n.key
   where coalesce(d.company_id, c.id) is not null
  on conflict (fund_id) do nothing;
  get diagnostics n = row_count; stats := stats || jsonb_build_object('created', n);
  commit;
  end if;

  -- 8. Write the links: the fund, its filings, and the commitments into it.
  if p_from <= 8 and p_to >= 8 then
  update public.funds f set company_id = p.company_id, manager_name = coalesce(f.manager_name, p.cand)
    from ingest.fm_pick p where p.fund_id = f.id and f.company_id is null;
  update public.fund_offerings o set gp_company_id = p.company_id, gp_match = coalesce(o.gp_match, 'fund_manager:' || p.method)
    from ingest.fm_pick p where p.fund_id = o.fund_id and o.gp_company_id is null;
  update public.commitments c set gp_company_id = f.company_id
    from public.funds f where f.id = c.fund_id and c.gp_company_id is null and f.company_id is not null;
  insert into ingest.fund_manager_links (fund_id, company_id, method, stated_name, source, source_url)
  select p.fund_id, p.company_id, p.method, p.cand, p.src, p.source_url
    from ingest.fm_pick p join public.funds f on f.id = p.fund_id and f.company_id = p.company_id
  on conflict (fund_id) do update set company_id = excluded.company_id, method = excluded.method, stated_name = excluded.stated_name,
    source = excluded.source, source_url = excluded.source_url, linked_at = now();
  select count(*) into n from public.funds where company_id is null;
  stats := stats || jsonb_build_object('left', n);
  -- A pick table is spent once written; a later run starts from step 1.
  drop table if exists ingest.fm_pick;
  drop table if exists ingest.fm_pref;
  drop table if exists ingest.fm_adv;
  drop table if exists ingest.fm_mgr;
  commit;
  end if;
  insert into ingest.log (what, detail) values ('link_fund_managers', stats || jsonb_build_object('from', p_from, 'to', p_to));
  commit;
end $$;

-- Undo every link this procedure made by creating a firm, and the firms it
-- created, so a better pass can relink those funds.
create or replace procedure ingest.unlink_created_fund_managers()
language plpgsql as $$
begin
  drop table if exists ingest.fm_undo;
  create table ingest.fm_undo as
  select id from public.companies where exists (select 1 from unnest(external_ids) e where e like 'fundmgr:%');
  create unique index on ingest.fm_undo (id);
  update public.funds f set company_id = null from ingest.fm_undo u where f.company_id = u.id;
  update public.fund_offerings o set gp_company_id = null, gp_match = null from ingest.fm_undo u where o.gp_company_id = u.id;
  update public.commitments c set gp_company_id = null from ingest.fm_undo u where c.gp_company_id = u.id;
  delete from ingest.fund_manager_links l using ingest.fm_undo u where l.company_id = u.id;
  commit;
  delete from public.companies c using ingest.fm_undo u where c.id = u.id;
  commit;
end $$;

-- One slice per pg_cron tick, so no CALL meets the cron role's statement
-- limit: set ingest.fund_manager_run.step to 1 (or 0 to first undo the
-- created firms) and schedule 'call ingest.fund_manager_step()' every
-- minute; it idles once the step passes 8.
create table if not exists ingest.fund_manager_run (step int not null);
insert into ingest.fund_manager_run (step) select 99 where not exists (select 1 from ingest.fund_manager_run);

create or replace procedure ingest.fund_manager_step()
language plpgsql as $$
declare s int;
begin
  select step into s from ingest.fund_manager_run limit 1;
  if s is null or s > 8 then return; end if;
  if s = 0 then call ingest.unlink_created_fund_managers(); else call ingest.link_fund_managers(s, s); end if;
  update ingest.fund_manager_run set step = s + 1;
  commit;
end $$;

-- Deleting or merging a company checks every credit position for it.
create index if not exists credit_positions_borrower_company_idx on public.credit_positions (borrower_company_id) where borrower_company_id is not null;

-- Funds still without a manager: their documents name only individuals (or
-- nothing), so the manager has to be read from somewhere else.
create or replace view ingest.funds_without_manager as
select f.id, f.name, f.source, f.vintage_year, f.fund_size_usd, f.source_url,
       (select count(*) from public.commitments c where c.fund_id = f.id) commitments
  from public.funds f where f.company_id is null;
