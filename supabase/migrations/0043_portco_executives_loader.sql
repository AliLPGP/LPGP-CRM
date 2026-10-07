-- 0043 — load the executives a contact database names for portfolio companies.
--
-- portco_intel.executives holds people a contact database (Lusha) lists at the
-- company, each with title and LinkedIn; the ceo / cfo / coo columns stay for
-- names a primary source or the press confirms. Readers (chiefExec,
-- financeLead, operationsLead) fall back from the confirmed column to the
-- executives, labelled by source.
--
-- p is an array of {key, name, domain, executives: [{name, title,
-- linkedin_url, has_email, source}]}. A company with no intel row gets one;
-- an existing row keeps its executives and gains the new names, and its
-- domain is filled only when blank. The names are never committed to the
-- repository: rows arrive through this function.

create or replace function ingest.load_portco_executives(p jsonb) returns integer
language plpgsql as $$
declare n int;
begin
  with src as (
    select r->>'key' key, coalesce(r->>'name', r->>'key') name, nullif(r->>'domain', '') domain, coalesce(r->'executives', '[]'::jsonb) execs
      from jsonb_array_elements(p) r
     where nullif(r->>'key', '') is not null and jsonb_array_length(coalesce(r->'executives', '[]'::jsonb)) > 0
  ), up as (
    insert into public.portco_intel as i (key, name, domain, executives, executives_at, updated_at)
    select key, name, domain, execs, now(), now() from src
    on conflict (key) do update set
      executives = i.executives || coalesce((
        select jsonb_agg(e) from jsonb_array_elements(excluded.executives) e
         where not exists (select 1 from jsonb_array_elements(i.executives) x where lower(x->>'name') = lower(e->>'name'))), '[]'::jsonb),
      executives_at = now(),
      domain = coalesce(i.domain, excluded.domain),
      updated_at = now()
    returning 1
  )
  select count(*) into n from up;
  return n;
end $$;
