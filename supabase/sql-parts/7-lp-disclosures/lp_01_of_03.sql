-- lp: part 1 of 3
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- 0019: LP disclosures read by the database -- the fund-by-fund performance
-- pages a public pension publishes, and the fund investments a development
-- finance institution discloses.
--
-- CalPERS publishes every active private equity and private debt partnership
-- as an HTML table (fund, vintage, capital committed, cash in, cash out, cash
-- out and remaining value, net IRR, multiple). That is the LP's own statement
-- of its commitments, so each row becomes a commitment with the performance
-- figures beside it. The database fetches the pages itself (http extension),
-- the same way it reads EDGAR. Idempotent; safe to re-run.

-- --- Performance figures on a commitment -----------------------------------
alter table public.commitments
  add column if not exists asset_class     text,     -- the LP's own programme: private_equity | private_credit | ...
  add column if not exists contributed     numeric,  -- cash in, in `currency`
  add column if not exists distributed     numeric,  -- cash out
  add column if not exists remaining_value numeric,  -- distributions plus reported value
  add column if not exists net_irr         numeric,  -- percent, as the LP states it
  add column if not exists multiple        numeric,  -- investment multiple (TVPI)
  add column if not exists as_of           date;     -- the reporting date the figures carry

create index if not exists commitments_lp_idx on public.commitments (lp_company_id);
create index if not exists commitments_class_idx on public.commitments (asset_class) where asset_class is not null;

-- --- Helpers ----------------------------------------------------------------

create or replace function ingest.strip_tags(p text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(ingest.unxml(regexp_replace(coalesce(p, ''), '<[^>]+>', '', 'g')), '\s+', ' ', 'g')), '');
$$;

create or replace function ingest.money(p text) returns numeric
language sql immutable as $$
  select case when p ~ '[0-9]' and p !~* 'n/[am]' then
    (case when p ~ '^\s*[\(-]' then -1 else 1 end) * nullif(regexp_replace(p, '[^0-9.]', '', 'g'), '')::numeric end;
$$;

create or replace function ingest.pct(p text) returns numeric
language sql immutable as $$
  select case when p ~ '[0-9]' and p !~* 'n/[am]' then
    (case when p ~ '^\s*[\(-]' then -1 else 1 end) * nullif(regexp_replace(p, '[^0-9.]', '', 'g'), '')::numeric end;
$$;

-- A directory firm for a filed or published name, sharper than 0018's: exact
-- name first; then the longest directory name that opens the given name
-- ("Blackstone Real Estate Debt Strategies V" -> Blackstone Real Estate, not
-- Blackstone); then a first word that names exactly one firm, or exactly one
-- manager when several books share it.
-- p_books limits the match to some categories: a fund's manager is a GP, so
-- fund names are matched against managers only ("Lincoln Plaza Fund" must
-- not land on an insurer that happens to be called Lincoln).
drop function if exists ingest.match_firm(text);
create or replace function ingest.match_firm(p_name text, p_books text[] default array['GP', 'SP', 'LP'], out company_id uuid, out method text)
language plpgsql stable as $$
declare w text; n int; q text;
begin
  if p_name is null then return; end if;
  q := lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'));
  select id into company_id from public.companies where lower(name) = q and category::text = any (p_books) limit 1;
  if company_id is not null then method := 'exact'; return; end if;
  -- Longest directory name that is a prefix of the given name, on a word boundary.
  select id into company_id from public.companies
   where length(name) >= 5 and category::text = any (p_books)
     and q like lower(regexp_replace(name, '\s+', ' ', 'g')) || ' %'
   order by length(name) desc limit 1;
  if company_id is not null then method := 'prefix'; return; end if;
  w := lower(split_part(regexp_replace(btrim(p_name), '^(the)\s+', '', 'i'), ' ', 1));
  w := regexp_replace(w, '[^a-z0-9&]', '', 'g');
  if length(w) < 3 or w = any (array['capital','global','private','partners','first','american','north','south','east','west','new','united','general','national','international','credit','equity','real','growth','venture','ventures','fund','funds','investment','investments','strategic','opportunity','opportunities','income','infrastructure','energy','digital','blue','green','black','white','silver','gold','summit','main','alpha','core','prime','crown','eagle','harbor','harbour','lake','river','park','bridge','stone','oak','pine','cedar','maple','atlas','apex','vista','one','two','three','1','2','3']) then
    return;
  end if;
  select count(*), (array_agg(id))[1] into n, company_id
    from public.companies
   where lower(split_part(regexp_replace(name, '^(the)\s+', '', 'i'), ' ', 1)) = w and category::text = any (p_books);
  if n = 1 then method := 'brand'; return; end if;
  if n > 1 and 'GP' = any (p_books) then
    select count(*), (array_agg(id))[1] into n, company_id
      from public.companies
     where lower(split_part(regexp_replace(name, '^(the)\s+', '', 'i'), ' ', 1)) = w and category = 'GP';
    if n = 1 then method := 'brand'; return; end if;
  end if;
  company_id := null;
end $$;

-- A fund record for a fund an LP names: the one already on file under that
-- name, else a new one keyed by the name, linked to the manager the brand
-- names when the directory holds exactly one such firm.
create or replace function ingest.fund_for(p_name text, p_vintage integer, p_class text, out fund_id uuid, out gp_company_id uuid)
language plpgsql as $$
declare m record;
begin
  select id, company_id into fund_id, gp_company_id from public.funds where lower(name) = lower(btrim(p_name)) order by (company_id is not null) desc, created_at limit 1;
  if fund_id is not null then
    if gp_company_id is null then select company_id into gp_company_id from ingest.match_firm(p_name, array['GP']); end if;
    return;
  end if;
  select * into m from ingest.match_firm(p_name, array['GP']);
  gp_company_id := m.company_id;
  insert into public.funds (external_key, name, company_id, vintage_year, strategy, source)
  values ('lpfund:' || md5(lower(btrim(p_name))), btrim(p_name), gp_company_id, p_vintage, p_class, 'lp_disclosure')
  on conflict (external_key) do update set company_id = coalesce(public.funds.company_id, excluded.company_id), vintage_year = coalesce(public.funds.vintage_year, excluded.vintage_year)
  returning id, company_id into fund_id, gp_company_id;
end $$;
