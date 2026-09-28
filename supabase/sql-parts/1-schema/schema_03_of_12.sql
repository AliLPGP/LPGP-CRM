-- schema: part 3 of 12
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

alter table public.service_relationships enable row level security;

drop policy if exists "funds_read" on public.funds;
create policy "funds_read" on public.funds for select using (true);

drop policy if exists "commitments_read" on public.commitments;
create policy "commitments_read" on public.commitments for select using (true);

drop policy if exists "service_rel_read" on public.service_relationships;
create policy "service_rel_read" on public.service_relationships for select using (true);

drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies for select using (true);

drop policy if exists "contacts_read" on public.contacts;
create policy "contacts_read" on public.contacts for select using (true);

drop policy if exists "notes_read" on public.notes;
create policy "notes_read" on public.notes for select using (true);

-- ###########################################################################
-- ## CRM: auth profiles + leads pipeline
-- ###########################################################################

-- --- Profiles (one row per Supabase Auth user) -----------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'member',   -- 'member' | 'admin'
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select using (true);

-- Auto-create a profile whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that already exist.
insert into public.profiles (id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- --- Lead pipeline stages --------------------------------------------------
do $$ begin
  create type lead_stage as enum ('New', 'Contacted', 'Discussing', 'Proposal Sent', 'Confirmed', 'Blown Out');
exception
  when duplicate_object then null;
end $$;
