-- data_051_of_120.sql: intelligence dataset 2026-09-29, part 51 of 120. Run in order; safe to re-run.

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth'), 'Goldman Sachs (senior secured credit facility, lender)', 'fund', true, 'private_credit', null, 2024, null, null, null, (select id from public.sports_investors where lower(name) = lower('Goldman Sachs (senior secured credit facility, lender)') limit 1), (select id from public.companies where lower(name) = lower('Goldman Sachs (senior secured credit facility, lender)') limit 1), 'https://theesk.org/2026/05/11/the-analysis-series-afc-bournemouth-limited-annual-report-and-financial-statements-for-the-year-ended-30-june-2025/');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--brentford');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--brentford'), 'Matthew Benham (via Best Intentions Analytics Limited)', 'individual', false, null, null, 2012, null, null, null, (select id from public.sports_investors where lower(name) = lower('Matthew Benham (via Best Intentions Analytics Limited)') limit 1), null, 'https://www.brentfordfc.com/en/news/article/club-news-brentford-new-investment-gary-lubner-sir-matthew-vaughn');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--brentford'), 'Gary Lubner (via This Day Sports and Media Limited)', 'individual', false, null, null, 2025, null, null, null, (select id from public.sports_investors where lower(name) = lower('Gary Lubner (via This Day Sports and Media Limited)') limit 1), null, 'https://www.brentfordfc.com/en/news/article/club-news-brentford-new-investment-gary-lubner-sir-matthew-vaughn');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--brentford'), 'Sir Matthew Vaughn (via MARV Bee Limited)', 'individual', false, null, null, 2025, null, null, null, (select id from public.sports_investors where lower(name) = lower('Sir Matthew Vaughn (via MARV Bee Limited)') limit 1), null, 'https://www.brentfordfc.com/en/news/article/club-news-brentford-new-investment-gary-lubner-sir-matthew-vaughn');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--brentford'), 'Prakash Melwani', 'individual', false, null, null, 2026, null, null, null, (select id from public.sports_investors where lower(name) = lower('Prakash Melwani') limit 1), null, 'https://www.brentfordfc.com/en/news/club-news-brentford-announces-further-investment-prakash-melwani-sir-lucian-grainge-cbe');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--brentford'), 'Sir Lucian Grainge', 'individual', false, null, null, 2026, null, null, null, (select id from public.sports_investors where lower(name) = lower('Sir Lucian Grainge') limit 1), null, 'https://www.brentfordfc.com/en/news/club-news-brentford-announces-further-investment-prakash-melwani-sir-lucian-grainge-cbe');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--brentford'), 'This Day Sports and Media Limited (Gary Lubner)', 'fund', true, 'other', null, 2025, null, null, 400000000, (select id from public.sports_investors where lower(name) = lower('This Day Sports and Media Limited (Gary Lubner)') limit 1), (select id from public.companies where lower(name) = lower('This Day Sports and Media Limited (Gary Lubner)') limit 1), 'https://www.sportspro.com/news/brentford-investment-gary-lubner-matthew-vaughn-benham-july-2025/');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--brentford'), 'MARV Bee Limited (Sir Matthew Vaughn)', 'fund', true, 'other', null, 2025, null, null, 400000000, (select id from public.sports_investors where lower(name) = lower('MARV Bee Limited (Sir Matthew Vaughn)') limit 1), (select id from public.companies where lower(name) = lower('MARV Bee Limited (Sir Matthew Vaughn)') limit 1), 'https://www.sportspro.com/news/brentford-investment-gary-lubner-matthew-vaughn-benham-july-2025/');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--brighton-hove-albion');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--brighton-hove-albion'), 'Tony Bloom', 'individual', false, null, 75, 2009, null, null, null, (select id from public.sports_investors where lower(name) = lower('Tony Bloom') limit 1), null, 'https://www.sussexexpress.co.uk/sport/football/brighton-and-hove-albion/revealed-the-staggering-amount-brighton-owner-tony-bloom-has-invested-in-albion-1334468');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--brighton-hove-albion'), 'Paul Barber', 'individual', false, null, 1.5, 2025, null, null, null, (select id from public.sports_investors where lower(name) = lower('Paul Barber') limit 1), null, 'https://www.brightonandhovealbion.com/media-article/club-news-paul-barber-investment-tony-bloom-august-2025');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--burnley');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--burnley'), 'Velocity Sports Partners (ALK Capital)', 'fund', false, null, 84, 2020, null, null, null, (select id from public.sports_investors where lower(name) = lower('Velocity Sports Partners (ALK Capital)') limit 1), null, 'https://alkcapital.com/2023/09/alk-capital-completes-investment-in-burnley-fc/');
