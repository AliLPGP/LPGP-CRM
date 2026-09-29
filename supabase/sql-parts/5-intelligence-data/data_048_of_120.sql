-- data_048_of_120.sql: intelligence dataset 2026-09-29, part 48 of 120. Run in order; safe to re-run.

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, stadium, stadium_capacity, stadium_capacity_source_url, founded_year, domain, ownership_type, ownership_summary, ownership_source_url, revenue, revenue_currency, revenue_season, revenue_source_name, revenue_source_url, valuation, valuation_currency, valuation_year, valuation_source_name, valuation_source_url, social_followers, social_as_of, social_source_url, social_platforms, notes, sources, verification, source)
  values ('super-lig--fenerbahce', 'Fenerbahçe', 'FB', 'football', 'Süper Lig', 'Turkey', 'Istanbul', null, null, null, null, null, null, null, null, 221000000, 'EUR', '2024/25', 'Football Benchmark (operating revenue)', 'https://footballbenchmark.com/w/repositioning-the-s%C3%BCper-lig-the-transfer-surge-reshaping-turkish-football', null, null, null, null, null, null, null, null, '[]'::jsonb, null, '["https://footballbenchmark.com/w/repositioning-the-s%C3%BCper-lig-the-transfer-surge-reshaping-turkish-football"]'::jsonb, '[]'::jsonb, 'web_research')
  on conflict (external_key) do update set name = excluded.name, short_name = excluded.short_name, sport = excluded.sport, league = excluded.league, country = excluded.country, city = excluded.city, stadium = excluded.stadium, stadium_capacity = excluded.stadium_capacity, stadium_capacity_source_url = excluded.stadium_capacity_source_url, founded_year = excluded.founded_year, domain = excluded.domain, ownership_type = excluded.ownership_type, ownership_summary = excluded.ownership_summary, ownership_source_url = excluded.ownership_source_url, revenue = excluded.revenue, revenue_currency = excluded.revenue_currency, revenue_season = excluded.revenue_season, revenue_source_name = excluded.revenue_source_name, revenue_source_url = excluded.revenue_source_url, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, valuation_year = excluded.valuation_year, valuation_source_name = excluded.valuation_source_name, valuation_source_url = excluded.valuation_source_url, social_followers = excluded.social_followers, social_as_of = excluded.social_as_of, social_source_url = excluded.social_source_url, social_platforms = excluded.social_platforms, notes = excluded.notes, sources = excluded.sources, verification = excluded.verification, source = excluded.source;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, stadium, stadium_capacity, stadium_capacity_source_url, founded_year, domain, ownership_type, ownership_summary, ownership_source_url, revenue, revenue_currency, revenue_season, revenue_source_name, revenue_source_url, valuation, valuation_currency, valuation_year, valuation_source_name, valuation_source_url, social_followers, social_as_of, social_source_url, social_platforms, notes, sources, verification, source)
  values ('super-lig--besiktas', 'Beşiktaş', 'BJK', 'football', 'Süper Lig', 'Turkey', 'Istanbul', null, null, null, null, null, null, null, null, 150000000, 'EUR', '2024/25', 'Football Benchmark (operating revenue)', 'https://footballbenchmark.com/w/repositioning-the-s%C3%BCper-lig-the-transfer-surge-reshaping-turkish-football', null, null, null, null, null, null, null, null, '[]'::jsonb, null, '["https://footballbenchmark.com/w/repositioning-the-s%C3%BCper-lig-the-transfer-surge-reshaping-turkish-football"]'::jsonb, '[]'::jsonb, 'web_research')
  on conflict (external_key) do update set name = excluded.name, short_name = excluded.short_name, sport = excluded.sport, league = excluded.league, country = excluded.country, city = excluded.city, stadium = excluded.stadium, stadium_capacity = excluded.stadium_capacity, stadium_capacity_source_url = excluded.stadium_capacity_source_url, founded_year = excluded.founded_year, domain = excluded.domain, ownership_type = excluded.ownership_type, ownership_summary = excluded.ownership_summary, ownership_source_url = excluded.ownership_source_url, revenue = excluded.revenue, revenue_currency = excluded.revenue_currency, revenue_season = excluded.revenue_season, revenue_source_name = excluded.revenue_source_name, revenue_source_url = excluded.revenue_source_url, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, valuation_year = excluded.valuation_year, valuation_source_name = excluded.valuation_source_name, valuation_source_url = excluded.valuation_source_url, social_followers = excluded.social_followers, social_as_of = excluded.social_as_of, social_source_url = excluded.social_source_url, social_platforms = excluded.social_platforms, notes = excluded.notes, sources = excluded.sources, verification = excluded.verification, source = excluded.source;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('super-lig--trabzonspor', 'Trabzonspor', 'TS', 'football', 'Süper Lig', 'Turkey', 'Trabzon', null, 'web_research')
  on conflict (external_key) do nothing;

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'belgian-pro-league--club-brugge-kv');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'brasileirao-serie-a--cr-flamengo');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'brasileirao-serie-a--se-palmeiras');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'brasileirao-serie-a--sc-corinthians-paulista');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--1-fc-koln');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--borussia-dortmund');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--borussia-monchengladbach');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--eintracht-frankfurt');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--fc-augsburg');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--fc-bayern-munchen');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--hamburger-sv');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--1-fc-heidenheim');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--rb-leipzig');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--sc-freiburg');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--1-fc-union-berlin');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--vfb-stuttgart');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'bundesliga--sv-werder-bremen');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'la-liga--athletic-club');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'la-liga--atletico-de-madrid');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'la-liga--fc-barcelona');
