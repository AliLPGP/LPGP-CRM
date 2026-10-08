-- One LP's public profile as research read it from the LP's own site, annual
-- report and press: blanks on the company are filled (never overwritten, each
-- with the page that states it in `sources`), and the named leaders are added
-- as people (name and title only; no email or phone). The source page of each
-- person is checked before a row reaches here.
create or replace function ingest.load_lp_web(p jsonb) returns integer
language plpgsql as $$
declare r jsonb; pe jsonb; n int := 0; v_id uuid; v_src jsonb; v_dom text; slug text;
begin
  for r in select * from jsonb_array_elements(p) loop
    v_id := nullif(r->>'id','')::uuid;
    if v_id is null or not exists (select 1 from public.companies where id = v_id) then continue; end if;
    v_dom := lower(regexp_replace(regexp_replace(coalesce(nullif(r->>'domain',''), nullif(r->>'website','')), '^https?://(www\.)?', ''), '/.*$', ''));
    update public.companies c set
      domain = coalesce(c.domain, nullif(v_dom,'')),
      website = coalesce(c.website, nullif(r->>'website','')),
      description = coalesce(nullif(c.description,''), nullif(r->>'description','')),
      hq_location = coalesce(nullif(c.hq_location,''), nullif(r->>'hq_location','')),
      linkedin_url = coalesce(c.linkedin_url, nullif(r->>'linkedin_url','')),
      employee_count = coalesce(c.employee_count, nullif(r->>'employee_count','')::int),
      sources = coalesce(c.sources,'{}'::jsonb)
        || case when nullif(c.description,'') is null and nullif(r->>'description','') is not null and r->>'description_url' ~* '^https?://'
             then jsonb_build_object('description', jsonb_build_object('name','own site / filings','kind','company','url',r->>'description_url')) else '{}'::jsonb end
        || case when c.employee_count is null and nullif(r->>'employee_count','') is not null and r->>'employee_url' ~* '^https?://'
             then jsonb_build_object('employee_count', jsonb_build_object('name','published','kind','company','url',r->>'employee_url')) else '{}'::jsonb end
        || case when c.linkedin_url is null and nullif(r->>'linkedin_url','') is not null
             then jsonb_build_object('linkedin_url', jsonb_build_object('name','LinkedIn','kind','company','url',r->>'linkedin_url')) else '{}'::jsonb end,
      updated_at = now()
    where c.id = v_id;
    for pe in select * from jsonb_array_elements(coalesce(r->'people','[]'::jsonb)) loop
      if coalesce(pe->>'first_name','') = '' or coalesce(pe->>'last_name','') = '' or coalesce(pe->>'job_title','') = '' or coalesce(pe->>'source_url','') !~* '^https?://' then continue; end if;
      slug := lower(regexp_replace(pe->>'first_name' || '-' || (pe->>'last_name'), '[^a-zA-Z0-9]+', '-', 'g'));
      insert into public.contacts as t (company_id, first_name, last_name, job_title, seniority, department, linkedin_url, source, external_ref)
      values (v_id, pe->>'first_name', pe->>'last_name', pe->>'job_title', public.title_seniority(pe->>'job_title'), public.title_department(pe->>'job_title'),
              nullif(pe->>'linkedin_url',''), 'web_research', 'web:' || v_id::text || ':' || slug)
      on conflict (external_ref) do update set job_title = excluded.job_title, updated_at = now();
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
