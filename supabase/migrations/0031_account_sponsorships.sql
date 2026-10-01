-- 0031: what a sponsor paid, per year, as the sales team's own sponsor lists
-- state it. One row per account per year: the total, the number of deals
-- behind it, and the currency (money is per currency, never cross-summed).
--
-- This is the SALES LIST's record. The ops panel stays the source of truth
-- for money; where an account is linked to tracker deals, the tracker's own
-- figures win and these rows are the history from before the link. Row level
-- security is on with NO policy: the anon key cannot read it, the app reads
-- it on the server with the service role. Safe to re-run.
create table if not exists public.account_sponsorships (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  year        integer not null check (year between 2000 and 2100),
  amount      numeric,                         -- null when the list shows a deal with no amount
  currency    text not null default 'GBP',
  deals       integer not null default 1,
  source      text not null default 'sponsor list',
  created_at  timestamptz not null default now(),
  unique (account_id, year, currency)
);
create index if not exists account_sponsorships_account_idx on public.account_sponsorships (account_id);
alter table public.account_sponsorships enable row level security;
