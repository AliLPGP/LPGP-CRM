-- data_053_of_120.sql: intelligence dataset 2026-09-29, part 53 of 120. Run in order; safe to re-run.

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--chelsea'), 'Clearlake Capital Group', 'fund', true, 'private_equity', 86.5, 2022, null, null, 4250000000, (select id from public.sports_investors where lower(name) = lower('Clearlake Capital Group') limit 1), (select id from public.companies where lower(name) = lower('Clearlake Capital Group') limit 1), 'https://www.espn.com/soccer/story/_/id/37628834/todd-boehly-completes-chelsea-takeover-deal-worth-425bn');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--chelsea'), 'Ares Management', 'fund', true, 'private_credit', null, 2023, 500000000, 'GBP', null, (select id from public.sports_investors where lower(name) = lower('Ares Management') limit 1), (select id from public.companies where lower(name) = lower('Ares Management') limit 1), 'https://www.bloomberg.com/news/articles/2023-09-22/chelsea-raises-500-million-of-financing-from-us-investor-ares');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--crystal-palace');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--crystal-palace'), 'Woody Johnson (Robert Wood Johnson IV)', 'individual', false, null, 43, 2025, null, null, null, (select id from public.sports_investors where lower(name) = lower('Woody Johnson (Robert Wood Johnson IV)') limit 1), null, 'https://www.nfl.com/news/jets-owner-woody-johnson-buys-43-stake-in-english-soccer-club-crystal-palace');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--crystal-palace'), 'Josh Harris', 'individual', false, null, 18, 2015, null, null, null, (select id from public.sports_investors where lower(name) = lower('Josh Harris') limit 1), null, 'https://www.wearepalace.uk/club/owners/');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--crystal-palace'), 'David Blitzer', 'individual', false, null, 18, 2015, null, null, null, (select id from public.sports_investors where lower(name) = lower('David Blitzer') limit 1), null, 'https://www.wearepalace.uk/club/owners/');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--crystal-palace'), 'Steve Parish', 'individual', false, null, 10, 2010, null, null, null, (select id from public.sports_investors where lower(name) = lower('Steve Parish') limit 1), null, 'https://www.wearepalace.uk/club/owners/');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--everton');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--everton'), 'The Friedkin Group (Dan Friedkin)', 'company', false, null, 98.8, 2024, null, null, null, (select id from public.sports_investors where lower(name) = lower('The Friedkin Group (Dan Friedkin)') limit 1), null, 'https://www.espn.com/soccer/story/_/id/42952286/everton-get-us-owners-friedkin-group-takeover-completed');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--everton'), 'The Friedkin Group', 'fund', true, 'corporate', 98.8, 2024, 400000000, 'GBP', null, (select id from public.sports_investors where lower(name) = lower('The Friedkin Group') limit 1), (select id from public.companies where lower(name) = lower('The Friedkin Group') limit 1), 'https://www.skysports.com/football/news/11095/13275439/everton-takeover-the-friedkin-group-complete-deal-to-become-clubs-new-owners');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--liverpool');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--manchester-city');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--manchester-united');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--newcastle-united');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--nottingham-forest');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--tottenham-hotspur');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--west-ham-united');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--wolverhampton-wanderers');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'primeira-liga--s-l-benfica');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'primeira-liga--fc-porto');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'primeira-liga--sporting-cp');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'primeira-liga--s-c-braga');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'saudi-pro-league--al-hilal');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--atalanta');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--bologna');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--cagliari');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--como');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--inter-milan');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--juventus');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--lazio');
