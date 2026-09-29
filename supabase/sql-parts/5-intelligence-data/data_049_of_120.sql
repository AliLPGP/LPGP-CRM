-- data_049_of_120.sql: intelligence dataset 2026-09-29, part 49 of 120. Run in order; safe to re-run.

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'la-liga--elche-cf');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'la-liga--rcd-espanyol');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'la-liga--real-madrid-cf');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'la-liga--real-sociedad');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'la-liga--sevilla-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'la-liga--valencia-cf');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'ligue-1--paris-saint-germain');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'ligue-1--olympique-de-marseille');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'ligue-1--ogc-nice');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'ligue-1--lille-osc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'ligue-1--olympique-lyonnais');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'ligue-1--rc-strasbourg-alsace');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'ligue-1--rc-lens');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'ligue-1--toulouse-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'ligue-1--stade-rennais-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'ligue-1--le-havre-ac');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--atlanta-united-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--austin-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--cf-montreal');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--charlotte-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--chicago-fire-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--colorado-rapids');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--columbus-crew');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--d-c-united');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--fc-cincinnati');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--fc-dallas');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--houston-dynamo-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--inter-miami-cf');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--la-galaxy');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--los-angeles-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--minnesota-united-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--nashville-sc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--new-england-revolution');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--new-york-city-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--new-york-red-bulls');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--orlando-city-sc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--philadelphia-union');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--portland-timbers');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--real-salt-lake');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--san-diego-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--san-jose-earthquakes');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--seattle-sounders-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--sporting-kansas-city');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--st-louis-city-sc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--toronto-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'major-league-soccer--vancouver-whitecaps-fc');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--arsenal');

insert into public.sports_team_owners (team_id, name, kind, institutional, investor_type, stake_pct, since_year, amount, currency, valuation_at_entry, investor_id, company_id, source_url)
  values ((select id from public.sports_teams where external_key = 'premier-league--arsenal'), 'Stan Kroenke / Kroenke Sports & Entertainment (KSE UK Inc)', 'individual', false, null, 100, 2018, null, null, null, (select id from public.sports_investors where lower(name) = lower('Stan Kroenke / Kroenke Sports & Entertainment (KSE UK Inc)') limit 1), null, 'https://en.wikipedia.org/wiki/Ownership_of_Arsenal_F.C._&_W.F.C.');

delete from public.sports_team_owners where team_id = (select id from public.sports_teams where external_key = 'premier-league--aston-villa');
