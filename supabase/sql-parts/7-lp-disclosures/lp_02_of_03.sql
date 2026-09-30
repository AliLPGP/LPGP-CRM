-- lp: part 2 of 3
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

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

-- --- Australian portfolio holdings disclosures ------------------------------
-- Every APRA-regulated super fund must publish its holdings twice a year
-- (Corporations Act s1017BB), most as CSV. For unlisted asset classes the
-- externally managed rows name the manager and the value held under the
-- option: an LP's mandate with a GP, with its size. Commitment amounts are
-- not disclosed, so those stay null; the value goes in remaining_value.

-- One CSV line into fields, quotes and embedded commas respected.
create or replace function ingest.csv_fields(p_line text) returns text[]
language sql immutable as $$
  select array_agg(coalesce(m[1], m[2]) order by o)
  from regexp_matches(p_line, '(?:"((?:[^"]|"")*)"|([^,]*))(?:,|$)', 'g') with ordinality as t(m, o);
$$;

create or replace function ingest.phd_class(p text) returns text
language sql immutable as $$
  select case
    when lower(p) ~ 'unlisted equity|private equity' then 'private_equity'
    when lower(p) ~ 'infrastructure' then 'infrastructure'
    when lower(p) ~ 'property|real estate' then 'real_estate'
    when lower(p) ~ 'private debt|private credit' then 'private_credit'
    else null end;
$$;

-- A name filed in capitals, made readable: title case, with the short tokens
-- that are initials or legal forms (IFM, QIC, TPG, LLC, LP) kept upper.
create or replace function ingest.nice_name(p text) returns text
language plpgsql immutable as $$
declare t text; out text[] := '{}';
begin
  if p is null or p <> upper(p) then return p; end if;
  foreach t in array regexp_split_to_array(initcap(p), ' ') loop
    if length(regexp_replace(t, '[^A-Za-z]', '', 'g')) <= 3 and lower(t) not in ('pty', 'ltd', 'inc', 'and', 'the', 'co', 'of', 'de', 'du', 'la', 'le', 'et', 'des', 'for', 'von', 'van', 'da', 'do', 'e') then
      t := upper(t);
    elsif lower(t) in ('llc', 'llp', 'l.p.', 'gmbh', 'sarl', 's.à.r.l.', 's.a.r.l.', 'plc') then
      t := case when lower(t) = 'gmbh' then 'GmbH' when lower(t) = 'plc' then 'plc' else upper(t) end;
    end if;
    out := out || t;
  end loop;
  return array_to_string(out, ' ');
end $$;

create or replace function ingest.lp_company(p_name text, p_type text, p_country text, p_site text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from public.companies where lower(name) = lower(p_name) order by (category = 'LP') desc limit 1;
  if v is null then
    insert into public.companies (name, category, investor_type, country, website, source) values (p_name, 'LP', p_type, p_country, p_site, 'lp_disclosure') returning id into v;
  end if;
  return v;
end $$;
