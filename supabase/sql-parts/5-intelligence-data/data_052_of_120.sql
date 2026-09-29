-- data_052_of_120.sql: intelligence dataset 2026-09-29, part 52 of 120. Run in order; safe to re-run.

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--burnley'), 'Alan Pace', 'individual', false, null, null, 2020, null, null, null, (select id from public.sports_investors where lower(name) = lower('Alan Pace') limit 1), null, 'https://burnleyfootballclub.com/legal-information/legal-information-company-details');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--burnley'), 'Mike Smith', 'individual', false, null, null, 2020, null, null, null, (select id from public.sports_investors where lower(name) = lower('Mike Smith') limit 1), null, 'https://burnleyfootballclub.com/legal-information/legal-information-company-details');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--burnley'), 'Stuart Hunt', 'individual', false, null, null, 2020, null, null, null, (select id from public.sports_investors where lower(name) = lower('Stuart Hunt') limit 1), null, 'https://burnleyfootballclub.com/legal-information/legal-information-company-details');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--burnley'), 'JJ Watt and Kealia Watt', 'individual', false, null, null, 2023, null, null, null, (select id from public.sports_investors where lower(name) = lower('JJ Watt and Kealia Watt') limit 1), null, 'https://frontofficesports.com/jj-watt-kealia-watt-invest-in-burnley-fc-english-premier-league/');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--burnley'), 'Malcolm Jenkins (Malcolm Inc.)', 'individual', false, null, null, 2021, null, null, null, (select id from public.sports_investors where lower(name) = lower('Malcolm Jenkins (Malcolm Inc.)') limit 1), null, 'https://www.neworleanssaints.com/news/new-orleans-saints-safety-malcolm-jenkins-becomes-minority-investor-in-burnley-f');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--burnley'), 'ALK Capital / Velocity Sports Partners', 'fund', true, 'private_equity', 84, 2020, 170000000, 'GBP', null, (select id from public.sports_investors where lower(name) = lower('ALK Capital / Velocity Sports Partners') limit 1), (select id from public.companies where lower(name) = lower('ALK Capital / Velocity Sports Partners') limit 1), 'https://www.sportico.com/business/sales/2021/alk-capital-burnley-debt-1234621513/');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--burnley'), 'Cynosure | Checketts Sports Capital (investment into ALK Capital, the club''s parent)', 'fund', true, 'private_equity', null, 2025, 200000000, 'USD', null, (select id from public.sports_investors where lower(name) = lower('Cynosure | Checketts Sports Capital (investment into ALK Capital, the club''s parent)') limit 1), (select id from public.companies where lower(name) = lower('Cynosure | Checketts Sports Capital (investment into ALK Capital, the club''s parent)') limit 1), 'https://alkcapital.com/2025/11/alk-capital-and-cynosure-checketts-sports-capital-reunite-in-significant-strategic-investment-across-european-football/');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--burnley'), 'MSD UK Holdings (lender, Michael Dell family office)', 'fund', true, 'private_credit', null, 2020, 65000000, 'GBP', null, (select id from public.sports_investors where lower(name) = lower('MSD UK Holdings (lender, Michael Dell family office)') limit 1), (select id from public.companies where lower(name) = lower('MSD UK Holdings (lender, Michael Dell family office)') limit 1), 'https://www.sportico.com/business/sales/2021/alk-capital-burnley-debt-1234621513/');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--chelsea');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--chelsea'), 'Clearlake Capital Group', 'fund', false, null, 86.5, 2022, null, null, null, (select id from public.sports_investors where lower(name) = lower('Clearlake Capital Group') limit 1), null, 'https://www.espn.com/soccer/story/_/id/49960706/chelsea-clarlake-capital-todd-boehly-mark-walter-ownership');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--chelsea'), 'Hansjörg Wyss', 'individual', false, null, 13.5, 2022, null, null, null, (select id from public.sports_investors where lower(name) = lower('Hansjörg Wyss') limit 1), null, 'https://www.espn.com/soccer/story/_/id/49960706/chelsea-clarlake-capital-todd-boehly-mark-walter-ownership');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--chelsea'), 'Clearlake Capital Group', 'fund', true, 'private_equity', 86.5, 2022, null, null, 4250000000, (select id from public.sports_investors where lower(name) = lower('Clearlake Capital Group') limit 1), (select id from public.companies where lower(name) = lower('Clearlake Capital Group') limit 1), 'https://www.espn.com/soccer/story/_/id/37628834/todd-boehly-completes-chelsea-takeover-deal-worth-425bn');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--chelsea'), 'Ares Management', 'fund', true, 'private_credit', null, 2023, 500000000, 'GBP', null, (select id from public.sports_investors where lower(name) = lower('Ares Management') limit 1), (select id from public.companies where lower(name) = lower('Ares Management') limit 1), 'https://www.bloomberg.com/news/articles/2023-09-22/chelsea-raises-500-million-of-financing-from-us-investor-ares');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--crystal-palace');
