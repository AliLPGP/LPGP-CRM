-- data_012_of_120.sql: intelligence dataset 2026-09-29, part 12 of 120. Run in order; safe to re-run.

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, stadium, stadium_capacity, stadium_capacity_source_url, founded_year, domain, ownership_type, ownership_summary, ownership_source_url, revenue, revenue_currency, revenue_season, revenue_source_name, revenue_source_url, valuation, valuation_currency, valuation_year, valuation_source_name, valuation_source_url, social_followers, social_as_of, social_source_url, social_platforms, notes, sources, verification, source)
  values ('la-liga--elche-cf', 'Elche CF', 'Elche', 'football', 'La Liga', 'Spain', 'Elche', 'Manuel Martínez Valero', 33732, 'https://www.footballgroundmap.com/list/biggest-football-stadiums-in-la-liga', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '[]'::jsonb, null, '["https://www.footballgroundmap.com/list/biggest-football-stadiums-in-la-liga"]'::jsonb, '[]'::jsonb, 'web_research')
  on conflict (external_key) do update set name = excluded.name, short_name = excluded.short_name, sport = excluded.sport, league = excluded.league, country = excluded.country, city = excluded.city, stadium = excluded.stadium, stadium_capacity = excluded.stadium_capacity, stadium_capacity_source_url = excluded.stadium_capacity_source_url, founded_year = excluded.founded_year, domain = excluded.domain, ownership_type = excluded.ownership_type, ownership_summary = excluded.ownership_summary, ownership_source_url = excluded.ownership_source_url, revenue = excluded.revenue, revenue_currency = excluded.revenue_currency, revenue_season = excluded.revenue_season, revenue_source_name = excluded.revenue_source_name, revenue_source_url = excluded.revenue_source_url, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, valuation_year = excluded.valuation_year, valuation_source_name = excluded.valuation_source_name, valuation_source_url = excluded.valuation_source_url, social_followers = excluded.social_followers, social_as_of = excluded.social_as_of, social_source_url = excluded.social_source_url, social_platforms = excluded.social_platforms, notes = excluded.notes, sources = excluded.sources, verification = excluded.verification, source = excluded.source;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('la-liga--getafe-cf', 'Getafe CF', 'Getafe', 'football', 'La Liga', 'Spain', 'Getafe', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('la-liga--girona-fc', 'Girona FC', 'Girona', 'football', 'La Liga', 'Spain', 'Girona', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('la-liga--levante-ud', 'Levante UD', 'Levante', 'football', 'La Liga', 'Spain', 'Valencia', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('la-liga--rc-celta-de-vigo', 'RC Celta de Vigo', 'Celta Vigo', 'football', 'La Liga', 'Spain', 'Vigo', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, stadium, stadium_capacity, stadium_capacity_source_url, founded_year, domain, ownership_type, ownership_summary, ownership_source_url, revenue, revenue_currency, revenue_season, revenue_source_name, revenue_source_url, valuation, valuation_currency, valuation_year, valuation_source_name, valuation_source_url, social_followers, social_as_of, social_source_url, social_platforms, notes, sources, verification, source)
  values ('la-liga--rcd-espanyol', 'RCD Espanyol', 'Espanyol', 'football', 'La Liga', 'Spain', 'Barcelona', 'RCDE Stadium', 40000, 'https://www.footballgroundmap.com/list/biggest-football-stadiums-in-la-liga', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '[]'::jsonb, null, '["https://www.footballgroundmap.com/list/biggest-football-stadiums-in-la-liga"]'::jsonb, '[]'::jsonb, 'web_research')
  on conflict (external_key) do update set name = excluded.name, short_name = excluded.short_name, sport = excluded.sport, league = excluded.league, country = excluded.country, city = excluded.city, stadium = excluded.stadium, stadium_capacity = excluded.stadium_capacity, stadium_capacity_source_url = excluded.stadium_capacity_source_url, founded_year = excluded.founded_year, domain = excluded.domain, ownership_type = excluded.ownership_type, ownership_summary = excluded.ownership_summary, ownership_source_url = excluded.ownership_source_url, revenue = excluded.revenue, revenue_currency = excluded.revenue_currency, revenue_season = excluded.revenue_season, revenue_source_name = excluded.revenue_source_name, revenue_source_url = excluded.revenue_source_url, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, valuation_year = excluded.valuation_year, valuation_source_name = excluded.valuation_source_name, valuation_source_url = excluded.valuation_source_url, social_followers = excluded.social_followers, social_as_of = excluded.social_as_of, social_source_url = excluded.social_source_url, social_platforms = excluded.social_platforms, notes = excluded.notes, sources = excluded.sources, verification = excluded.verification, source = excluded.source;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('la-liga--rcd-mallorca', 'RCD Mallorca', 'Mallorca', 'football', 'La Liga', 'Spain', 'Palma', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('la-liga--rayo-vallecano', 'Rayo Vallecano', 'Rayo Vallecano', 'football', 'La Liga', 'Spain', 'Madrid', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('la-liga--real-betis-balompie', 'Real Betis Balompié', 'Real Betis', 'football', 'La Liga', 'Spain', 'Seville', null, 'web_research')
  on conflict (external_key) do nothing;
