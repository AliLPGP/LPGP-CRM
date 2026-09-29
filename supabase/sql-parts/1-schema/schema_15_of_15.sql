-- schema: part 15 of 15
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

create table if not exists public.benchmarks (
  id           uuid primary key default gen_random_uuid(),
  external_key text unique,          -- class:strategy:metric:period:publisher
  asset_class  text not null,
  strategy     text,                 -- strategy key (lib/directory/strategies.ts) or null for the whole class
  metric       text not null,        -- fundraising_total | dry_powder | aum | median_net_irr | index_return | default_rate | spread_bps | deal_volume | fund_count | other
  label        text not null,        -- as the publisher words it
  value        numeric,
  unit         text,                 -- USD | EUR | GBP | pct | bps | x | count
  period       text,                 -- "2025", "Q2 2026", "vintage 2019", "12m to Jun 2026"
  geography    text,
  publisher    text,
  published_on date,
  source_url   text not null,
  note         text,
  source       text not null default 'web_research',
  created_at   timestamptz not null default now()
);
create index if not exists benchmarks_class_idx on public.benchmarks (asset_class, strategy);

drop trigger if exists sports_teams_set_updated_at on public.sports_teams;
create trigger sports_teams_set_updated_at
  before update on public.sports_teams
  for each row execute function public.set_updated_at();
drop trigger if exists sports_investors_set_updated_at on public.sports_investors;
create trigger sports_investors_set_updated_at
  before update on public.sports_investors
  for each row execute function public.set_updated_at();

alter table public.sports_investors   enable row level security;
alter table public.sports_teams       enable row level security;
alter table public.sports_team_owners enable row level security;
alter table public.deals              enable row level security;
alter table public.signals            enable row level security;
alter table public.benchmarks         enable row level security;

drop policy if exists "sports_investors_read" on public.sports_investors;
create policy "sports_investors_read" on public.sports_investors for select using (true);
drop policy if exists "sports_teams_read" on public.sports_teams;
create policy "sports_teams_read" on public.sports_teams for select using (true);
drop policy if exists "sports_team_owners_read" on public.sports_team_owners;
create policy "sports_team_owners_read" on public.sports_team_owners for select using (true);
drop policy if exists "deals_read" on public.deals;
create policy "deals_read" on public.deals for select using (true);
drop policy if exists "signals_read" on public.signals;
create policy "signals_read" on public.signals for select using (true);
drop policy if exists "benchmarks_read" on public.benchmarks;
create policy "benchmarks_read" on public.benchmarks for select using (true);


-- ##################################################################
-- ## One CFO/COO portfolio (0017)
-- ##################################################################
-- The three CFO/COO series fold into 'cfo-coo'. The app already reads the old
-- ids as that; this tidies stored choices. Idempotent.
update public.event_targets
   set series = 'cfo-coo'
 where series in ('cfo-private-markets', 'cfo-pe-debt', 'cfo-pe');
