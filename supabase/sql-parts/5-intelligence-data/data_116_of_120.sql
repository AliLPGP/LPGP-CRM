-- data_116_of_120.sql: intelligence dataset 2026-09-29, part 116 of 120. Run in order; safe to re-run.

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1), (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) || ':' || 'proofpoint', 'Proofpoint', null, 'Take-private at $12.3bn.', 'Cybersecurity software', null, 'current', null, null, null, 'web_research', 'https://www.thomabravo.com/portfolio'
  where (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1), (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) || ':' || 'shipstation-global', 'ShipStation Global', null, null, 'Software', null, 'current', null, null, null, 'web_research', 'https://www.thomabravo.com/portfolio'
  where (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1), (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) || ':' || 'olo', 'Olo', null, null, 'Software', null, 'current', null, null, null, 'web_research', 'https://www.thomabravo.com/portfolio'
  where (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1), (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) || ':' || 'qlik', 'Qlik', null, null, 'Data and analytics software', null, 'current', null, null, null, 'web_research', 'https://www.thomabravo.com/portfolio'
  where (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1), (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) || ':' || 'coupa', 'Coupa', null, 'Acquired for $8bn.', 'Spend management software', null, 'current', null, null, null, 'web_research', 'https://www.thomabravo.com/portfolio'
  where (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1), (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) || ':' || 'anaplan', 'Anaplan', null, null, 'Planning software', null, 'current', null, null, null, 'web_research', 'https://www.thomabravo.com/portfolio'
  where (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1), (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) || ':' || 'jeppesen-foreflight', 'Jeppesen ForeFlight', null, 'Jeppesen, ForeFlight, AerData and OzRunways acquired from Boeing for $10.55bn.', 'Aviation software', null, 'current', null, null, null, 'web_research', 'https://www.thomabravo.com/portfolio'
  where (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1), (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) || ':' || 'azul', 'Azul', null, null, 'Software', null, 'current', null, null, null, 'web_research', 'https://www.thomabravo.com/portfolio'
  where (select id from public.companies where lower(name) = lower('Thoma Bravo') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;
