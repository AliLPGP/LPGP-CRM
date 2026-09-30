-- roster: part 2 of 2
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- Managers the directory lacks become GP records: every adviser that reports
-- advising private funds with gross assets of at least p_min_gav. Rows the
-- directory already holds (by CRD, then by exact name) get their Form ADV
-- facts filled where blank, and are never renamed or retyped.
create or replace function ingest.promote_advisers(p_min_gav numeric default 100000000) returns jsonb
language plpgsql as $$
declare n_new int := 0; n_linked int := 0; n_filled int := 0; a record; v_id uuid;
begin
  for a in
    select * from public.adv_advisers
     where private_funds and coalesce(private_fund_gav, 0) >= p_min_gav and company_id is null
     order by private_fund_gav desc
  loop
    select id into v_id from public.companies where lower(name) = lower(a.name) or lower(name) = lower(coalesce(a.legal_name, '')) order by (sec_crd is null) limit 1;
    if v_id is not null then
      update public.adv_advisers set company_id = v_id where crd = a.crd;
      n_linked := n_linked + 1;
      continue;
    end if;
    insert into public.companies (name, category, sub_type, website, domain, city, state, country, source, sec_crd, external_ids, adv_firm_type, adv_last_filed,
      adv_employee_count, private_fund_count, private_fund_gross_assets, regulatory_aum_usd, adv_source_url, description)
    values (
      ingest.nice_name(a.name), 'GP', ingest.adviser_type(a),
      nullif(lower(a.website), ''),
      nullif(regexp_replace(lower(coalesce(a.website, '')), '^https?://(www\.)?([^/]+).*$', '\2'), ''),
      ingest.nice_name(a.city), a.state, case when a.country = 'United States' then 'United States' else a.country end,
      'form_adv_roster', a.crd, array['crd:' || a.crd], case when a.firm_type = 'ERA' then 'ERA' else 'Registered' end, a.filed,
      a.employees, a.private_fund_count, a.private_fund_gav, a.regulatory_aum,
      'https://adviserinfo.sec.gov/firm/summary/' || a.crd,
      format('%s adviser to %s private fund%s with $%s gross assets, per Form ADV (%s).',
             case when a.firm_type = 'ERA' then 'Exempt reporting' else 'SEC-registered' end,
             coalesce(a.private_fund_count, 0), case when coalesce(a.private_fund_count, 0) = 1 then '' else 's' end,
             case when a.private_fund_gav >= 1e9 then round(a.private_fund_gav / 1e9, 1)::text || 'bn' else round(a.private_fund_gav / 1e6)::text || 'm' end,
             to_char(a.filed, 'Mon YYYY')))
    returning id into v_id;
    update public.adv_advisers set company_id = v_id where crd = a.crd;
    n_new := n_new + 1;
  end loop;

  -- Fill Form ADV blanks on firms the directory already had.
  with f as (
    update public.companies c
       set sec_crd = coalesce(c.sec_crd, a.crd),
           adv_firm_type = coalesce(c.adv_firm_type, case when a.firm_type = 'ERA' then 'ERA' else 'Registered' end),
           adv_last_filed = coalesce(c.adv_last_filed, a.filed),
           adv_employee_count = coalesce(c.adv_employee_count, a.employees),
           private_fund_count = coalesce(c.private_fund_count, a.private_fund_count),
           private_fund_gross_assets = coalesce(c.private_fund_gross_assets, a.private_fund_gav),
           regulatory_aum_usd = coalesce(c.regulatory_aum_usd, a.regulatory_aum),
           adv_source_url = coalesce(c.adv_source_url, 'https://adviserinfo.sec.gov/firm/summary/' || a.crd),
           website = coalesce(c.website, nullif(lower(a.website), ''))
      from public.adv_advisers a
     where a.company_id = c.id
       and (c.sec_crd is null or c.adv_last_filed is null or c.private_fund_count is null or c.private_fund_gross_assets is null or c.regulatory_aum_usd is null or c.website is null)
    returning 1
  ) select count(*) into n_filled from f;
  insert into ingest.log (what, detail) values ('promote_advisers', jsonb_build_object('new', n_new, 'linked', n_linked, 'filled', n_filled, 'min_gav', p_min_gav));
  return jsonb_build_object('new', n_new, 'linked', n_linked, 'filled', n_filled);
end $$;
