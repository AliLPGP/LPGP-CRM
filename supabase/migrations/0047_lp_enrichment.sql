-- 0047 — LP profiles filled from the contact database and the LP's own site.
--
-- ingest.load_lp_firmographics fills an LP's blank LinkedIn page, headcount
-- and description: LinkedIn and headcount as the contact database (Lusha)
-- states them for the LP's own domain, the description as the LP's own
-- homepage words it (its meta description), with the page in `sources`, or as
-- the contact database describes the firm when its site gives none (labelled so).
-- Nothing a person or an earlier import set is overwritten.
--
-- ingest.load_lp_contacts adds the investment decision-makers the contact
-- database lists for the LP's domain (name, title, country, LinkedIn — no
-- reveals, no emails or phones), keyed by `external_ref` so a rerun updates
-- rather than duplicates. Names are personal data: they reach the database
-- through the temporary token-guarded loader and are never committed.
-- Idempotent.

create or replace function ingest.load_lp_firmographics(p jsonb) returns integer
language plpgsql as $$
declare n int;
begin
  with src as (
    select * from jsonb_to_recordset(p) as x(id uuid, linkedin_url text, employee_count integer, description text, description_url text, description_source text)
  ), up as (
    update public.companies c set
      linkedin_url = coalesce(c.linkedin_url, nullif(s.linkedin_url, '')),
      employee_count = coalesce(c.employee_count, s.employee_count),
      description = coalesce(nullif(c.description, ''), nullif(s.description, '')),
      sources = coalesce(c.sources, '{}'::jsonb)
        || case when c.linkedin_url is null and nullif(s.linkedin_url, '') is not null
                then jsonb_build_object('linkedin_url', jsonb_build_object('name', 'Lusha', 'kind', 'contact_database')) else '{}'::jsonb end
        || case when c.employee_count is null and s.employee_count is not null
                then jsonb_build_object('employee_count', jsonb_build_object('name', 'Lusha', 'kind', 'contact_database')) else '{}'::jsonb end
        || case when nullif(c.description, '') is null and nullif(s.description, '') is not null
                then jsonb_build_object('description', case when s.description_source = 'lusha' then jsonb_build_object('name', 'Lusha', 'kind', 'contact_database') else jsonb_build_object('name', 'own website', 'kind', 'company', 'url', s.description_url) end) else '{}'::jsonb end,
      updated_at = now()
    from src s
    where c.id = s.id
      and ((c.linkedin_url is null and nullif(s.linkedin_url, '') is not null)
        or (c.employee_count is null and s.employee_count is not null)
        or (nullif(c.description, '') is null and nullif(s.description, '') is not null))
    returning 1
  )
  select count(*) into n from up;
  return n;
end $$;

create or replace function ingest.load_lp_contacts(p jsonb) returns integer
language plpgsql as $$
declare n int;
begin
  with src as (
    select * from jsonb_to_recordset(p) as x(company_id uuid, first_name text, last_name text, job_title text, country text, linkedin_url text, ref text)
  ), up as (
    insert into public.contacts as t (company_id, first_name, last_name, job_title, seniority, department, country, linkedin_url, source, external_ref)
    select company_id, first_name, last_name, job_title,
           public.title_seniority(job_title), public.title_department(job_title), nullif(country, ''), nullif(linkedin_url, ''), 'lusha', ref
      from src
     where company_id is not null and coalesce(first_name, '') <> '' and coalesce(last_name, '') <> '' and ref is not null
    on conflict (external_ref) do update set
      job_title = excluded.job_title,
      seniority = coalesce(t.seniority, excluded.seniority),
      department = coalesce(t.department, excluded.department),
      country = coalesce(t.country, excluded.country),
      linkedin_url = coalesce(t.linkedin_url, excluded.linkedin_url),
      updated_at = now()
    returning 1
  )
  select count(*) into n from up;
  return n;
end $$;
