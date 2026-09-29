-- data_010_of_120.sql: intelligence dataset 2026-09-29, part 10 of 120. Run in order; safe to re-run.

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--sheffield-wednesday', 'Sheffield Wednesday', 'Sheffield Wednesday', 'football', 'EFL Championship', 'England', 'Sheffield', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--southampton', 'Southampton', 'Southampton', 'football', 'EFL Championship', 'England', 'Southampton', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--stoke-city', 'Stoke City', 'Stoke', 'football', 'EFL Championship', 'England', 'Stoke-on-Trent', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--swansea-city', 'Swansea City', 'Swansea', 'football', 'EFL Championship', 'England', 'Swansea', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--watford', 'Watford', 'Watford', 'football', 'EFL Championship', 'England', 'Watford', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--west-bromwich-albion', 'West Bromwich Albion', 'West Brom', 'football', 'EFL Championship', 'England', 'West Bromwich', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('efl-championship--wrexham', 'Wrexham', 'Wrexham', 'football', 'EFL Championship', 'England', 'Wrexham', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('eredivisie--afc-ajax', 'AFC Ajax', 'Ajax', 'football', 'Eredivisie', 'Netherlands', 'Amsterdam', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('eredivisie--psv-eindhoven', 'PSV Eindhoven', 'PSV', 'football', 'Eredivisie', 'Netherlands', 'Eindhoven', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('eredivisie--feyenoord-rotterdam', 'Feyenoord Rotterdam', 'Feyenoord', 'football', 'Eredivisie', 'Netherlands', 'Rotterdam', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('eredivisie--az-alkmaar', 'AZ Alkmaar', 'AZ', 'football', 'Eredivisie', 'Netherlands', 'Alkmaar', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('eredivisie--fc-twente', 'FC Twente', 'Twente', 'football', 'Eredivisie', 'Netherlands', 'Enschede', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('eredivisie--fc-utrecht', 'FC Utrecht', 'Utrecht', 'football', 'Eredivisie', 'Netherlands', 'Utrecht', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('eredivisie--sc-heerenveen', 'SC Heerenveen', 'Heerenveen', 'football', 'Eredivisie', 'Netherlands', 'Heerenveen', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, domain, source)
  values ('eredivisie--fc-groningen', 'FC Groningen', 'Groningen', 'football', 'Eredivisie', 'Netherlands', 'Groningen', null, 'web_research')
  on conflict (external_key) do nothing;

insert into public.sports_teams (external_key, name, short_name, sport, league, country, city, stadium, stadium_capacity, stadium_capacity_source_url, founded_year, domain, ownership_type, ownership_summary, ownership_source_url, revenue, revenue_currency, revenue_season, revenue_source_name, revenue_source_url, valuation, valuation_currency, valuation_year, valuation_source_name, valuation_source_url, social_followers, social_as_of, social_source_url, social_platforms, notes, sources, verification, source)
  values ('la-liga--athletic-club', 'Athletic Club', 'Athletic Bilbao', 'football', 'La Liga', 'Spain', 'Bilbao', 'San Mamés', 53331, 'https://www.footballgroundmap.com/list/biggest-football-stadiums-in-la-liga', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '[]'::jsonb, null, '["https://www.footballgroundmap.com/list/biggest-football-stadiums-in-la-liga"]'::jsonb, '[]'::jsonb, 'web_research')
  on conflict (external_key) do update set name = excluded.name, short_name = excluded.short_name, sport = excluded.sport, league = excluded.league, country = excluded.country, city = excluded.city, stadium = excluded.stadium, stadium_capacity = excluded.stadium_capacity, stadium_capacity_source_url = excluded.stadium_capacity_source_url, founded_year = excluded.founded_year, domain = excluded.domain, ownership_type = excluded.ownership_type, ownership_summary = excluded.ownership_summary, ownership_source_url = excluded.ownership_source_url, revenue = excluded.revenue, revenue_currency = excluded.revenue_currency, revenue_season = excluded.revenue_season, revenue_source_name = excluded.revenue_source_name, revenue_source_url = excluded.revenue_source_url, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, valuation_year = excluded.valuation_year, valuation_source_name = excluded.valuation_source_name, valuation_source_url = excluded.valuation_source_url, social_followers = excluded.social_followers, social_as_of = excluded.social_as_of, social_source_url = excluded.social_source_url, social_platforms = excluded.social_platforms, notes = excluded.notes, sources = excluded.sources, verification = excluded.verification, source = excluded.source;
