-- 0042 — "None" is not a placement agent.
--
-- Form D asks, for each sales compensation recipient, its name, CRD, and
-- "associated broker-dealer" with that CRD. When the recipient *is* the
-- broker-dealer, filers type "None" in the associated fields (and some type
-- "None" or "N/A" for the recipient when nobody is paid). The desks took the
-- associated broker-dealer first, so Goldman Sachs, J.P. Morgan, AQR and
-- hundreds of others were counted as one agent called "None".
--
-- A placeholder is a blank: every stored recipient has its placeholder
-- fields nulled, a recipient with neither a name nor a broker-dealer is
-- dropped, and a trigger does the same for every filing parsed from now on.

create or replace function ingest.fd_blank(p text) returns text language sql immutable as $$
  select case when btrim(coalesce(p, '')) ~* '^(none|n/?a|n\.a\.?|na|not applicable|null|nil|no|unknown|tbd|-+|\.+|0+)?\W*$' then null else btrim(p) end
$$;

create or replace function ingest.clean_agents(p jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(a), '[]'::jsonb) from (
    select jsonb_build_object(
             'name', ingest.fd_blank(e->>'name'), 'crd', ingest.fd_blank(e->>'crd'),
             'broker_dealer', ingest.fd_blank(e->>'broker_dealer'), 'bd_crd', ingest.fd_blank(e->>'bd_crd'),
             'states', coalesce(e->'states', '[]'::jsonb)) a
      from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) e
     where coalesce(ingest.fd_blank(e->>'name'), ingest.fd_blank(e->>'broker_dealer')) is not null) q
$$;

create or replace function ingest.fund_offerings_clean_agents() returns trigger language plpgsql as $$
begin
  new.placement_agents := ingest.clean_agents(new.placement_agents);
  return new;
end $$;

drop trigger if exists fund_offerings_clean_agents on public.fund_offerings;
create trigger fund_offerings_clean_agents before insert or update of placement_agents on public.fund_offerings
  for each row execute function ingest.fund_offerings_clean_agents();

-- The filings already stored (only those carrying a placeholder).
update public.fund_offerings o set placement_agents = ingest.clean_agents(o.placement_agents)
 where exists (select 1 from jsonb_array_elements(o.placement_agents) e
                where (e->>'name') is distinct from ingest.fd_blank(e->>'name')
                   or (e->>'broker_dealer') is distinct from ingest.fd_blank(e->>'broker_dealer')
                   or (e->>'crd') is distinct from ingest.fd_blank(e->>'crd')
                   or (e->>'bd_crd') is distinct from ingest.fd_blank(e->>'bd_crd'));

-- Provider links built from the placeholder go; derive_placement_agents
-- rebuilds the real ones under each agent's own name.
delete from public.service_relationships
 where role = 'placement_agent' and source = 'sec_form_d' and ingest.fd_blank(provider_brand) is null;

-- A social profile is not a firm's website. Form ADV and the directory
-- workbook sometimes give a LinkedIn, Facebook, YouTube or Instagram page
-- where the website belongs; the domain derived from it ("linkedin.com")
-- then names a social network as the firm's domain. A LinkedIn company page
-- is kept where it belongs; the website and domain stay blank until the
-- firm's own site is found.
create or replace function public.company_site_guard() returns trigger language plpgsql as $$
declare social text := '(linkedin\.com|facebook\.com|fb\.com|youtube\.com|youtu\.be|instagram\.com|twitter\.com|(^|[/.])x\.com|tiktok\.com|crunchbase\.com|bloomberg\.com|wikipedia\.org|google\.[a-z.]+/|sites\.google)';
begin
  if new.website ~* social then
    if new.website ~* 'linkedin\.com/(company|showcase|school)/' and new.linkedin_url is null then
      new.linkedin_url := new.website;
    end if;
    new.website := null;
    if new.domain ~* social or new.domain is not null and new.domain !~ '\.' then new.domain := null; end if;
  end if;
  if new.domain ~* '^(www\.)?(linkedin|facebook|fb|youtube|instagram|twitter|x|tiktok|crunchbase|bloomberg|wikipedia|google)\.[a-z.]+$' then
    new.domain := null;
  end if;
  return new;
end $$;

drop trigger if exists company_site_guard on public.companies;
create trigger company_site_guard before insert or update of website, domain on public.companies
  for each row execute function public.company_site_guard();

update public.companies set website = website
 where coalesce(website, '') || ' ' || coalesce(domain, '') ~* '(linkedin|facebook|youtube|instagram|twitter|tiktok|crunchbase|bloomberg\.com|wikipedia)';
