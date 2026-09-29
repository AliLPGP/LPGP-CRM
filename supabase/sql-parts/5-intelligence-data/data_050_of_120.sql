-- data_050_of_120.sql: intelligence dataset 2026-09-29, part 50 of 120. Run in order; safe to re-run.

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--aston-villa'), 'V Sports (holding company)', 'company', false, null, 100, 2018, null, null, null, (select id from public.sports_investors where lower(name) = lower('V Sports (holding company)') limit 1), null, 'https://www.avfc.co.uk/news/2023/december/15/v-sports-announces-investment-from-atairos/');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--aston-villa'), 'Nassef Sawiris (via V Sports)', 'individual', false, null, 34, 2018, null, null, null, (select id from public.sports_investors where lower(name) = lower('Nassef Sawiris (via V Sports)') limit 1), null, 'https://en.wikipedia.org/wiki/V_Sports');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--aston-villa'), 'Wes Edens (via V Sports)', 'individual', false, null, 34, 2018, null, null, null, (select id from public.sports_investors where lower(name) = lower('Wes Edens (via V Sports)') limit 1), null, 'https://en.wikipedia.org/wiki/V_Sports');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--aston-villa'), 'Atairos (via V Sports)', 'fund', false, null, 32, 2024, null, null, null, (select id from public.sports_investors where lower(name) = lower('Atairos (via V Sports)') limit 1), null, 'https://en.wikipedia.org/wiki/V_Sports');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--aston-villa'), 'Atairos', 'fund', true, 'private_equity', 32, 2024, null, null, 500000000, (select id from public.sports_investors where lower(name) = lower('Atairos') limit 1), (select id from public.companies where lower(name) = lower('Atairos') limit 1), 'https://en.wikipedia.org/wiki/V_Sports');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth'), 'Black Knight Football Club (BKFC)', 'fund', false, null, 100, 2022, null, null, null, (select id from public.sports_investors where lower(name) = lower('Black Knight Football Club (BKFC)') limit 1), null, 'https://www.afcb.co.uk/news/club-news/afc-bournemouth-acquired-by-bill-foley-led-partnership/');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth'), 'Bill Foley (Managing General Partner, BKFC; club chairman)', 'individual', false, null, null, 2022, null, null, null, (select id from public.sports_investors where lower(name) = lower('Bill Foley (Managing General Partner, BKFC; club chairman)') limit 1), null, 'https://www.afcb.co.uk/news/club-news/afc-bournemouth-acquired-by-bill-foley-led-partnership/');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth'), 'Cannae Holdings Inc. (stake in BKFC)', 'company', false, null, 42.4, 2022, null, null, null, (select id from public.sports_investors where lower(name) = lower('Cannae Holdings Inc. (stake in BKFC)') limit 1), null, 'https://www.cannaeholdings.com/static-files/cb2a6132-fbee-491f-88aa-f7d1829f5c05');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth'), 'Michael B. Jordan (leads minority ownership group)', 'individual', false, null, null, 2022, null, null, null, (select id from public.sports_investors where lower(name) = lower('Michael B. Jordan (leads minority ownership group)') limit 1), null, 'https://www.espn.com/soccer/story/_/id/37634805/hollywood-star-michael-b-jordan-becomes-bournemouth-part-owner-us-businessman-takes-over');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth'), 'Ryan Sports Ventures (minority stake in BKFC)', 'family', false, null, null, 2023, null, null, null, (select id from public.sports_investors where lower(name) = lower('Ryan Sports Ventures (minority stake in BKFC)') limit 1), null, 'https://www.sportico.com/business/sales/2023/chicago-bears-investors-buy-bill-foleys-bournemouth-1234739606/');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth'), 'Cannae Holdings Inc.', 'fund', true, 'corporate', 42.4, 2022, 263000000, 'USD', null, (select id from public.sports_investors where lower(name) = lower('Cannae Holdings Inc.') limit 1), (select id from public.companies where lower(name) = lower('Cannae Holdings Inc.') limit 1), 'https://www.cannaeholdings.com/static-files/cb2a6132-fbee-491f-88aa-f7d1829f5c05');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth'), 'Ryan Sports Ventures', 'fund', true, 'family_office', null, 2023, null, null, null, (select id from public.sports_investors where lower(name) = lower('Ryan Sports Ventures') limit 1), (select id from public.companies where lower(name) = lower('Ryan Sports Ventures') limit 1), 'https://www.sportico.com/business/sales/2023/chicago-bears-investors-buy-bill-foleys-bournemouth-1234739606/');
