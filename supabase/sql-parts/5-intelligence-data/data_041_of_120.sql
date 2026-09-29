-- data_041_of_120.sql: intelligence dataset 2026-09-29, part 41 of 120. Run in order; safe to re-run.

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, stadium, stadium_capacity, stadium_capacity_source_url, founded_year, domain, ownership_type, ownership_summary, ownership_source_url, revenue, revenue_currency, revenue_season, revenue_source_name, revenue_source_url, valuation, valuation_currency, valuation_year, valuation_source_name, valuation_source_url, social_followers, social_as_of, social_source_url, social_platforms, notes, sources, verification, source)
  values ('primeira-liga--s-c-braga', 'S.C. Braga', 'Braga', 'football', 'Primeira Liga', 'Portugal', 'Braga', null, null, null, null, null, null, null, null, 53200000, 'EUR', '2023/24', 'PortuGOAL (operating revenue)', 'https://www.portugoal.net/club-news/5790-how-the-big-three-drive-70-of-portugals-football-income', null, null, null, null, null, null, null, null, '[]'::jsonb, null, '["https://www.portugoal.net/club-news/5790-how-the-big-three-drive-70-of-portugals-football-income"]'::jsonb, '[]'::jsonb, 'web_research')
  on conflict (external_key) do update set name = excluded.name, short_name = excluded.short_name, sport = excluded.sport, league = excluded.league, country = excluded.country, city = excluded.city, stadium = excluded.stadium, stadium_capacity = excluded.stadium_capacity, stadium_capacity_source_url = excluded.stadium_capacity_source_url, founded_year = excluded.founded_year, domain = excluded.domain, ownership_type = excluded.ownership_type, ownership_summary = excluded.ownership_summary, ownership_source_url = excluded.ownership_source_url, revenue = excluded.revenue, revenue_currency = excluded.revenue_currency, revenue_season = excluded.revenue_season, revenue_source_name = excluded.revenue_source_name, revenue_source_url = excluded.revenue_source_url, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, valuation_year = excluded.valuation_year, valuation_source_name = excluded.valuation_source_name, valuation_source_url = excluded.valuation_source_url, social_followers = excluded.social_followers, social_as_of = excluded.social_as_of, social_source_url = excluded.social_source_url, social_platforms = excluded.social_platforms, notes = excluded.notes, sources = excluded.sources, verification = excluded.verification, source = excluded.source;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('primeira-liga--vitoria-s-c', 'Vitória S.C.', 'Vitória de Guimarães', 'football', 'Primeira Liga', 'Portugal', 'Guimarães', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, stadium, stadium_capacity, stadium_capacity_source_url, founded_year, domain, ownership_type, ownership_summary, ownership_source_url, revenue, revenue_currency, revenue_season, revenue_source_name, revenue_source_url, valuation, valuation_currency, valuation_year, valuation_source_name, valuation_source_url, social_followers, social_as_of, social_source_url, social_platforms, notes, sources, verification, source)
  values ('saudi-pro-league--al-hilal', 'Al Hilal', 'Al Hilal', 'football', 'Saudi Pro League', 'Saudi Arabia', 'Riyadh', null, null, null, null, null, null, null, null, 1270000000, 'SAR', '2024/25', 'EnterpriseAM (record revenue, SAR 1.27bn / $340m)', 'https://enterpriseam.com/ksa/2026/08/20/the-pif-is-taking-the-last-quarter-of-saudi-footballs-big-four/', 1200000000, 'SAR', 2026, 'Inside World Football (Kingdom Holding purchase, equity value)', 'https://www.insideworldfootball.com/2026/09/02/pif-sells-224m-stake-in-al-hilal-to-kingdom-holding', null, null, null, '[]'::jsonb, null, '["https://enterpriseam.com/ksa/2026/08/20/the-pif-is-taking-the-last-quarter-of-saudi-footballs-big-four/", "https://www.insideworldfootball.com/2026/09/02/pif-sells-224m-stake-in-al-hilal-to-kingdom-holding"]'::jsonb, '[]'::jsonb, 'web_research')
  on conflict (external_key) do update set name = excluded.name, short_name = excluded.short_name, sport = excluded.sport, league = excluded.league, country = excluded.country, city = excluded.city, stadium = excluded.stadium, stadium_capacity = excluded.stadium_capacity, stadium_capacity_source_url = excluded.stadium_capacity_source_url, founded_year = excluded.founded_year, domain = excluded.domain, ownership_type = excluded.ownership_type, ownership_summary = excluded.ownership_summary, ownership_source_url = excluded.ownership_source_url, revenue = excluded.revenue, revenue_currency = excluded.revenue_currency, revenue_season = excluded.revenue_season, revenue_source_name = excluded.revenue_source_name, revenue_source_url = excluded.revenue_source_url, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, valuation_year = excluded.valuation_year, valuation_source_name = excluded.valuation_source_name, valuation_source_url = excluded.valuation_source_url, social_followers = excluded.social_followers, social_as_of = excluded.social_as_of, social_source_url = excluded.social_source_url, social_platforms = excluded.social_platforms, notes = excluded.notes, sources = excluded.sources, verification = excluded.verification, source = excluded.source;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('saudi-pro-league--al-nassr', 'Al Nassr', 'Al Nassr', 'football', 'Saudi Pro League', 'Saudi Arabia', 'Riyadh', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('saudi-pro-league--al-ittihad', 'Al Ittihad', 'Al Ittihad', 'football', 'Saudi Pro League', 'Saudi Arabia', 'Jeddah', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('saudi-pro-league--al-ahli', 'Al Ahli', 'Al Ahli', 'football', 'Saudi Pro League', 'Saudi Arabia', 'Jeddah', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('scottish-premiership--celtic', 'Celtic', 'Celtic', 'football', 'Scottish Premiership', 'Scotland', 'Glasgow', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('scottish-premiership--rangers', 'Rangers', 'Rangers', 'football', 'Scottish Premiership', 'Scotland', 'Glasgow', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('scottish-premiership--heart-of-midlothian', 'Heart of Midlothian', 'Hearts', 'football', 'Scottish Premiership', 'Scotland', 'Edinburgh', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('scottish-premiership--aberdeen', 'Aberdeen', 'Aberdeen', 'football', 'Scottish Premiership', 'Scotland', 'Aberdeen', null, 'web_research')
  on conflict (external_key) do nothing;
