-- data_054_of_120.sql: intelligence dataset 2026-09-29, part 54 of 120. Run in order; safe to re-run.

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--lecce');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--ac-milan');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--napoli');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--parma');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--pisa');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--roma');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--sassuolo');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--torino');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'serie-a--udinese');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'super-lig--galatasaray');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'super-lig--fenerbahce');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'super-lig--besiktas');

insert into public.deals (external_key, date, date_text, kind, asset_class, sport, target, target_kind, target_country, target_team_id, target_company_id, investor, investor_type, investor_company_id, investor_id, seller, stake_pct, amount, currency, valuation, valuation_currency, headline, summary, source_name, source_url, source)
  values ('deal:afc-bournemouth:peak6-investments:november-2015', null, 'November 2015', 'minority_investment', 'sports', 'football', 'AFC Bournemouth', 'club', 'England', (select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth'), null, 'Peak6 Investments', 'private_equity', (select id from public.companies where lower(name) = lower('Peak6 Investments') limit 1), (select id from public.sports_investors where lower(name) = lower('Peak6 Investments') limit 1), 'Maxim Demin', 25, null, null, null, null, 'Peak6 Investments acquires 25% of AFC Bournemouth', 'Chicago-based Peak6 Investments bought a 25% stake in AFC Bournemouth from owner Maxim Demin in November 2015; the amount was not disclosed.', 'iSportConnect', 'https://www.isportconnect.com/afc-bournemouth-confirm-deal-with-peak6-investments-for-25-stake/', 'web_research')
  on conflict (external_key) do update set date = excluded.date, date_text = excluded.date_text, kind = excluded.kind, asset_class = excluded.asset_class, sport = excluded.sport, target = excluded.target, target_kind = excluded.target_kind, target_country = excluded.target_country, target_team_id = excluded.target_team_id, target_company_id = excluded.target_company_id, investor = excluded.investor, investor_type = excluded.investor_type, investor_company_id = excluded.investor_company_id, investor_id = excluded.investor_id, seller = excluded.seller, stake_pct = excluded.stake_pct, amount = excluded.amount, currency = excluded.currency, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, headline = excluded.headline, summary = excluded.summary, source_name = excluded.source_name, source_url = excluded.source_url, source = excluded.source;

insert into public.deals (external_key, date, date_text, kind, asset_class, sport, target, target_kind, target_country, target_team_id, target_company_id, investor, investor_type, investor_company_id, investor_id, seller, stake_pct, amount, currency, valuation, valuation_currency, headline, summary, source_name, source_url, source)
  values ('deal:afc-bournemouth:maxim-demin-afcb-enterprises-ltd:january-2019', null, 'January 2019', 'stake_sale', 'sports', 'football', 'AFC Bournemouth', 'club', 'England', (select id from public.sports_teams where external_key = 'premier-league--afc-bournemouth'), null, 'Maxim Demin (AFCB Enterprises Ltd)', 'individual', (select id from public.companies where lower(name) = lower('Maxim Demin (AFCB Enterprises Ltd)') limit 1), (select id from public.sports_investors where lower(name) = lower('Maxim Demin (AFCB Enterprises Ltd)') limit 1), 'Peak6 Football Holdings LLC', 25, null, null, null, null, 'Maxim Demin buys back Peak6''s 25% stake, retakes full ownership', 'Peak6 sold its 25% shareholding back to Maxim Demin in January 2019, leaving AFC Bournemouth Limited 100% owned by Demin''s AFCB Enterprises Ltd. Terms were not disclosed.', 'Sky Sports', 'https://www.skysports.com/football/news/11743/11620686/maxim-demin-retakes-full-ownership-of-bournemouth', 'web_research')
  on conflict (external_key) do update set date = excluded.date, date_text = excluded.date_text, kind = excluded.kind, asset_class = excluded.asset_class, sport = excluded.sport, target = excluded.target, target_kind = excluded.target_kind, target_country = excluded.target_country, target_team_id = excluded.target_team_id, target_company_id = excluded.target_company_id, investor = excluded.investor, investor_type = excluded.investor_type, investor_company_id = excluded.investor_company_id, investor_id = excluded.investor_id, seller = excluded.seller, stake_pct = excluded.stake_pct, amount = excluded.amount, currency = excluded.currency, valuation = excluded.valuation, valuation_currency = excluded.valuation_currency, headline = excluded.headline, summary = excluded.summary, source_name = excluded.source_name, source_url = excluded.source_url, source = excluded.source;
