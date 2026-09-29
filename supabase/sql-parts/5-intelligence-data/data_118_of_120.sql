-- data_118_of_120.sql: intelligence dataset 2026-09-29, part 118 of 120. Run in order; safe to re-run.

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1), (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) || ':' || 'conscia', 'Conscia', null, null, 'IT infrastructure and security', null, 'current', null, null, null, 'web_research', 'https://www.nordiccapital.com/portfolio-cases/'
  where (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1), (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) || ':' || 'foxway', 'Foxway', null, null, 'Circular IT services', null, 'current', null, null, null, 'web_research', 'https://www.nordiccapital.com/portfolio-cases/'
  where (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1), (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) || ':' || 'board-international', 'Board International', null, null, 'Planning software', null, 'current', null, null, null, 'web_research', 'https://www.nordiccapital.com/portfolio-cases/investments/board-international/'
  where (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Advent International') limit 1), (select id from public.companies where lower(name) = lower('Advent International') limit 1) || ':' || 'avio', 'Avio', null, null, 'Aerospace and defence', null, null, null, null, null, 'web_research', 'https://pitchbook.com/profiles/investor/10015-12'
  where (select id from public.companies where lower(name) = lower('Advent International') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Advent International') limit 1), (select id from public.companies where lower(name) = lower('Advent International') limit 1) || ':' || 'inpost', 'InPost', null, 'Acquired with FedEx, A&R and PPF in a €7.8bn offer completed September 2026; Advent holds 37%.', 'Logistics', 'Poland', 'current', 2026, null, null, 'web_research', 'https://www.bloomberg.com/news/articles/2026-09-18/fedex-led-group-completes-7-8-billion-buyout-of-poland-s-inpost'
  where (select id from public.companies where lower(name) = lower('Advent International') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Advent International') limit 1), (select id from public.companies where lower(name) = lower('Advent International') limit 1) || ':' || 'yatharth-hospitals', 'Yatharth Hospitals', null, null, 'Hospitals', 'India', null, null, null, null, 'web_research', 'https://pitchbook.com/profiles/investor/10015-12'
  where (select id from public.companies where lower(name) = lower('Advent International') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Advent International') limit 1), (select id from public.companies where lower(name) = lower('Advent International') limit 1) || ':' || 'innio', 'INNIO', null, 'Listed on the Nasdaq Global Select Market on 4 June 2026 as INIO.', 'Energy equipment', null, null, null, 2026, null, 'web_research', 'https://pitchbook.com/profiles/investor/10015-12'
  where (select id from public.companies where lower(name) = lower('Advent International') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;
