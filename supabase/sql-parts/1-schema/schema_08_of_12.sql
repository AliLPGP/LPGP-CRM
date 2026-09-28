-- schema: part 8 of 12
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- ##################################################################
-- ## Event revenue targets, keyed to the ops panel's events (0009)
-- ##################################################################

create table if not exists public.event_targets (
  id               uuid primary key default gen_random_uuid(),
  -- TrackerLPGP portfolio_events.id -- an integer in another database, so no FK.
  ops_event_id     integer not null unique,
  -- Snapshot of the tracker's name, so the page still reads sensibly when the
  -- bridge is unreachable.
  event_name       text,
  -- Programme series ("portfolio"): private-debt, cfo-private-markets, ...
  series           text,
  target_amount    numeric,
  target_currency  text not null default 'GBP',
  target_sponsors  integer,
  notes            text,
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists event_targets_series_idx on public.event_targets (series);

drop trigger if exists event_targets_set_updated_at on public.event_targets;
create trigger event_targets_set_updated_at
  before update on public.event_targets
  for each row execute function public.set_updated_at();

alter table public.event_targets enable row level security;
drop policy if exists "event_targets_read" on public.event_targets;
create policy "event_targets_read" on public.event_targets for select using (true);


-- ##################################################################
-- ## Which event(s) a lead is being pursued for (0010)
-- ##################################################################

alter table public.leads
  add column if not exists target_events jsonb not null default '[]'::jsonb;

-- Lets "who else has this event in their pipeline?" use the index rather than
-- scanning every lead's JSON.
create index if not exists leads_target_events_idx
  on public.leads using gin (target_events jsonb_path_ops);


-- ##################################################################
-- ## Link CRM users to the ops panel's deal initials (0011)
-- ##################################################################

alter table public.profiles
  add column if not exists initials text;

-- Two people can't share initials, or "who signed this?" has two answers.
-- Case-insensitive, and NULLs are allowed (not everyone signs deals).
create unique index if not exists profiles_initials_unique
  on public.profiles (upper(initials)) where initials is not null;


-- ##################################################################
-- ## A person can claim an ops-panel deal as their own (0012)
-- ##################################################################

alter table public.ops_links drop constraint if exists ops_links_entity_type_check;
alter table public.ops_links
  add constraint ops_links_entity_type_check
  check (entity_type in ('lead', 'account', 'company', 'user'));
