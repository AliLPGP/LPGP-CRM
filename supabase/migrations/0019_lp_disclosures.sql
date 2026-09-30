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
  select id into company_id from public.companies where lower(name) = q and category = any (p_books) limit 1;
  if company_id is not null then method := 'exact'; return; end if;
  -- Longest directory name that is a prefix of the given name, on a word boundary.
  select id into company_id from public.companies
   where length(name) >= 5 and category = any (p_books)
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
   where lower(split_part(regexp_replace(name, '^(the)\s+', '', 'i'), ' ', 1)) = w and category = any (p_books);
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

-- --- CalPERS ----------------------------------------------------------------

-- p_program: 'pe' (Private Equity Program) or 'pd' (Private Debt Program).
create or replace function ingest.load_calpers(p_program text) returns jsonb
language plpgsql as $$
declare
  v_url text; v_class text; v_lp uuid; v_html text; v_asof date; piece text; cells text[]; n int := 0; f record;
  v_fund text; v_vintage int; v_key text;
begin
  v_url := case p_program
    when 'pe' then 'https://www.calpers.ca.gov/investments/about-investment-office/investment-organization/pep-fund-performance'
    when 'pd' then 'https://www.calpers.ca.gov/investments/about-investment-office/investment-organization/private-debt-performance'
    else null end;
  if v_url is null then raise exception 'unknown CalPERS programme %', p_program; end if;
  v_class := case p_program when 'pe' then 'private_equity' else 'private_credit' end;
  select id into v_lp from public.companies where lower(name) = 'calpers' or lower(name) like 'california public employees%' order by (lower(name) = 'calpers') desc limit 1;
  if v_lp is null then
    insert into public.companies (name, category, investor_type, country, website, source) values ('CalPERS', 'LP', 'Public Pension Fund', 'United States', 'https://www.calpers.ca.gov', 'lp_disclosure') returning id into v_lp;
  end if;

  v_html := ingest.http_text(v_url || '?FWAction=printfunds');
  v_asof := (regexp_match(v_html, 'as of ([A-Z][a-z]+ \d{1,2}, \d{4})'))[1]::date;

  for piece in select p from regexp_split_to_table(v_html, '<tr') p loop
    continue when position('headers="Fund' in piece) = 0 or position('</tr>' in piece) = 0;
    piece := left(piece, position('</tr>' in piece));
    -- Each split piece starts with the td's own attributes: drop up to its '>'.
    select array_agg(ingest.strip_tags(left(substr(c, position('>' in c) + 1), coalesce(nullif(position('</td>' in substr(c, position('>' in c) + 1)), 0) - 1, length(c)))) order by o)
      into cells
      from regexp_split_to_table(piece, '<td') with ordinality as t(c, o) where o > 1 and position('>' in c) > 0;
    continue when cells is null or array_length(cells, 1) < 8 or cells[1] is null;
    v_fund := cells[1];
    v_vintage := nullif(regexp_replace(coalesce(cells[2], ''), '[^0-9]', '', 'g'), '')::int;
    v_key := 'lp:calpers-' || p_program || ':' || md5(lower(v_fund));
    select * into f from ingest.fund_for(v_fund, v_vintage, v_class);
    insert into public.commitments as c (external_key, lp_company_id, gp_company_id, fund_id, lp_name, gp_name, fund_name, amount, currency, commitment_year,
      asset_class, contributed, distributed, remaining_value, net_irr, multiple, as_of, disclosure_type, source, source_url, source_date)
    values (v_key, v_lp, f.gp_company_id, f.fund_id, 'CalPERS', (select name from public.companies where id = f.gp_company_id), v_fund,
      ingest.money(cells[3]), 'USD', v_vintage, v_class, ingest.money(cells[4]), ingest.money(cells[5]), ingest.money(cells[6]),
      ingest.pct(cells[7]), ingest.pct(cells[8]), v_asof,
      case p_program when 'pe' then 'Private Equity Program Fund Performance Review' else 'Private Debt Program Fund Performance Review' end,
      'lp_disclosure', v_url, v_asof)
    on conflict (external_key) do update set
      gp_company_id = coalesce(excluded.gp_company_id, c.gp_company_id), fund_id = coalesce(excluded.fund_id, c.fund_id), gp_name = coalesce(excluded.gp_name, c.gp_name),
      amount = excluded.amount, commitment_year = excluded.commitment_year, asset_class = excluded.asset_class,
      contributed = excluded.contributed, distributed = excluded.distributed, remaining_value = excluded.remaining_value,
      net_irr = excluded.net_irr, multiple = excluded.multiple, as_of = excluded.as_of, source_date = excluded.source_date;
    n := n + 1;
  end loop;

  update public.companies set discloses_commitments = coalesce(discloses_commitments, 'Yes - fund performance review pages (commitment, cash in/out, IRR, multiple)'),
         disclosure_source_url = coalesce(disclosure_source_url, v_url)
   where id = v_lp;
  insert into ingest.log (what, detail) values ('load_calpers', jsonb_build_object('program', p_program, 'rows', n, 'as_of', v_asof));
  return jsonb_build_object('program', p_program, 'rows', n, 'as_of', v_asof);
end $$;

-- Every LP page the database knows how to read, in one call.
create or replace function ingest.load_lp_disclosures() returns jsonb
language plpgsql as $$
begin
  return jsonb_build_array(ingest.load_calpers('pe'), ingest.load_calpers('pd'));
end $$;

-- --- Schedule: LP pages change quarterly; read them monthly ----------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  if not exists (select 1 from cron.job where jobname = 'lpgp-ingest-lp-disclosures') then
    perform cron.schedule('lpgp-ingest-lp-disclosures', '25 5 2 * *', $job$select ingest.load_lp_disclosures()$job$);
  end if;
end $$;
