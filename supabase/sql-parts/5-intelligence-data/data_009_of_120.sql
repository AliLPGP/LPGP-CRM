-- data_009_of_120.sql: intelligence dataset 2026-09-29, part 9 of 120. Run in order; safe to re-run.

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, stadium, stadium_capacity, stadium_capacity_source_url, founded_year, domain, ownership_type, ownership_summary, ownership_source_url, revenue, revenue_currency, revenue_season, revenue_source_name, revenue_source_url, valuation, valuation_currency, valuation_year, valuation_source_name, valuation_source_url, social_followers, social_as_of, social_source_url, social_platforms, notes, sources, verification, source)
  values ('bundesliga--sv-werder-bremen', 'SV Werder Bremen', 'Werder Bremen', 'football', 'Bundesliga', 'Germany', 'Bremen', 'Weserstadion', 42100, 'https://en.wikipedia.org/wiki/2025%E2%80%9326_Bundesliga', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '[]'::jsonb, null, '["https://en.wikipedia.org/wiki/2025%E2%80%9326_Bundesliga"]'::jsonb, '[]'::jsonb, 'web_research')
  on conflict (external_key) do update set name = excluded.name, short_name = excluded.short_name, sport = excluded.sport, league = excluded.league, country = excluded.country, city = excluded.city, stadium = excluded.stadium, stadium_capacity = excluded.stadium_capacity, stadium_capacity_source_url = excluded.stadium_capacity_source_url, founded_year = excluded.founded_year, domain = excluded.domain, ownership_type = excluded.ownership_type, ownership_summary = excluded.ownership_summary, ownership_source_url = excluded.ownership_source_url, revenue = excluded.revenue, revenue_currency = excluded.revenue_currency, revenue_season = excluded.revenue_season, revenue_source_name = excluded.revenue_source_name, revenue_source_url = excluded.revenue_source_url, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, valuation_year = excluded.valuation_year, valuation_source_name = excluded.valuation_source_name, valuation_source_url = excluded.valuation_source_url, social_followers = excluded.social_followers, social_as_of = excluded.social_as_of, social_source_url = excluded.social_source_url, social_platforms = excluded.social_platforms, notes = excluded.notes, sources = excluded.sources, verification = excluded.verification, source = excluded.source;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('bundesliga--vfl-wolfsburg', 'VfL Wolfsburg', 'Wolfsburg', 'football', 'Bundesliga', 'Germany', 'Wolfsburg', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--birmingham-city', 'Birmingham City', 'Birmingham', 'football', 'EFL Championship', 'England', 'Birmingham', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--blackburn-rovers', 'Blackburn Rovers', 'Blackburn', 'football', 'EFL Championship', 'England', 'Blackburn', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--bristol-city', 'Bristol City', 'Bristol City', 'football', 'EFL Championship', 'England', 'Bristol', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--charlton-athletic', 'Charlton Athletic', 'Charlton', 'football', 'EFL Championship', 'England', 'London', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--coventry-city', 'Coventry City', 'Coventry', 'football', 'EFL Championship', 'England', 'Coventry', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--derby-county', 'Derby County', 'Derby', 'football', 'EFL Championship', 'England', 'Derby', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--hull-city', 'Hull City', 'Hull', 'football', 'EFL Championship', 'England', 'Kingston upon Hull', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--ipswich-town', 'Ipswich Town', 'Ipswich', 'football', 'EFL Championship', 'England', 'Ipswich', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--leicester-city', 'Leicester City', 'Leicester', 'football', 'EFL Championship', 'England', 'Leicester', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--middlesbrough', 'Middlesbrough', 'Middlesbrough', 'football', 'EFL Championship', 'England', 'Middlesbrough', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--millwall', 'Millwall', 'Millwall', 'football', 'EFL Championship', 'England', 'London', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--norwich-city', 'Norwich City', 'Norwich', 'football', 'EFL Championship', 'England', 'Norwich', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--oxford-united', 'Oxford United', 'Oxford', 'football', 'EFL Championship', 'England', 'Oxford', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--portsmouth', 'Portsmouth', 'Portsmouth', 'football', 'EFL Championship', 'England', 'Portsmouth', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--preston-north-end', 'Preston North End', 'Preston', 'football', 'EFL Championship', 'England', 'Preston', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--queens-park-rangers', 'Queens Park Rangers', 'QPR', 'football', 'EFL Championship', 'England', 'London', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--sheffield-united', 'Sheffield United', 'Sheffield United', 'football', 'EFL Championship', 'England', 'Sheffield', null, 'web_research')
  on conflict (external_key) do nothing;
