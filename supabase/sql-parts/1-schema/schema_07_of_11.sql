-- schema: part 7 of 11
-- Run the parts in order. Each one is whole statements, so a part
-- never ends mid-statement. Safe to re-run.

-- --- Lead columns the sales workflow needs ---------------------------------
alter table public.leads
  add column if not exists disposition      text,          -- last call outcome
  add column if not exists callback_at      timestamptz,   -- scheduled call-back
  add column if not exists last_activity_at timestamptz,
  add column if not exists call_count       integer not null default 0,
  add column if not exists do_not_call      boolean not null default false,
  add column if not exists priority         text not null default 'Normal',
  add column if not exists website          text,
  add column if not exists country          text,
  add column if not exists title            text,          -- free-text deal title
  add column if not exists import_id        uuid references public.lead_imports (id) on delete set null,
  add column if not exists account_id       uuid references public.accounts (id) on delete set null,
  add column if not exists ops_deal_id      integer,       -- confirmed tracker deal
  add column if not exists ops_checked_at   timestamptz;   -- last time we asked the bridge

create index if not exists leads_callback_idx on public.leads (callback_at) where callback_at is not null;
create index if not exists leads_activity_idx on public.leads (last_activity_at desc nulls last);
create index if not exists leads_name_idx     on public.leads (lower(company_name));

-- --- Notes can attach to an account too ------------------------------------
alter table public.notes drop constraint if exists notes_entity_type_check;
alter table public.notes
  add constraint notes_entity_type_check
  check (entity_type in ('company', 'contact', 'lead', 'account'));

-- --- Row level security ----------------------------------------------------
-- Same posture as the rest of the app: anon may READ, every write goes through
-- the service-role key in server code.
alter table public.accounts         enable row level security;
alter table public.account_contacts enable row level security;
alter table public.activities       enable row level security;
alter table public.tasks            enable row level security;
alter table public.ops_links        enable row level security;
alter table public.lead_imports     enable row level security;

drop policy if exists "accounts_read" on public.accounts;
create policy "accounts_read" on public.accounts for select using (true);

drop policy if exists "account_contacts_read" on public.account_contacts;
create policy "account_contacts_read" on public.account_contacts for select using (true);

drop policy if exists "activities_read" on public.activities;
create policy "activities_read" on public.activities for select using (true);

drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks for select using (true);

drop policy if exists "ops_links_read" on public.ops_links;
create policy "ops_links_read" on public.ops_links for select using (true);

drop policy if exists "lead_imports_read" on public.lead_imports;
create policy "lead_imports_read" on public.lead_imports for select using (true);
