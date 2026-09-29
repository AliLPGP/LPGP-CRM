-- data_117_of_120.sql: intelligence dataset 2026-09-29, part 117 of 120. Run in order; safe to re-run.

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Hg') limit 1), (select id from public.companies where lower(name) = lower('Hg') limit 1) || ':' || 'visma', 'Visma', null, 'Hg led the $12.2bn buyout in August 2020, Europe''s largest software buyout at the time.', 'Business software', 'Oslo, Norway', 'current', 2020, null, null, 'web_research', 'https://en.wikipedia.org/wiki/Hg_(equity_firm)'
  where (select id from public.companies where lower(name) = lower('Hg') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Hg') limit 1), (select id from public.companies where lower(name) = lower('Hg') limit 1) || ':' || 'ideagen', 'Ideagen', null, 'Acquired for about £1bn in 2022.', 'GRC software', 'United Kingdom', 'current', 2022, null, null, 'web_research', 'https://en.wikipedia.org/wiki/Hg_(equity_firm)'
  where (select id from public.companies where lower(name) = lower('Hg') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Hg') limit 1), (select id from public.companies where lower(name) = lower('Hg') limit 1) || ':' || 'the-access-group', 'The Access Group', null, 'Industry-specific software for SME and mid-market customers in the UK, Ireland and Australia; 60,000+ customers.', 'ERP software', 'United Kingdom', 'current', null, null, null, 'web_research', 'https://www.hgcapitaltrust.com/portfolio'
  where (select id from public.companies where lower(name) = lower('Hg') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1), (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) || ':' || 'advanz-pharma', 'ADVANZ PHARMA', null, 'Take-private in 2021.', 'Pharmaceuticals', null, 'current', 2021, null, null, 'web_research', 'https://www.nordiccapital.com/portfolio-cases/'
  where (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1), (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) || ':' || 'regnology', 'Regnology', null, null, 'Regulatory reporting software', null, 'current', 2020, null, null, 'web_research', 'https://www.nordiccapital.com/portfolio-cases/'
  where (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1), (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) || ':' || 'autocirc', 'Autocirc', null, null, 'Automotive circular economy', null, 'current', 2023, null, null, 'web_research', 'https://www.nordiccapital.com/portfolio-cases/'
  where (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1), (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) || ':' || 'sunrise-medical', 'Sunrise Medical', null, null, 'Medical devices', null, 'current', 2015, null, null, 'web_research', 'https://www.nordiccapital.com/portfolio-cases/'
  where (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;

insert into public.portfolio_companies (gp_company_id, external_key, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, source, source_url)
  select (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1), (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) || ':' || 'sortera', 'Sortera', null, null, 'Construction waste management', null, 'current', null, null, null, 'web_research', 'https://www.nordiccapital.com/portfolio-cases/'
  where (select id from public.companies where lower(name) = lower('Nordic Capital') limit 1) is not null
  on conflict (external_key) do update set name = excluded.name, domain = excluded.domain, description = excluded.description, sector = excluded.sector, hq = excluded.hq, status = excluded.status, invested_year = excluded.invested_year, exit_year = excluded.exit_year, fund_name = excluded.fund_name, source_url = excluded.source_url;
