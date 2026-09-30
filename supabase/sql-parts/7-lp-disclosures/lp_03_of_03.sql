-- lp: part 3 of 3
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- p_format: 'aware' (Schedule 8D layout with a title line, a header line and
-- named columns) or 'hesta' (one header line: date, option, asset class,
-- internal/external, name, units, value, weighting).
create or replace function ingest.load_phd(p_lp text, p_type text, p_site text, p_url text, p_option text, p_format text) returns jsonb
language plpgsql as $$
declare
  v_lp uuid; v_csv text; line text; f text[]; n int := 0; v_asof date; v_class text; v_manager text; v_value numeric; v_key text; m record; v_lineno int := 0;
begin
  v_lp := ingest.lp_company(p_lp, p_type, 'Australia', p_site);
  v_csv := ingest.http_text(p_url);
  for line in select l from regexp_split_to_table(v_csv, E'\r?\n') l loop
    v_lineno := v_lineno + 1;
    continue when btrim(line) = '';
    f := ingest.csv_fields(line);
    if p_format = 'aware' then
      if v_lineno = 1 then v_asof := (regexp_match(line, '(\d{4}-\d{2}-\d{2})'))[1]::date; continue; end if;
      continue when array_length(f, 1) < 12 or upper(coalesce(f[2], '')) <> 'EXTERNALLY';
      v_class := ingest.phd_class(f[1]); v_manager := f[5]; v_value := ingest.money(f[12]);
      continue when v_class is null and upper(f[1]) !~ 'UNLISTED';
    elsif p_format = 'hesta' then
      continue when v_lineno = 1 or array_length(f, 1) < 7 or lower(coalesce(f[4], '')) <> 'externally managed';
      v_asof := to_date(f[1], 'DD/MM/YYYY');
      v_class := ingest.phd_class(f[3]); v_manager := f[5]; v_value := ingest.money(f[7]);
      continue when v_class is null and lower(f[3]) !~ 'unlisted';
    elsif p_format = 'australiansuper' then
      -- Option Code, Option Name, Asset Class, Filter, Sub-Filter, Name, Name Type, ..., $ Value (15th)
      continue when v_lineno = 1 or array_length(f, 1) < 15 or lower(coalesce(f[7], '')) <> 'name of fund manager';
      continue when lower(coalesce(f[4], '')) <> 'externally managed' and lower(coalesce(f[5], '')) <> 'externally managed';
      v_class := ingest.phd_class(f[3]); v_manager := f[6]; v_value := ingest.money(f[15]);
      continue when v_class is null and lower(f[3]) !~ 'alternatives';
      continue when lower(f[3]) ~ 'fixed income|cash|shares|equit(y|ies)$';
    else
      raise exception 'unknown PHD format %', p_format;
    end if;
    continue when v_manager is null or v_manager in ('-', '') or v_manager ~* '^n/a' or v_value is null or v_value <= 0;
    v_manager := btrim(regexp_replace(v_manager, '\s+', ' ', 'g'));
    if v_manager = upper(v_manager) then v_manager := initcap(v_manager); end if;
    select * into m from ingest.match_firm(v_manager, array['GP']);
    v_key := 'phd:' || lower(regexp_replace(p_lp, '[^A-Za-z0-9]+', '-', 'g')) || ':' || lower(regexp_replace(p_option, '[^A-Za-z0-9]+', '-', 'g')) || ':' || md5(lower(coalesce(v_class, 'unlisted') || '|' || v_manager));
    insert into public.commitments as c (external_key, lp_company_id, gp_company_id, lp_name, gp_name, fund_name, amount, amount_text, currency,
      asset_class, remaining_value, as_of, disclosure_type, source, source_url, source_date)
    values (v_key, v_lp, m.company_id, p_lp, coalesce((select name from public.companies where id = m.company_id), v_manager),
      case v_class when 'private_equity' then 'Private equity mandate' when 'infrastructure' then 'Infrastructure mandate' when 'real_estate' then 'Property mandate' when 'private_credit' then 'Private credit mandate' else 'Unlisted alternatives mandate' end,
      null, 'A$' || case when v_value >= 1e9 then round(v_value / 1e9, 2)::text || 'bn' when v_value >= 1e6 then round(v_value / 1e6, 1)::text || 'm' else to_char(v_value, 'FM999,999,999') end || ' held', 'AUD',
      v_class, v_value, v_asof, 'Portfolio holdings disclosure, ' || p_option || ' option', 'lp_disclosure', p_url, v_asof)
    on conflict (external_key) do update set
      gp_company_id = coalesce(excluded.gp_company_id, c.gp_company_id), gp_name = excluded.gp_name, amount_text = excluded.amount_text,
      remaining_value = excluded.remaining_value, as_of = excluded.as_of, source_date = excluded.source_date, disclosure_type = excluded.disclosure_type;
    n := n + 1;
  end loop;
  -- A file that carries no date (AustralianSuper's) takes it from the page that links it.
  if v_asof is null and n > 0 then
    begin
      v_asof := to_date((regexp_match(ingest.http_text(p_site), 'as at (\d{1,2} [A-Z][a-z]+ \d{4})'))[1], 'DD Month YYYY');
      update public.commitments set as_of = v_asof, source_date = v_asof where lp_company_id = v_lp and source_url = p_url and as_of is null;
    exception when others then null;
    end;
  end if;
  update public.companies set discloses_commitments = coalesce(discloses_commitments, 'Yes - portfolio holdings disclosure (manager and value held, twice a year)'),
         disclosure_source_url = coalesce(disclosure_source_url, p_url)
   where id = v_lp;
  insert into ingest.log (what, detail) values ('load_phd', jsonb_build_object('lp', p_lp, 'option', p_option, 'rows', n, 'as_of', v_asof));
  return jsonb_build_object('lp', p_lp, 'rows', n, 'as_of', v_asof);
end $$;

-- Every LP page the database knows how to read, in one call. Each source is
-- its own block so one site being down does not stop the others.
create or replace function ingest.load_lp_disclosures() returns jsonb
language plpgsql as $$
declare out jsonb := '[]'::jsonb; r jsonb;
begin
  begin r := ingest.load_calpers('pe'); exception when others then r := jsonb_build_object('error', sqlerrm, 'source', 'calpers pe'); end; out := out || r;
  begin r := ingest.load_calpers('pd'); exception when others then r := jsonb_build_object('error', sqlerrm, 'source', 'calpers pd'); end; out := out || r;
  begin r := ingest.load_phd('Aware Super', 'Superannuation Fund', 'https://aware.com.au', 'https://aware.com.au/content/dam/aware/au/en/documents/member/disclosure/phd/portfolio-holdings-disclosure/Accumulation-Balanced.csv', 'Balanced', 'aware');
    exception when others then r := jsonb_build_object('error', sqlerrm, 'source', 'aware'); end; out := out || r;
  begin r := ingest.load_phd('HESTA', 'Superannuation Fund', 'https://www.hesta.com.au', 'https://www.hesta.com.au/content/dam/hesta/phd-all-files/accum-june-2026/balanced-growth/Balanced-Growth-super-assets.csv', 'Balanced Growth', 'hesta');
    exception when others then r := jsonb_build_object('error', sqlerrm, 'source', 'hesta'); end; out := out || r;
  begin r := ingest.load_phd('AustralianSuper', 'Superannuation Fund', 'https://www.australiansuper.com/investments/what-we-invest-in', 'https://www.australiansuper.com/-/media/australian-super/files/investments/phd/superannuation/balanced-phd.csv', 'Balanced', 'australiansuper');
    exception when others then r := jsonb_build_object('error', sqlerrm, 'source', 'australiansuper'); end; out := out || r;
  return out;
end $$;

-- --- Schedule: LP pages change quarterly; read them monthly ----------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  if not exists (select 1 from cron.job where jobname = 'lpgp-ingest-lp-disclosures') then
    perform cron.schedule('lpgp-ingest-lp-disclosures', '25 5 2 * *', $job$select ingest.load_lp_disclosures()$job$);
  end if;
end $$;
